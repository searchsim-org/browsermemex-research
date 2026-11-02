import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {createReplay,score} from '../adapters.mjs';
import {summarizeRows,DAY,T0} from '../benchmark.mjs';

const root=new URL('../',import.meta.url),sqlite=await sqlite3InitModule();
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const methods=['active','all-states','all-states-recency','episode-bm25-time','episode-latest-valid'];
const slices=['all','current','historical','unknown'],seeds=[27001,27002,27003,27004,27005];
const results={protocol:'ABLATION-PROTOCOL.md',postAudit:true,started:new Date().toISOString(),node:process.version,sqlite:sqlite.capi.sqlite3_libversion(),methods,seeds,inputHashes:{},settings:{},queryInstances:0,methodOutcomes:0};
for(const file of ['ABLATION-PROTOCOL.md','scripts/mechanism-ablation.mjs','adapters.mjs','vendor/core/src/memory/nugget-store.js','vendor/core/src/memory/algorithms/conflicts.js'])results.inputHashes[file]=hash(await fs.readFile(new URL(file,root)));
const original=new Map(),strong=new Map();
for(const [file,target,wanted]of [['results/query-outcomes.jsonl',original,'webnugget'],['results/strong-controls-outcomes.jsonl',strong,'latest-valid']]){
 const bytes=await fs.readFile(new URL(file,root));results.inputHashes[file]=hash(bytes);
 for(const line of bytes.toString().trim().split('\n')){const r=JSON.parse(line);if(r.method===wanted)target.set(`${r.metadata}|${r.noise}|${r.seed}|${r.id}`,r);}
}
const flat=[],insertions=[];
const counts=()=>({queries:0,answerable:0,correctObservedEligible:0,correctStoredValue:0,correctStoredEligible:0,correctActiveEligible:0,storageEligibilityLoss:0,storageLostValue:0,storageLostInterval:0,storageLossAllEpisodesMerged:0,storageLossWithNonmergedEpisode:0,statusExclusion:0});
const aggregate=arr=>{const mean=arr.reduce((a,b)=>a+b,0)/arr.length;const variance=arr.reduce((s,x)=>s+(x-mean)**2,0)/(arr.length-1);return{mean,ci95HalfWidth:2.776445*Math.sqrt(variance/arr.length),worlds:arr.length};};
for(const metadata of ['oracle','ttl'])for(const noise of [0,.1]){
 const label=`${metadata}-noise${noise}`,worlds=[];
 for(const seed of seeds){
  const file=`data/${label}-seed${seed}.json`,bytes=await fs.readFile(new URL(file,root));results.inputHashes[file]=hash(bytes);
  const data=JSON.parse(bytes),replay=await createReplay(async()=>sqlite),storage=replay.memory.storage;
  const exec=storage.exec.bind(storage);let captured=null;
  storage.exec=function(options,...args){if(options?.sql?.includes('bm25(nugget_fts)')&&options.sql.includes("n.status = 'Active'"))captured={...options,bind:{...options.bind}};return exec(options,...args);};
  const by=Object.fromEntries(methods.map(m=>[m,[]])),diagnostics=[],checkpoints=[],observed=new Map(),insertionDecisions=new Map();let cursor=0,lastTime=null;
  for(const q of data.queries){
   while(cursor<data.observations.length&&data.observations[cursor].observedAt<=q.knowledgeTime){const o=data.observations[cursor++];const key=`${o.subject}|${o.predicate}`;if(!observed.has(key))observed.set(key,[]);observed.get(key).push(o);const insertion=replay.insert(o);insertionDecisions.set(o.id,insertion);insertions.push({metadata,noise,seed,observationId:o.id,observedAt:o.observedAt,...insertion});}
   if(lastTime!==q.knowledgeTime){checkpoints.push({knowledgeTime:q.knowledgeTime,inserted:cursor,statuses:exec({sql:'SELECT status,COUNT(*) AS n FROM nuggets GROUP BY status',returnValue:'resultRows',rowMode:'object'})});lastTime=q.knowledgeTime;}
   captured=null;const active=replay.retrieve('webnugget',q);assert(captured);
   const activeSql=exec(captured);assert.deepEqual(activeSql.map(x=>x.id),active.map(x=>x.id));
   const allSql=captured.sql.replace("AND n.status = 'Active'",'AND 1=1');assert.notEqual(allSql,captured.sql);
   const all=exec({...captured,sql:allSql});
   const recent=exec({...captured,sql:allSql.replace('ORDER BY bm25_score','ORDER BY bm25_score, n.validity_start DESC, n.created_at DESC, n.id ASC')});
   const hits={active,'all-states':all,'all-states-recency':recent,'episode-bm25-time':replay.retrieve('bm25-time',q),'episode-latest-valid':replay.retrieve('latest-valid',q)};
   const scores={};
   for(const method of methods){const r={...score(q,hits[method]),metadata,noise,seed,method};by[method].push(r);scores[method]=r;flat.push(r);}
   const key=`${metadata}|${noise}|${seed}|${q.id}`;
   for(const [name,target]of [['active',original],['episode-latest-valid',strong]])for(const field of ['predicted','goldInHits','returned','relevantReturned','relevantCorrect'])assert.equal(scores[name][field],target.get(key)?.[field],`${key} ${name} ${field}`);
   const d={id:q.id,kind:q.kind,gold:q.gold,answerable:q.gold!==null};
   if(d.answerable){
    const raw=(observed.get(`${q.subject}|${q.predicate}`)??[]).filter(o=>o.value===q.gold&&o.validFrom<=q.validTime&&o.validUntil>q.validTime);
    const rows=exec({sql:"SELECT id,object,status,validity_start,validity_end FROM nuggets WHERE subject=$s AND predicate=$p AND scope='shared' AND tier IN ('profile','shared')",bind:{$s:q.subject,$p:q.predicate},returnValue:'resultRows',rowMode:'object'});
    const correct=rows.filter(r=>r.object===q.gold),eligible=correct.filter(r=>r.validity_start<=q.validTime&&(r.validity_end===null||r.validity_end>q.validTime));
    Object.assign(d,{correctObservedEligible:raw.length>0,correctStoredValue:correct.length>0,correctStoredEligible:eligible.length>0,correctActiveEligible:eligible.some(r=>r.status==='Active'),rawCorrectIds:raw.map(x=>x.id),storedCorrect:correct});
    d.storageEligibilityLoss=d.correctObservedEligible&&!d.correctStoredEligible;d.storageLostValue=d.storageEligibilityLoss&&!d.correctStoredValue;d.storageLostInterval=d.storageEligibilityLoss&&d.correctStoredValue;d.statusExclusion=d.correctStoredEligible&&!d.correctActiveEligible;
    d.correctEpisodeDecisions=raw.map(o=>({observationId:o.id,...insertionDecisions.get(o.id)}));d.storageLossAllEpisodesMerged=d.storageEligibilityLoss&&d.correctEpisodeDecisions.every(x=>x.outcome==='merged');d.storageLossWithNonmergedEpisode=d.storageEligibilityLoss&&!d.storageLossAllEpisodesMerged;
   }
   diagnostics.push(d);results.queryInstances++;results.methodOutcomes+=methods.length;
  }
  const world={seed,metadata,noise,queries:data.queries.length,methods:{},diagnostics:{},paired:{},checkpoints};
  for(const method of methods){world.methods[method]={};for(const slice of slices)world.methods[method][slice]=summarizeRows(by[method].filter(r=>slice==='all'||r.kind===slice));}
  for(const slice of slices){
   const selected=diagnostics.filter(d=>slice==='all'||d.kind===slice),c=counts();c.queries=selected.length;
   for(const d of selected){for(const name of Object.keys(c).filter(x=>x!=='queries'))if(d[name])c[name]++;}world.diagnostics[slice]=c;world.paired[slice]={};
   for(const method of methods.filter(m=>m!=='active')){const rows=by[method];let corrected=0,regressed=0,evidenceRecovered=0,evidenceLost=0;for(let i=0;i<rows.length;i++){const a=by.active[i],b=rows[i];if(slice!=='all'&&a.kind!==slice)continue;corrected+=Number(a.predicted!==a.gold&&b.predicted===b.gold);regressed+=Number(a.predicted===a.gold&&b.predicted!==b.gold);evidenceRecovered+=Number(!a.goldInHits&&b.goldInHits);evidenceLost+=Number(a.goldInHits&&!b.goldInHits);}world.paired[slice][method]={corrected,regressed,evidenceRecovered,evidenceLost,accuracyDifference:world.methods[method][slice].answerAccuracy-world.methods.active[slice].answerAccuracy};}
  }
  world.queryDiagnostics=diagnostics;worlds.push(world);replay.close();console.log(label,seed,Object.fromEntries(methods.map(m=>[m,world.methods[m].historical.answerAccuracy])));
 }
 const summary={methods:{},paired:{},diagnostics:{}};
 for(const method of methods){summary.methods[method]={};for(const slice of slices){summary.methods[method][slice]={};for(const metric of ['answerAccuracy','wrongAnswerRate','coverage','validEvidenceRecall']){const values=worlds.map(w=>w.methods[method][slice][metric]).filter(x=>x!==null);if(values.length===5)summary.methods[method][slice][metric]=aggregate(values);}}}
 for(const slice of slices){summary.paired[slice]={};for(const method of methods.filter(m=>m!=='active')){summary.paired[slice][method]={};for(const metric of ['corrected','regressed','evidenceRecovered','evidenceLost','accuracyDifference'])summary.paired[slice][method][metric]=aggregate(worlds.map(w=>w.paired[slice][method][metric]));}summary.diagnostics[slice]={};for(const name of Object.keys(counts()))summary.diagnostics[slice][name]={total:worlds.reduce((s,w)=>s+w.diagnostics[slice][name],0),perWorld:aggregate(worlds.map(w=>w.diagnostics[slice][name]))};}
 results.settings[label]={summary,worlds};
}
const probe=await createReplay(async()=>sqlite),probeInsertions=[];
for(const [i,value]of ['planning','released','planning'].entries())probeInsertions.push(probe.insert({id:`recurrence-${i}`,subject:'recurrence-project',predicate:'status',value,domain:'project',validFrom:T0+i*2*DAY,validUntil:T0+(i+1)*2*DAY,observedAt:T0+i*2*DAY,sources:2,writer:'fixture',url:`https://fixture.example.invalid/${i}`}));
const probeQuery={id:'recurrence-probe',subject:'recurrence-project',predicate:'status',text:'recurrence-project status',validTime:T0+5*DAY,knowledgeTime:T0+5*DAY,kind:'current',domain:'project',gold:'planning'};
const probeRows=probe.memory.storage.exec({sql:'SELECT id,object,validity_start,validity_end,status FROM nuggets ORDER BY validity_start',returnValue:'resultRows',rowMode:'object'});
results.recurringStateCounterexample={postAuditConstructedProbe:true,insertions:probeInsertions,storedRows:probeRows,active:score(probeQuery,probe.retrieve('webnugget',probeQuery)),latestValid:score(probeQuery,probe.retrieve('latest-valid',probeQuery)),allStatesEligible:probeRows.filter(r=>r.validity_start<=probeQuery.validTime&&r.validity_end>probeQuery.validTime)};
assert.equal(probeInsertions[2].outcome,'merged');assert.equal(results.recurringStateCounterexample.active.predicted,null);assert.equal(results.recurringStateCounterexample.latestValid.predicted,'planning');probe.close();
results.finished=new Date().toISOString();results.assertions={activeMatchesSaved:true,latestValidMatchesSaved:true,capturedSqlMatchesActualOrderedIds:true,vendorUnchanged:true};
for(const file of ['vendor/core/src/memory/nugget-store.js','vendor/core/src/memory/algorithms/conflicts.js'])assert.equal(hash(await fs.readFile(new URL(file,root))),results.inputHashes[file]);
await fs.writeFile(new URL('results/mechanism-ablation.json',root),JSON.stringify(results,null,2)+'\n');
await fs.writeFile(new URL('results/mechanism-ablation-outcomes.json',root),JSON.stringify({outcomes:flat,insertions},null,2)+'\n');
console.log('Saved',results.queryInstances,'queries;',results.methodOutcomes,'method outcomes');
