import fs from 'node:fs/promises';import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import{createReplay,score}from '../adapters.mjs';import{summarizeRows}from '../benchmark.mjs';
const root=new URL('../',import.meta.url),sqlite=await sqlite3InitModule(),methods=['bm25-time-recency','latest-valid'],summary={},raw=[];
for(const metadata of ['oracle','ttl'])for(const noise of [0,.05,.1,.2]){
 const label=`${metadata}-noise${noise}`;summary[label]={};
 for(const seed of [27001,27002,27003,27004,27005]){
  const data=JSON.parse(await fs.readFile(new URL(`data/${label}-seed${seed}.json`,root),'utf8')),replay=await createReplay(async()=>sqlite),by=Object.fromEntries(methods.map(m=>[m,[]]));let cursor=0;
  for(const q of data.queries){while(cursor<data.observations.length&&data.observations[cursor].observedAt<=q.knowledgeTime)replay.insert(data.observations[cursor++]);for(const method of methods){const begin=performance.now(),hits=replay.retrieve(method,q);const result={...score(q,hits),latencyMs:performance.now()-begin,method,metadata,noise,seed};by[method].push(result);raw.push(result);}}
  summary[label][seed]={methods:{}};for(const method of methods){summary[label][seed].methods[method]={all:summarizeRows(by[method])};for(const kind of ['current','historical','unknown'])summary[label][seed].methods[method][kind]=summarizeRows(by[method].filter(r=>r.kind===kind));}
  replay.close();console.log(label,seed,Object.fromEntries(methods.map(m=>[m,summary[label][seed].methods[m].all.answerAccuracy])));
 }
 await fs.writeFile(new URL('results/strong-controls-summary.json',root),JSON.stringify(summary,null,2));
}
await fs.writeFile(new URL('results/strong-controls-outcomes.jsonl',root),raw.map(x=>JSON.stringify(x)).join('\n')+'\n');console.log('Additional outcomes',raw.length);
