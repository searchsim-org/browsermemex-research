import {NuggetStore} from './vendor/core/src/memory/nugget-store.js';
import {SqliteStore} from './vendor/core/src/memory/storage/sqlite.js';
import {toCandidate} from './benchmark.mjs';
export const METHODS=['latest','bm25','bm25-time','webnugget','webnugget-contested'];
export async function createReplay(initModule){
  const memory=new NuggetStore({storage:new SqliteStore({initModule})});await memory.open();
  memory.storage.exec(`CREATE TABLE replay(id TEXT PRIMARY KEY,subject TEXT,predicate TEXT,object TEXT,start INTEGER,end INTEGER,observed INTEGER,canonical_text TEXT);
    CREATE VIRTUAL TABLE replay_fts USING fts5(canonical_text,content='replay',content_rowid='rowid');
    CREATE TRIGGER replay_insert AFTER INSERT ON replay BEGIN INSERT INTO replay_fts(rowid,canonical_text) VALUES(new.rowid,new.canonical_text);END;`);
  return{
    memory,
    insert(o){
      memory.storage.exec({sql:'INSERT INTO replay VALUES($id,$s,$p,$o,$start,$end,$seen,$text)',bind:{$id:o.id,$s:o.subject,$p:o.predicate,$o:o.value,$start:o.validFrom,$end:o.validUntil,$seen:o.observedAt,$text:`${o.subject} ${o.predicate} ${o.value}`}});
      return memory.insert(toCandidate(o));
    },
    retrieve(method,q,k=10){
      if(method.startsWith('webnugget'))return memory.query(q.text,{time:q.validTime,view:method==='webnugget-contested'?'active_plus_contested':'active',scope:'shared',topK:k}).map(x=>({subject:x.nugget.fact.subject,predicate:x.nugget.fact.predicate,object:x.nugget.fact.object,id:x.nugget.id}));
      if(method==='latest')return memory.storage.exec({sql:'SELECT * FROM replay WHERE subject=$s AND predicate=$p ORDER BY observed DESC LIMIT 1',bind:{$s:q.subject,$p:q.predicate},returnValue:'resultRows',rowMode:'object'});
      if(method==='latest-valid')return memory.storage.exec({sql:'SELECT * FROM replay WHERE subject=$s AND predicate=$p AND start<=$t AND end>$t ORDER BY start DESC, observed DESC, id ASC LIMIT 1',bind:{$s:q.subject,$p:q.predicate,$t:q.validTime},returnValue:'resultRows',rowMode:'object'});
      const tokens=q.text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(x=>`"${x}"`).join(' OR ');
      const time=['bm25-time','bm25-time-recency'].includes(method)?' AND r.start <= $t AND r.end > $t':'';
      const bind={$match:tokens,$k:k};if(time)bind.$t=q.validTime;
      const order=method==='bm25-time-recency'?'score, r.start DESC, r.observed DESC, r.id ASC':'score';
      return memory.storage.exec({sql:`SELECT r.*,bm25(replay_fts) AS score FROM replay_fts JOIN replay r ON r.rowid=replay_fts.rowid WHERE replay_fts MATCH $match${time} ORDER BY ${order} LIMIT $k`,bind,returnValue:'resultRows',rowMode:'object'});
    },
    close(){memory.close();}
  };
}
export function score(q,hits){
  const relevant=hits.filter(x=>x.subject===q.subject&&x.predicate===q.predicate);
  const predicted=relevant[0]?.object??null;
  return{id:q.id,cluster:q.cluster,kind:q.kind,domain:q.domain,gold:q.gold,predicted,
    goldInHits:q.gold!==null&&relevant.some(r=>r.object===q.gold),returned:hits.length,
    relevantReturned:relevant.length,relevantCorrect:relevant.filter(r=>q.gold!==null&&r.object===q.gold).length};
}
