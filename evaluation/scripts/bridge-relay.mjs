import http from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
const clients=new Map();
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type','application/json');
 res.end(JSON.stringify({extensionConnected:[...clients.values()].some(x=>x==='extension'),clients:clients.size}));
});
const wss=new WebSocketServer({server});
setInterval(()=>{for(const [peer,role]of clients)if(role==='extension'&&peer.readyState===WebSocket.OPEN)peer.send(JSON.stringify({type:'research_keepalive'}));},20000).unref();
wss.on('connection',ws=>{
 ws.on('message',bytes=>{
  let m;try{m=JSON.parse(bytes);}catch{return;}
  if(m.type==='register'&&['extension','mcp','cli'].includes(m.role)){
   clients.set(ws,m.role);ws.send(JSON.stringify({type:'registered',role:m.role}));
   console.log(JSON.stringify({event:'registered',role:m.role}));return;
  }
  const role=clients.get(ws);
  if(m.type==='status_query'){ws.send(JSON.stringify({type:'status_response',extensionConnected:[...clients.values()].includes('extension')}));return;}
  if(role==='extension'&&m.type==='memex_response'&&String(m.requestId).startsWith('bmrepro')){
   for(const [peer,r]of clients)if(r!=='extension'&&peer.readyState===WebSocket.OPEN)peer.send(JSON.stringify(m));return;
  }
  if(role!=='extension'&&m.type==='memex_request'&&String(m.requestId).startsWith('bmrepro')&&['memory.write','memory.query','profile.active'].includes(m.op)){
   const ext=[...clients].find(([peer,r])=>r==='extension'&&peer.readyState===WebSocket.OPEN);
   if(ext)ext[0].send(JSON.stringify(m));else ws.send(JSON.stringify({type:'memex_response',requestId:m.requestId,ok:false,error:'No installed extension connected'}));return;
  }
  if(role==='extension'&&m.type==='read_credentials')ws.send(JSON.stringify({type:'credentials_result',error:'Credential access disabled in research relay'}));
 });
 ws.on('close',()=>clients.delete(ws));
});
server.listen(Number(process.env.BMEX_RELAY_PORT??7862),'127.0.0.1',()=>console.log('Research relay: loopback only; credentials/model proxy disabled'));
