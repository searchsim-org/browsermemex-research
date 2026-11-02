import fs from 'node:fs/promises';import crypto from 'node:crypto';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import{NuggetStore}from '../vendor/core/src/memory/nugget-store.js';import{SqliteStore}from '../vendor/core/src/memory/storage/sqlite.js';
import{configureLookupIndex}from '../lookup-index.mjs';
const root=new URL('../',import.meta.url),path=new URL('data/external/longmemeval_s_cleaned.json',root),bytes=await fs.readFile(path),data=JSON.parse(bytes),sqlite=await sqlite3InitModule(),initModule=async()=>sqlite;
const providedHistory=process.argv.includes('--provided-history');const prefix=providedHistory?'longmemeval-provided':'longmemeval';
function timestamp(s){const m=String(s).match(/(\d{4})\/(\d{2})\/(\d{2}).*?(\d{2}):(\d{2})/);if(!m)throw Error(`Unrecognized timestamp: ${s}`);return Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);}
const outcomes=[];let allSessions=0;const start=performance.now();
for(const [index,item]of data.entries()){
 const store=new NuggetStore({storage:new SqliteStore({initModule})});await store.open();configureLookupIndex(store);
 const time=timestamp(item.question_date),n=item.haystack_sessions.length;
 const ordering=Array.from({length:n},(_,i)=>i).sort((a,b)=>timestamp(item.haystack_dates[a])-timestamp(item.haystack_dates[b]));let futureSessions=0;
 for(const i of ordering){
  const at=timestamp(item.haystack_dates[i]);if(at>time){futureSessions++;if(!providedHistory)continue;}
  const id=item.haystack_session_ids[i];const text=item.haystack_sessions[i].map(turn=>`${turn.role}: ${turn.content}`).join('\n');
  store.insert({id,kind:'EpisodicEvent',fact:{subject:id,predicate:'session',object:text},canonicalText:text,validity:{start:providedHistory?0:at,end:null,scope:'shared'},epistemic:{status:'Active',rank:'Normal',confidence:1},provenance:[{sourceUrl:`https://benchmark.example.invalid/longmemeval/${item.question_id}/${id}`,extractedAt:at}],createdAt:at});allSessions++;
 }
 const tokens=String(item.question).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(t=>`"${t}"`).join(' OR ');
 const qstart=performance.now(),actual=store.query(item.question,{time,scope:'shared',topK:10}).map(x=>x.nugget.id),latencyMs=performance.now()-qstart;
 const policies={unexpired:actual};
 for(const ttl of [null,7,30,90]){
  const bind={$match:tokens,$time:time};if(ttl!==null)bind.$cut=time-ttl*86400000;
  const hits=store.storage.exec({sql:`SELECT n.id,bm25(nugget_fts) AS score FROM nugget_fts JOIN nuggets n ON n.rowid=nugget_fts.rowid WHERE nugget_fts MATCH $match AND n.validity_start<=$time ${ttl!==null?'AND n.created_at > $cut':''} ORDER BY score LIMIT 10`,bind,returnValue:'resultRows',rowMode:'object'}).map(x=>x.id);
  if(ttl===null&&JSON.stringify(hits)!==JSON.stringify(actual))throw Error('Matched temporal BM25 adapter mismatch');
  if(ttl!==null)policies[`ttl${ttl}`]=hits;
 }
 const gold=item.answer_session_ids??[],abs=item.question_id.endsWith('_abs');
 const scores=Object.fromEntries(Object.entries(policies).map(([method,ids])=>[method,{retrieved:ids,recall5:gold.length?gold.filter(id=>ids.slice(0,5).includes(id)).length/gold.length:null,recall10:gold.length?gold.filter(id=>ids.includes(id)).length/gold.length:null,allEvidence10:gold.length?Number(gold.every(id=>ids.includes(id))):null}]));
 outcomes.push({questionId:item.question_id,type:item.question_type,abstention:abs,evidenceSessionIds:gold,sessions:n,storedSessions:store.count(),futureSessions,latencyMs,scores});store.close();
 if((index+1)%25===0){await fs.writeFile(new URL(`results/${prefix}-outcomes.json`,root),JSON.stringify(outcomes));console.log('Completed',index+1,'/',data.length);}
}
const eligible=outcomes.filter(x=>!x.abstention&&x.evidenceSessionIds.length);const summary={};
for(const method of Object.keys(eligible[0].scores))summary[method]=Object.fromEntries(['recall5','recall10','allEvidence10'].map(metric=>[metric,eligible.reduce((s,x)=>s+x.scores[method][metric],0)/eligible.length]));
const metadata={sourceUrl:'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),providedHistory,questions:data.length,eligible:eligible.length,abstention:outcomes.filter(x=>x.abstention).length,insertedSessions:allSessions,elapsedMs:performance.now()-start,summary};
await fs.writeFile(new URL(`results/${prefix}-outcomes.json`,root),JSON.stringify(outcomes));await fs.writeFile(new URL(`results/${prefix}-summary.json`,root),JSON.stringify(metadata,null,2));console.log(JSON.stringify(metadata,null,2));
