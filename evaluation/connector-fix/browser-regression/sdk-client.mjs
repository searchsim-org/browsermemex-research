import fs from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
const [role,fixtureFile]=process.argv.slice(2);
if(!['writer','reader'].includes(role))throw Error('Expected writer or reader');
const fixture=JSON.parse(await fs.readFile(fixtureFile,'utf8'));
const server=path.resolve(new URL('../../scripts/cross-client-server.mjs',import.meta.url).pathname);
const client=new Client({name:`isolated-browser-${role}`,version:'1.0.0'},{capabilities:{}});
const transport=new StdioClientTransport({command:process.execPath,args:[server],env:{...process.env,BMEX_RELAY_PORT:'7863'},stderr:'inherit'});
const outcomes=[];
try{
 await client.connect(transport);
 for(const f of fixture.facts){
  const result=await client.callTool({name:role==='writer'?'memory_write':'memory_query',arguments:role==='writer'?{subject:f.subject,value:f.value}:{subject:f.subject}});
  let decoded=null;try{decoded=JSON.parse(result.content.find(x=>x.type==='text')?.text??'null');}catch{}
  const pass=!result.isError&&(role==='writer'?Boolean(decoded&&!decoded.dropped&&decoded.nuggetId):Array.isArray(decoded)&&decoded.some(h=>h.nugget?.fact?.subject===f.subject&&h.nugget?.fact?.object===f.value&&h.nugget?.provenance?.some(p=>p.agentId==='research-client-a')));
  outcomes.push({subject:f.subject,expected:f.value,result,decoded,pass});
 }
 process.stdout.write(JSON.stringify({role,pid:process.pid,outcomes,pass:outcomes.length===3&&outcomes.every(x=>x.pass)})+'\n');
}finally{await client.close();}
process.exit(outcomes.every(x=>x.pass)?0:2);
