/** Execute the preregistered synthetic orchestration component protocol. */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {Router} from '../vendor/core/src/router/router.js';
import {MATCH_KIND} from '../vendor/core/src/router/types.js';
import {proposeSkills, templateFingerprint} from '../vendor/core/src/skills/distillation.js';
import {rng} from '../benchmark.mjs';
const root=new URL('../',import.meta.url), seeds=[27101,27102,27103,27104,27105], now=Date.UTC(2026,0,1);
const protocol=await fs.readFile(new URL('ORCHESTRATION-PROTOCOL.md',root));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const categories=[
 {operation:'dashboard',host:'grafana.acme.com',agent:'claude-code',text:'Summarize dashboard throughput and alert counts',variant:'Inspect service behavior'},
 {operation:'ticket',host:'acme.atlassian.net',agent:'cursor',text:'Triage ticket priorities and assign ownership',variant:'Organize incoming work'},
 {operation:'search',host:'www.google.com',agent:'cursor',text:'Search public documentation for API details',variant:'Find relevant references'},
 {operation:'email',host:'mail.google.com',agent:'claude-code',text:'Summarize email correspondence for this account',variant:'Review received correspondence'},
 {operation:'form',host:'workday.acme.com',agent:'codex',text:'Complete form fields using the supplied profile',variant:'Enter the supplied personal details'},
 {operation:'coding',host:'github.com',agent:'claude-code',text:'Review code changes for regressions',variant:'Inspect the patch'},
];
// Literal lexicon is independent of task labels. No truth field enters fallback.
function keywordPick(task){
 const text=String(task.description).toLowerCase();
 if(text.includes('ticket')||text.includes('search'))return 'cursor';
 if(text.includes('form'))return 'codex';
 return 'claude-code';
}
function policy(kind){return {version:1,rules:kind==='fallback-only'?[]:categories.slice(0,5).map((c,i)=>({id:`r${i}`,match:[{kind:MATCH_KIND.URL_PATTERN,pattern:kind==='substring'?`**${c.host}**`:`https://${c.host}/**`}],preferred:[c.agent],reason:`Configured ${c.operation} destination`})),llmFallbackEnabled:true,fallback:'claude-code'};}
const routingRows=[], routingTasks=[], routingBySeed=[];
for(const seed of seeds){
 for(const environment of ['canonical','migrated','host-confusion']){
  const random=rng(seed),tasks=[],labels=[];
  for(let i=0;i<1000;i++){
   const index=Math.floor(random()*categories.length),c=categories[index],other=categories[(index+1)%categories.length];
   let url=`https://${c.host}/tasks/${i}`;
   if(environment==='migrated')url=`https://${c.operation}.new-workspace.example.invalid/tasks/${i}`;
   if(environment==='host-confusion')url=`https://unrelated.example.invalid/tasks/${i}?returnTo=https://${other.host}/record`;
   const task={id:`${seed}-${environment}-${i}`,kind:'browse',title:`Work item ${i}`,description:random()<.15?c.variant:c.text,payload:{url}};
   tasks.push(task);labels.push({operation:c.operation,expected:c.agent});routingTasks.push({seed,environment,task,...labels.at(-1)});
  }
  for(const method of ['substring','host-anchored','fallback-only']){
   let fallbackCalls=0;
   const router=new Router({policy:policy(method),llmClient:{pickAgent:async prompt=>{fallbackCalls++;return{agentId:keywordPick(prompt.task),reason:'Deterministic lexical resolver; no model inference'};}}});
   const rows=[];
   for(let i=0;i<tasks.length;i++){
    const decision=await router.route(tasks[i],{installed:['claude-code','cursor','codex']},{now});
    rows.push({seed,environment,method,taskId:tasks[i].id,expected:labels[i].expected,chosen:decision.chosenAgentId,source:decision.source,ruleId:decision.ruleId,correct:decision.chosenAgentId===labels[i].expected});
   }
   assert.equal(fallbackCalls,rows.filter(x=>x.source==='llm_fallback').length);
   assert.equal(rows.length,1000);
   const correct=rows.filter(x=>x.correct).length;
   routingBySeed.push({seed,environment,method,queries:rows.length,correct,wrong:rows.length-correct,agreement:correct/rows.length,fallbackRequests:fallbackCalls,fallbackFraction:fallbackCalls/rows.length});
   routingRows.push(...rows);
  }
 }
}
const thresholds=[2,3,5,8], skillRows=[],skillTraces=[];
function makeCases(random,n){return Array.from({length:n},()=>{const simple=random()<.6;return Array.from({length:2+Math.floor(random()*3)},()=>({price:1+Math.floor(random()*30),quantity:simple?1:2+Math.floor(random()*3)}));});}
const expected=items=>items.reduce((sum,x)=>sum+x.price*x.quantity,0);
function execute(type,items){if(type==='quantity-blind')return items.reduce((sum,x)=>sum+x.price,0);return expected(items)+(type==='off-by-one'?1:0);}
for(const seed of seeds){
 const random=rng(seed+10000),tasks=[],attempts={},verified={},families=[];
 for(let i=0;i<50;i++){
  const group=i<20?'frequent-correct':i<30?'rare-correct':i<40?'recurring-incorrect':'transient';
  const type=i>=30&&i<35?'quantity-blind':i>=35&&i<40?'off-by-one':'correct';
  const n=i<20?20+Math.floor(random()*21):i<30?2+Math.floor(random()*8):i<40?12+Math.floor(random()*14):1+Math.floor(random()*7);
  const futureUses=group==='transient'?0:3+Math.floor(random()*8);
  const futureCases=Array.from({length:10},(_,j)=>[{price:3+j,quantity:2+j%3},{price:5+j,quantity:3}]);
  const futureScores=futureCases.map(items=>({items,expected:expected(items),observed:execute(type,items)}));
  const reusable=futureUses>0&&futureScores.every(x=>x.expected===x.observed);
  const family={id:`workflow-${i}`,group,type,trainingAttempts:n,futureUses,reusable,futureCases:futureScores};families.push(family);
  for(const [j,items]of makeCases(random,n).entries()){
   const id=`skill-${seed}-${i}-${j}`,completed=random()<.9,ts=now+j*86400000+i;
   const task={id,title:`Line-item task ${i}`,payload:{template:family.id,operation:'line-item-total',items},createdAt:ts};
   const correct=execute(type,items)===expected(items);
   const run={status:completed?'success':'failure',startedAt:ts,finishedAt:ts+1,output:execute(type,items)};
   tasks.push(task);attempts[id]=[run];verified[id]=[{...run,status:completed&&correct?'success':'failure'}];
  }
 }
 assert.equal(families.filter(f=>f.reusable).length,30);
 const familyById=new Map(families.map(f=>[f.id,f]));
 for(const [admission,runs]of [['operational',attempts],['value-checked',verified]])for(const threshold of thresholds){
  const candidates=proposeSkills(tasks,runs,{threshold}),seen=new Set(candidates.map(x=>x.template.template));
  assert.equal(seen.size,candidates.length);
  let tp=0,semanticFalse=0,transientFalse=0;
  for(const candidate of candidates){
   const f=familyById.get(candidate.template.template);assert(f);
   const recount=candidate.sourceTaskIds.reduce((n,id)=>n+runs[id].filter(r=>r.status==='success').length,0);
   assert.equal(recount,candidate.successCount);assert(recount>=threshold);
   if(f.reusable)tp++;else if(f.futureUses===0)transientFalse++;else semanticFalse++;
  }
  const precision=candidates.length?tp/candidates.length:0,recall=tp/30,f1=precision+recall?2*precision*recall/(precision+recall):0;
  skillRows.push({seed,admission,threshold,proposals:candidates.length,trueAdmissions:tp,semanticFalse,transientFalse,precision,recall,f1,candidates});
 }
 skillTraces.push({seed,families,tasks,operationalRuns:attempts,valueCheckedRuns:verified});
}
const collisionTasks=Array.from({length:50},(_,i)=>({id:`collision-${i}`,title:`Unique nonrecurring operation ${i}`,payload:{url:`https://oneoff-${i}.example.invalid/`,operation:`unrelated-${i}`,requestId:i}}));
const collisionRuns=Object.fromEntries(collisionTasks.map((t,i)=>[t.id,[{status:'success',startedAt:now+i,finishedAt:now+i+1}]]));
const implicit=proposeSkills(collisionTasks,collisionRuns,{threshold:3});
const explicit=proposeSkills(collisionTasks.map(t=>({...t,payload:{...t.payload,template:t.id}})),collisionRuns,{threshold:3});
assert.equal(new Set(collisionTasks.map(templateFingerprint)).size,1);assert.equal(implicit.length,1);assert.equal(explicit.length,0);
const collision={tasks:50,futureReusableTemplates:0,threshold:3,implicitShapeGroups:1,implicitProposals:implicit.length,explicitDistinctGroups:50,explicitProposals:explicit.length,implicitCandidate:implicit[0]};
function stats(values){const mean=values.reduce((a,b)=>a+b,0)/values.length;const variance=values.reduce((n,x)=>n+(x-mean)**2,0)/(values.length-1);return{mean,ci95HalfWidth:2.776445*Math.sqrt(variance/values.length),values};}
const routingSummary={};for(const environment of ['canonical','migrated','host-confusion']){routingSummary[environment]={};for(const method of ['substring','host-anchored','fallback-only']){const rows=routingBySeed.filter(x=>x.environment===environment&&x.method===method);routingSummary[environment][method]=Object.fromEntries(['agreement','fallbackFraction','wrong','fallbackRequests'].map(k=>[k,stats(rows.map(x=>x[k]))]));}}
const skillSummary={};for(const admission of ['operational','value-checked']){skillSummary[admission]={};for(const threshold of thresholds){const rows=skillRows.filter(x=>x.admission===admission&&x.threshold===threshold);skillSummary[admission][threshold]=Object.fromEntries(['precision','recall','f1','proposals','semanticFalse','transientFalse'].map(k=>[k,stats(rows.map(x=>x[k]))]));}}
const historical=JSON.parse(await fs.readFile(new URL('../cikm26/experiments/results/rq2-routing-real-llm.json',root),'utf8'));
const summary={protocolSha256:hash(protocol),scriptSha256:hash(await fs.readFile(new URL(import.meta.url))),sourceSha256:{router:hash(await fs.readFile(new URL('vendor/core/src/router/router.js',root))),distillation:hash(await fs.readFile(new URL('vendor/core/src/skills/distillation.js',root)))},seeds,source:'Actual vendored Router.route and proposeSkills; source not modified',newModelCalls:0,routing:{uniqueTasks:routingTasks.length,decisions:routingRows.length,bySeed:routingBySeed,summary:routingSummary},skills:{templatesPerSeed:50,reusablePerSeed:30,attempts:skillTraces.reduce((n,x)=>n+x.tasks.length,0),conditions:skillRows.length,summary:skillSummary,bySeed:skillRows},shapeCollision:collision,archivedRouting:{status:'Historical aggregate only; no per-task archived decisions are available for independent rescoring',model:historical.model,trials:historical.nTrials,tasksPerTrial:historical.nTasksPerTrial,summary:historical.summary,monetaryCosts:'Synthetic costs in original archive are not new measurements and are not used'}};
await fs.writeFile(new URL('results/orchestration-summary.json',root),JSON.stringify(summary,null,2)+'\n');
await fs.writeFile(new URL('results/orchestration-routing-inputs.jsonl',root),routingTasks.map(x=>JSON.stringify(x)).join('\n')+'\n');
await fs.writeFile(new URL('results/orchestration-routing-outcomes.jsonl',root),routingRows.map(x=>JSON.stringify(x)).join('\n')+'\n');
await fs.writeFile(new URL('results/orchestration-skill-traces.json',root),JSON.stringify(skillTraces,null,2)+'\n');
console.log(JSON.stringify({routing:routingSummary,skills:skillSummary,shapeCollision:collision,newModelCalls:0,routingDecisions:routingRows.length,skillAttempts:summary.skills.attempts},null,2));
