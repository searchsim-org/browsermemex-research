// SPDX-License-Identifier: MIT
// Companion policy; does not modify or describe an existing extension feature.
export function observableObservation(o){
 const provenance=o.provenance??Array.from({length:o.sources??1},(_,j)=>({sourceUrl:o.url.replace('https://',`https://source${j}.`),extractedAt:o.observedAt,agentId:o.writer}));
 return{id:o.id,subject:o.subject,predicate:o.predicate,value:o.value,domain:o.domain,validFrom:o.validFrom,validUntil:o.validUntil,observedAt:o.observedAt,writer:o.writer,provenance:provenance.map(p=>({sourceUrl:p.sourceUrl,sourceOrigin:p.sourceOrigin??null,extractedAt:p.extractedAt??o.observedAt,agentId:p.agentId??o.writer}))};
}
export function observableQuery(q){return{subject:q.subject,predicate:q.predicate,validTime:q.validTime,text:q.text};}
export class EpisodePolicy{
 constructor({minSupport=2,originAware=true}={}){this.minSupport=minSupport;this.originAware=originAware;this.rows=new Map();}
 insert(observation){const o=observableObservation(observation),key=`${o.subject}\0${o.predicate}`;if(!this.rows.has(key))this.rows.set(key,[]);this.rows.get(key).push(o);}
 eligible(q){return(this.rows.get(`${q.subject}\0${q.predicate}`)??[]).filter(o=>o.validFrom<=q.validTime&&(o.validUntil===null||o.validUntil>q.validTime));}
 latestValid(q){const rows=this.eligible(q).sort((a,b)=>b.validFrom-a.validFrom||b.observedAt-a.observedAt||a.id.localeCompare(b.id));return rows.length?[this.hit(rows[0])]:[];}
 hit(o,support=null){return{id:o.id,subject:o.subject,predicate:o.predicate,object:o.value,support};}
 retrieve(q){
  const rows=this.eligible(q);if(!rows.length)return[];
  const newest=Math.max(...rows.map(o=>o.validFrom)),cohort=rows.filter(o=>o.validFrom===newest),values=new Map();
  for(const o of cohort){if(!values.has(o.value))values.set(o.value,{rows:[],sources:new Set()});const v=values.get(o.value);v.rows.push(o);for(const p of o.provenance)v.sources.add(this.originAware?(p.sourceOrigin??p.sourceUrl):p.sourceUrl);}
  const ranked=[...values.values()].sort((a,b)=>b.sources.size-a.sources.size);if(ranked[0].sources.size<this.minSupport||(ranked[1]&&ranked[1].sources.size===ranked[0].sources.size))return[];
  const chosen=ranked[0].rows.sort((a,b)=>b.observedAt-a.observedAt||a.id.localeCompare(b.id))[0];return[this.hit(chosen,ranked[0].sources.size)];
 }
}
