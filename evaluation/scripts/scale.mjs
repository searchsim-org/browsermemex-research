import fs from 'node:fs/promises';import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {NuggetStore}from '../vendor/core/src/memory/nugget-store.js';import{SqliteStore}from '../vendor/core/src/memory/storage/sqlite.js';
import{toCandidate,T0,DAY,rng}from '../benchmark.mjs';
import{configureLookupIndex}from '../lookup-index.mjs';
const root=new URL('../',import.meta.url),sqlite=await sqlite3InitModule(),initModule=async()=>sqlite;
const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(p*(a.length-1)))];const results=[];
const optimized=process.argv.includes('--composite-index');
for(const n of [1000,10000,100000]){
 const memory=new NuggetStore({storage:new SqliteStore({initModule})});await memory.open();
 const queryPlan=()=>memory.storage.exec({sql:'EXPLAIN QUERY PLAN SELECT n.*,p.source_url FROM nuggets n LEFT JOIN provenance p ON p.nugget_id=n.id WHERE n.nugget_key=$k AND n.scope=$s AND n.profile_id=$p',bind:{$k:'key',$s:'shared',$p:'default'},returnValue:'resultRows',rowMode:'object'});
 const planBefore=queryPlan();if(optimized)configureLookupIndex(memory);const planAfter=queryPlan();const before=performance.now();
 for(let i=0;i<n;i++)memory.insert(toCandidate({id:`scale-${i}`,subject:`entity${i.toString(36).padStart(6,'0')}`,predicate:'status',value:`value${i%17}`,domain:'project',validFrom:T0,validUntil:T0+365*DAY,observedAt:T0,sources:1,writer:'scale-writer',url:`https://synthetic.example.invalid/${i}`}));
 const insertionMs=performance.now()-before;const random=rng(27007),latencies=[],warm=[];let correct=0;
 const targets=Array.from({length:1000},()=>Math.floor(random()*n));
 for(const [j,arr] of [latencies,warm].entries())for(const i of targets){const subject=`entity${i.toString(36).padStart(6,'0')}`,t=performance.now(),hits=memory.query(subject,{time:T0+32*DAY,scope:'shared',topK:10});arr.push(performance.now()-t);if(j===0&&hits[0]?.nugget.fact.object===`value${i%17}`)correct++;}
 const dbBytes=sqlite.capi.sqlite3_js_db_export(memory.storage.db.pointer).byteLength;
 const row={n,optimized,planBefore,planAfter,insertMs:insertionMs,insertsPerSecond:n/(insertionMs/1000),dbBytes,rssBytes:process.memoryUsage().rss,queryCount:1000,correctTop1:correct,coldOrder:{p50:percentile(latencies,.5),p95:percentile(latencies,.95),p99:percentile(latencies,.99)},warmOrder:{p50:percentile(warm,.5),p95:percentile(warm,.95),p99:percentile(warm,.99)},raw:{latencies,warm}};
 results.push(row);await fs.writeFile(new URL(optimized?'results/scale-indexed.json':'results/scale.json',root),JSON.stringify(results,null,2));console.log(JSON.stringify({...row,raw:undefined}));memory.close();
}
