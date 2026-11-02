import fs from 'node:fs/promises';import assert from 'node:assert/strict';import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import{makeDataset}from '../benchmark.mjs';import{createReplay,METHODS,score}from '../adapters.mjs';
const root=new URL('../',import.meta.url),runs=JSON.parse(await fs.readFile(new URL('results/browser-results.json',root),'utf8'));
const index=runs.findLastIndex(x=>x.action==='run'&&x.applicationNetworkDenial?.offlineHits===1),browser=runs[index];assert(browser);
const sqlite=await sqlite3InitModule(),replay=await createReplay(async()=>sqlite),data=makeDataset({seed:27006,entities:50,noise:.05,metadata:'ttl'}),actual=Object.fromEntries(METHODS.map(m=>[m,[]]));let cursor=0;
for(const q of data.queries){while(cursor<data.observations.length&&data.observations[cursor].observedAt<=q.knowledgeTime)replay.insert(data.observations[cursor++]);for(const method of METHODS)actual[method].push(score(q,replay.retrieve(method,q)));}
assert.deepEqual(actual,browser.raw);replay.close();
const out={passed:true,browserRunIndex:index,seed:27006,queryCount:330,methods:METHODS.length,comparedMethodOutcomes:1650,comparison:'Exact equality of every scored field, including predicted values, evidence presence and counts; timing excluded',supersededNetworkCheck:runs.map((r,i)=>r.action==='run'&&r.applicationNetworkDenial?.offlineHits===0?i:null).filter(i=>i!==null),supersededReason:'Initial exploratory network check returned no evidence and did not assert a positive retrieval; use later known-positive fixture.'};
await fs.writeFile(new URL('results/browser-node-parity.json',root),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
