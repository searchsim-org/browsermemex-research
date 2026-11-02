// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {NuggetStore} from '../vendor/core/src/memory/nugget-store.js';
import {SqliteStore} from '../vendor/core/src/memory/storage/sqlite.js';
import {EpisodePolicy,observableObservation,observableQuery} from '../episode-policy.mjs';
import {DAY,T0,rng,summarizeRows} from '../benchmark.mjs';
import {score} from '../adapters.mjs';

const root=new URL('../',import.meta.url),sqlite=await sqlite3InitModule(),started=new Date().toISOString();
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const methods=['active','latest-valid','episode-plurality','episode-url2','episode-origin2'];
const slices=['all','current','historical','unknown'];
const manifest={version:'episode-repair-1',postAudit:true,started,node:process.version,sqlite:sqlite.capi.sqlite3_libversion(),syntheticLicense:'CC0-1.0',softwareLicense:'MIT',hashes:{}};
for(const f of ['EPISODE-REPAIR-PROTOCOL.md','episode-policy.mjs','scripts/episode-repair.mjs','vendor/core/src/memory/nugget-store.js','vendor/core/src/memory/algorithms/conflicts.js'])manifest.hashes[f]=hash(await fs.readFile(new URL(f,root)));
const oldActive=new Map(),oldLatest=new Map();
for(const[f,target,wanted]of [['results/query-outcomes.jsonl',oldActive,'webnugget'],['results/strong-controls-outcomes.jsonl',oldLatest,'latest-valid']]){
 const bytes=await fs.readFile(new URL(f,root));manifest.hashes[f]=hash(bytes);for(const line of bytes.toString().trim().split('\n')){const r=JSON.parse(line);if(r.method===wanted)target.set(`${r.metadata}|${r.noise}|${r.seed}|${r.id}`,r);}
}
function stats(xs,t=2.776445){const mean=xs.reduce((a,b)=>a+b,0)/xs.length;return{mean,ci95HalfWidth:t*Math.sqrt(xs.reduce((s,x)=>s+(x-mean)**2,0)/(xs.length-1)/xs.length),worlds:xs.length};}
function sliceRows(rows,slice){return rows.filter(r=>slice==='all'||r.kind===slice);}
function paired(a,b){let corrected=0,regressed=0;for(let i=0;i<a.length;i++){assert.equal(a[i].id,b[i].id);corrected+=Number(a[i].predicted!==a[i].gold&&b[i].predicted===b[i].gold);regressed+=Number(a[i].predicted===a[i].gold&&b[i].predicted!==b[i].gold);}return{corrected,regressed,accuracyDifference:(corrected-regressed)/a.length};}
function matched(latest,repair,seed){
 const answered=latest.filter(r=>r.predicted!==null),budget=repair.filter(r=>r.predicted!==null).length;if(budget>answered.length)return{available:false,budget,comparatorAnswers:answered.length};
 const repetitions=[];for(let rep=0;rep<50;rep++){const random=rng(seed*100+rep),indices=answered.map((_,i)=>i);for(let i=indices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}const chosen=new Set(indices.slice(0,budget).map(i=>answered[i].id)),rows=latest.map(r=>({...r,predicted:chosen.has(r.id)?r.predicted:null}));const s=summarizeRows(rows);repetitions.push({wrongAnswerRate:s.wrongAnswerRate,answerAccuracy:s.answerAccuracy,coverage:s.coverage});}
 return{available:true,budget,comparatorAnswers:answered.length,permutations:50,repetitions,mean:Object.fromEntries(['wrongAnswerRate','answerAccuracy','coverage'].map(k=>[k,repetitions.reduce((s,r)=>s+r[k],0)/50]))};
}
async function evaluate(data,{original=false}={}){
 const store=new NuggetStore({storage:new SqliteStore({initModule:async()=>sqlite})});await store.open();
 const policies={'episode-plurality':new EpisodePolicy({minSupport:1}),'episode-url2':new EpisodePolicy({minSupport:2,originAware:false}),'episode-origin2':new EpisodePolicy({minSupport:2})},latest=policies['episode-plurality'];
 const by=Object.fromEntries(methods.map(m=>[m,[]]));let cursor=0;
 for(const q of data.queries){
  while(cursor<data.observations.length&&data.observations[cursor].observedAt<=q.knowledgeTime){const o=observableObservation(data.observations[cursor++]);assert(!('gold'in o)&&!('truthValue'in o)&&!('corrupted'in o));for(const p of Object.values(policies))p.insert(o);store.insert({id:o.id,kind:'SemanticFact',fact:{subject:o.subject,predicate:o.predicate,object:o.value},canonicalText:`${o.subject} ${o.predicate} ${o.value}`,validity:{start:o.validFrom,end:o.validUntil,scope:'shared',sourceType:o.domain},epistemic:{status:'Active',rank:'Normal',confidence:.9},createdAt:o.observedAt,provenance:o.provenance});}
  const query=observableQuery(q);assert(!('gold'in query));
  const hits={active:store.query(query.text,{time:query.validTime,scope:'shared',topK:10}).map(x=>({id:x.nugget.id,subject:x.nugget.fact.subject,predicate:x.nugget.fact.predicate,object:x.nugget.fact.object})),'latest-valid':latest.latestValid(query)};
  for(const[m,p]of Object.entries(policies))hits[m]=p.retrieve(query);
  for(const method of methods)by[method].push({...score(q,hits[method]),method});
  if(original){const key=`${data.metadata}|${data.noise}|${data.seed}|${q.id}`;for(const[m,target]of [['active',oldActive],['latest-valid',oldLatest]])for(const field of ['predicted','goldInHits','returned','relevantReturned','relevantCorrect'])assert.equal(by[m].at(-1)[field],target.get(key)?.[field],`${key} ${m} ${field}`);for(const field of ['predicted','goldInHits','returned','relevantReturned','relevantCorrect'])assert.equal(by['episode-plurality'].at(-1)[field],by['latest-valid'].at(-1)[field],`${key} plurality parity ${field}`);}
 }
 store.close();const result={seed:data.seed,queries:data.queries.length,observations:data.observations.length,methods:{},paired:{},coverageMatched:{},outcomes:by};
 for(const method of methods){result.methods[method]={};for(const slice of slices)result.methods[method][slice]=summarizeRows(sliceRows(by[method],slice));}
 for(const slice of slices){result.paired[slice]={};for(const method of methods.filter(m=>m!=='active'))result.paired[slice][method]=paired(sliceRows(by.active,slice),sliceRows(by[method],slice));result.coverageMatched[slice]=matched(sliceRows(by['latest-valid'],slice),sliceRows(by['episode-origin2'],slice),data.seed);}
 return result;
}
function aggregate(worlds,t){
 const s={methods:{},paired:{},coverageMatched:{}};
 for(const method of methods){s.methods[method]={};for(const slice of slices){s.methods[method][slice]={};for(const metric of ['answerAccuracy','wrongAnswerRate','coverage','selectiveAccuracy','validEvidenceRecall','correctAbstention']){const xs=worlds.map(w=>w.methods[method][slice][metric]);if(xs.every(x=>x!==null))s.methods[method][slice][metric]=stats(xs,t);}}}
 for(const slice of slices){s.paired[slice]={};for(const method of methods.filter(m=>m!=='active')){s.paired[slice][method]={};for(const metric of ['corrected','regressed','accuracyDifference'])s.paired[slice][method][metric]=stats(worlds.map(w=>w.paired[slice][method][metric]),t);}const eligible=worlds.every(w=>w.coverageMatched[slice].available);s.coverageMatched[slice]={available:eligible};if(eligible){for(const metric of ['wrongAnswerRate','answerAccuracy','coverage'])s.coverageMatched[slice][metric]=stats(worlds.map(w=>w.coverageMatched[slice].mean[metric]),t);s.coverageMatched[slice].pairedRepairMinusMatchedWrong=stats(worlds.map(w=>w.methods['episode-origin2'][slice].wrongAnswerRate-w.coverageMatched[slice].mean.wrongAnswerRate),t);}}
 return s;
}
const original={version:'unchanged-BMTR-1-repair',methods,settings:{},queryInstances:0,methodOutcomes:0};
for(const metadata of ['oracle','ttl'])for(const noise of [0,.05,.1,.2]){const label=`${metadata}-noise${noise}`,worlds=[];for(const seed of [27001,27002,27003,27004,27005]){const file=`data/${label}-seed${seed}.json`,bytes=await fs.readFile(new URL(file,root));manifest.hashes[file]=hash(bytes);const data=JSON.parse(bytes),w=await evaluate(data,{original:true});worlds.push(w);original.queryInstances+=w.queries;original.methodOutcomes+=w.queries*methods.length;}original.settings[label]={summary:aggregate(worlds,2.776445),worlds};console.log('original',label,'historical',Object.fromEntries(methods.map(m=>[m,original.settings[label].summary.methods[m].historical.answerAccuracy.mean])));}
await fs.writeFile(new URL('results/episode-repair-original.json',root),JSON.stringify(original));

