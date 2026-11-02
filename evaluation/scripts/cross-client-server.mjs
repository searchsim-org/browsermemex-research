import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';
import {randomUUID} from 'node:crypto';
const socket=new WebSocket('ws://127.0.0.1:7862'),pending=new Map();
await new Promise((resolve,reject)=>{socket.once('open',()=>{socket.send(JSON.stringify({type:'register',role:'mcp'}));resolve();});socket.once('error',reject);});
socket.on('message',bytes=>{let m;try{m=JSON.parse(bytes);}catch{return;}const p=pending.get(m.requestId);if(p){pending.delete(m.requestId);clearTimeout(p.timer);m.ok?p.resolve(m.result):p.reject(Error(m.error));}});
function request(op,args){return new Promise((resolve,reject)=>{const requestId='bmrepro'+randomUUID();const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Installed extension response timed out'));},20000);pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({type:'memex_request',requestId,op,args}));});}
const server=new Server({name:'browsermemex-research-bridge',version:'1.0.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[
 {name:'memory_write',description:'Write a synthetic BrowserMemex reproduction fact only.',inputSchema:{type:'object',properties:{subject:{type:'string'},value:{type:'string'}},required:['subject','value']}},
 {name:'memory_query',description:'Query one synthetic BrowserMemex reproduction subject only.',inputSchema:{type:'object',properties:{subject:{type:'string'}},required:['subject']}}
]}));
server.setRequestHandler(CallToolRequestSchema,async({params:{name,arguments:a}})=>{
 try{
  if(!/^bmrepro[0-9a-z]+$/.test(a?.subject??''))throw Error('Only synthetic reproduction subjects accepted');
  const result=name==='memory_write'?await request('memory.write',{fact:{subject:a.subject,predicate:'fixturevalue',object:String(a.value)},sourceUrl:'https://research.example.invalid/'+a.subject,agentId:'research-client-a'}):await request('memory.query',{text:a.subject,options:{topK:3,view:'active'}});
  return{content:[{type:'text',text:JSON.stringify(result)}]};
 }catch(e){return{isError:true,content:[{type:'text',text:e.message}]};}
});
await server.connect(new StdioServerTransport());
