import fs from 'node:fs/promises';
import os from 'node:os';
import crypto from 'node:crypto';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {makeDataset,summarizeRows} from '../benchmark.mjs';
import {createReplay,METHODS,score} from '../adapters.mjs';
const ROOT=new URL('../',import.meta.url);
const seeds=[27001,27002,27003,27004,27005];
const entities=Number(process.env.BMTR_ENTITIES??200);
const rows=[],outcomes={};
const sqlite=await sqlite3InitModule();const initModule=async()=>sqlite;
const meta={node:process.version,platform:process.platform,arch:process.arch,os:os.release(),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem(),sqlite:sqlite.capi.sqlite3_libversion(),started:new Date().toISOString(),entitiesPerSeed:entities,seeds,protocolSha256:crypto.createHash('sha256').update(await fs.readFile(new URL('PROTOCOL.md',ROOT))).digest('hex')};
await fs.writeFile(new URL('results/environment.json',ROOT),JSON.stringify(meta,null,2));
for(const metadata of ['oracle','ttl'])for(const noise of [0,.05,.10,.20]){
  const label=`${metadata}-noise${noise}`;outcomes[label]={};
  for(const seed of seeds){
    const data=makeDataset({seed,entities,noise,metadata});
    await fs.writeFile(new URL(`data/${label}-seed${seed}.json`,ROOT),JSON.stringify(data));
    const replay=await createReplay(initModule),byMethod=Object.fromEntries(METHODS.map(m=>[m,[]]));
    let cursor=0;
    for(const q of data.queries){
      while(cursor<data.observations.length&&data.observations[cursor].observedAt<=q.knowledgeTime)replay.insert(data.observations[cursor++]);
      for(const method of METHODS){
        const before=performance.now();const hits=replay.retrieve(method,q);const latencyMs=performance.now()-before;
        const result={...score(q,hits),latencyMs,seed,metadata,noise,method};byMethod[method].push(result);rows.push(result);
      }
    }
    const perSeed={seed,metadata,noise,observations:data.observations.length,queries:data.queries.length,methods:{}};
    for(const method of METHODS){
      perSeed.methods[method]={all:summarizeRows(byMethod[method])};
      for(const kind of ['current','historical','unknown'])perSeed.methods[method][kind]=summarizeRows(byMethod[method].filter(x=>x.kind===kind));
    }
    outcomes[label][seed]=perSeed;replay.close();
    console.log(label,seed,'queries',data.queries.length,'accuracy',Object.fromEntries(METHODS.map(m=>[m,perSeed.methods[m].all.answerAccuracy.toFixed(3)])));
    await fs.writeFile(new URL('results/temporal-summary.json',ROOT),JSON.stringify(outcomes,null,2));
  }
}
await fs.writeFile(new URL('results/query-outcomes.jsonl',ROOT),rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
meta.finished=new Date().toISOString();meta.queryOutcomes=rows.length;meta.dataFiles=40;
await fs.writeFile(new URL('results/environment.json',ROOT),JSON.stringify(meta,null,2));
console.log('Saved',rows.length,'per-query outcomes.');