function makeStress(seed,{startError,missing,copies}){
 const truthRng=rng(seed),timeRng=rng(seed+1000),missingRng=rng(seed+2000),copyRng=rng(seed+3000),delayRng=rng(seed+4000),queryRng=rng(seed+5000);
 const truth=[],observations=[],queries=[],vocab=[['planned','funded','active','paused','complete'],['low','medium','high','urgent','deferred'],['team-amber','team-blue','team-green','team-red','team-violet']];
 for(let i=0;i<40;i++){
  const subject=`stress${seed}entity${i}`,predicate=['status','priority','owner'][i%3],values=vocab[i%3];let time=0,previous=-1;const states=[];
  for(let j=0;j<6;j++){let index=Math.floor(truthRng()*values.length);if(index===previous)index=(index+1)%values.length;previous=index;states.push({subject,predicate,value:values[index],start:T0+time*DAY,end:null});if(j<5)time+=2+truthRng()*4;}
  for(let j=0;j<states.length;j++){
   const state=states[j];state.end=states[j+1]?.start??T0+40*DAY;truth.push({...state});const shift=(timeRng()*2-1)*DAY,activate=copyRng()<.25,wrong=values[(values.indexOf(state.value)+2)%values.length];
   for(let report=0;report<5;report++){
    const missingDraw=missingRng(),delay=delayRng()*.75*DAY+(report>=2?.15*DAY:0),isCopy=report>=2;
    if((isCopy&&(!copies||!activate))||(missing&&missingDraw<.25))continue;
    const observedAt=state.start+delay,id=`stress-${seed}-${i}-${j}-${report}`,sourceOrigin=`publisher-${isCopy?'copy-origin':report}`;
    observations.push({id,subject,predicate,value:isCopy?wrong:state.value,domain:'synthetic-worklog',validFrom:state.start+(startError?shift:0),validUntil:observedAt+8*DAY,observedAt,writer:`source-reader-${report}`,provenance:[{sourceUrl:`https://source-${report}.example.invalid/report/${seed}/${i}/${j}`,sourceOrigin,extractedAt:observedAt,agentId:`source-reader-${report}`}]});
   }
  }
  for(const checkpoint of [10,20,32])for(const kind of ['current','historical']){const knowledgeTime=T0+checkpoint*DAY,validTime=kind==='current'?knowledgeTime:T0+queryRng()*(checkpoint-1)*DAY,state=states.find(s=>s.start<=validTime&&validTime<s.end);queries.push({id:`stress-q-${seed}-${i}-${checkpoint}-${kind}`,cluster:subject,subject,predicate,text:`${subject} ${predicate}`,knowledgeTime,validTime,kind,domain:'synthetic-worklog',gold:state?.value??null});}
 }
 for(let i=0;i<24;i++){const subject=`stress${seed}missing${i}`;queries.push({id:`stress-unknown-${seed}-${i}`,cluster:subject,subject,predicate:'status',text:`${subject} status`,knowledgeTime:T0+32*DAY,validTime:T0+32*DAY,kind:'unknown',domain:'unknown',gold:null});}
 observations.sort((a,b)=>a.observedAt-b.observedAt||a.id.localeCompare(b.id));queries.sort((a,b)=>a.knowledgeTime-b.knowledgeTime||a.id.localeCompare(b.id));return{version:'BMTR-STRESS-2',syntheticLicense:'CC0-1.0',seed,factors:{startError,missing,copies},observations,queries,scorerOnlyTruth:truth};
}
const stress={version:'BMTR-STRESS-2',independentWorlds:20,methods,settings:{},queryInstances:0,methodOutcomes:0},inputs={version:'BMTR-STRESS-2',syntheticLicense:'CC0-1.0',worlds:[]};
for(const startError of [false,true])for(const missing of [false,true])for(const copies of [false,true]){const label=`start${+startError}-missing${+missing}-copies${+copies}`,worlds=[];for(let seed=28101;seed<=28120;seed++){const data=makeStress(seed,{startError,missing,copies});inputs.worlds.push(data);const w=await evaluate(data);worlds.push(w);stress.queryInstances+=w.queries;stress.methodOutcomes+=w.queries*methods.length;}stress.settings[label]={factors:{startError,missing,copies},summary:aggregate(worlds,2.093024),worlds};console.log('stress',label,'historical',Object.fromEntries(methods.map(m=>[m,stress.settings[label].summary.methods[m].historical.answerAccuracy.mean])));}
stress.pairedFactorEffects={};for(const factor of ['startError','missing','copies']){const cells=Object.values(stress.settings);for(const base of cells.filter(c=>!c.factors[factor])){const changed=cells.find(c=>c.factors[factor]&&Object.keys(c.factors).filter(k=>k!==factor).every(k=>c.factors[k]===base.factors[k])),key=`${factor}|${Object.entries(base.factors).filter(([k])=>k!==factor).map(([k,v])=>`${k}${+v}`).join('|')}`;stress.pairedFactorEffects[key]={};for(const method of methods){stress.pairedFactorEffects[key][method]={};for(const slice of ['all','current','historical']){stress.pairedFactorEffects[key][method][slice]={};for(const metric of ['answerAccuracy','wrongAnswerRate','coverage'])stress.pairedFactorEffects[key][method][slice][metric]=stats(base.worlds.map((w,i)=>changed.worlds[i].methods[method][slice][metric]-w.methods[method][slice][metric]),2.093024);}}}}
await fs.writeFile(new URL('results/episode-repair-stress-inputs.json',root),JSON.stringify(inputs));manifest.hashes['results/episode-repair-stress-inputs.json']=hash(await fs.readFile(new URL('results/episode-repair-stress-inputs.json',root)));
await fs.writeFile(new URL('results/episode-repair-stress.json',root),JSON.stringify(stress));
const probeData={seed:28999,observations:['planning','released','planning'].map((value,i)=>({id:`repair-probe-${i}`,subject:'repair-recurrence',predicate:'status',value,domain:'project',validFrom:T0+i*2*DAY,validUntil:T0+(i+1)*2*DAY,observedAt:T0+i*2*DAY,sources:2,writer:'fixture',url:`https://fixture.example.invalid/${i}`})),queries:[{id:'repair-recurrence-day5',subject:'repair-recurrence',predicate:'status',text:'repair-recurrence status',knowledgeTime:T0+5*DAY,validTime:T0+5*DAY,kind:'current',domain:'project',gold:'planning'}]};
// Single-query probes use method outcomes only; aggregate variance is not inferred.
const probeStore=new NuggetStore({storage:new SqliteStore({initModule:async()=>sqlite})});await probeStore.open();const probePolicy=new EpisodePolicy();for(const o of probeData.observations){probePolicy.insert(o);const x=observableObservation(o);probeStore.insert({id:x.id,kind:'SemanticFact',fact:{subject:x.subject,predicate:x.predicate,object:x.value},canonicalText:`${x.subject} ${x.predicate} ${x.value}`,validity:{start:x.validFrom,end:x.validUntil,scope:'shared'},epistemic:{status:'Active',rank:'Normal',confidence:.9},createdAt:x.observedAt,provenance:x.provenance});}const pq=probeData.queries[0];manifest.recurrenceProbe={active:probeStore.query(pq.text,{time:pq.validTime,scope:'shared'}).map(x=>x.nugget.fact.object),repair:probePolicy.retrieve(observableQuery(pq)).map(x=>x.object),storedRepairEpisodes:[...probePolicy.rows.values()].flat().length};assert.deepEqual(manifest.recurrenceProbe.active,[]);assert.deepEqual(manifest.recurrenceProbe.repair,['planning']);assert.equal(manifest.recurrenceProbe.storedRepairEpisodes,3);probeStore.close();
for(const f of ['vendor/core/src/memory/nugget-store.js','vendor/core/src/memory/algorithms/conflicts.js'])assert.equal(hash(await fs.readFile(new URL(f,root))),manifest.hashes[f]);
for(const f of ['results/episode-repair-original.json','results/episode-repair-stress.json'])manifest.hashes[f]=hash(await fs.readFile(new URL(f,root)));
manifest.finished=new Date().toISOString();manifest.assertions={originalActiveAndLatestValidParity:true,originalPluralityMatchesLatestValidAllScoredFields:true,originalPluralityParityQueries:original.queryInstances,vendorUnchanged:true,observableBoundaryWhitelisted:true};manifest.counts={originalQueries:original.queryInstances,originalMethodOutcomes:original.methodOutcomes,stressWorlds:20,stressConfigurations:160,stressQueries:stress.queryInstances,stressMethodOutcomes:stress.methodOutcomes};await fs.writeFile(new URL('results/episode-repair-manifest.json',root),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest.counts));
