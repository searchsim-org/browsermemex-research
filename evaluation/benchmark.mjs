// BrowserMemex Temporal Replay (BMTR), version 1. All content is synthetic.
// Truth generation is independent of retrieval, lifecycle, and TTL policy.
export const DAY=86400000, T0=Date.UTC(2026,0,1);
export const DOMAINS=[
  {name:'dashboard',ttl:DAY/4,values:['nominal','degraded','outage','recovering','maintenance']},
  {name:'ticket',ttl:DAY,values:['open','assigned','blocked','review','closed']},
  {name:'project',ttl:7*DAY,values:['planning','funded','active','paused','completed']},
  {name:'personnel',ttl:30*DAY,values:['engineering','research','operations','design','support']},
  {name:'documentation',ttl:90*DAY,values:['draft','stable','revised','deprecated','archived']}
];
export function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function makeDataset({seed=27001,entities=200,noise=0,metadata='ttl'}={}){
  const random=rng(seed), corruption=rng(seed+991), observations=[],truth=[],queries=[];
  for(let i=0;i<entities;i++){
    const domain=DOMAINS[i%5], subject=`${domain.name}${seed.toString(36)}x${i.toString(36).padStart(4,'0')}`;
    // State transitions use a different distribution from the memory TTLs.
    const changeTimes=[0,...Array.from({length:4},(_,j)=>(j*6+2+random()*4)*DAY)].sort((a,b)=>a-b);
    const lastEnd=(i%7===0?27:40)*DAY;
    const states=changeTimes.map((start,j)=>({subject,predicate:'status',value:domain.values[(i+j)%5],start:T0+start,end:T0+(changeTimes[j+1]??lastEnd),domain:domain.name}));
    truth.push(...states);
    for(let j=0;j<states.length;j++){
      const state=states[j];
      // Delayed observation is independent of actual validity, and never sees future state.
      const observedAt=state.start+(j===0?0:random()*DAY*.6);
      const wrong=corruption()<noise;
      const value=wrong?domain.values[(i+j+2)%5]:state.value;
      const sources=corruption()<.65?2:1; // false facts can have two sources too
      observations.push({
        id:`s${seed}-e${i}-v${j}`,subject,predicate:'status',value,domain:domain.name,
        validFrom:state.start,validUntil:metadata==='oracle'?state.end:observedAt+domain.ttl,
        observedAt,sources,writer:['extractor-a','extractor-b','extractor-c'][j%3],
        url:`https://${domain.name}.example.invalid/records/${subject}?version=${j}`,
        sourceText:`Record ${subject}. Status: ${value}. Effective from ${new Date(state.start).toISOString()}. Observed at ${new Date(observedAt).toISOString()}.`,
        // hidden evaluator annotations never passed to adapters
        corrupted:wrong,truthValue:state.value,truthEnd:state.end
      });
    }
    for(const checkpoint of [10,20,32]){
      const knowledgeTime=T0+checkpoint*DAY;
      for(const kind of ['current','historical']){
        const validTime=kind==='current'?knowledgeTime:T0+random()*(checkpoint-1)*DAY;
        const state=states.find(s=>s.start<=validTime&&validTime<s.end);
        queries.push({id:`q${seed}-${i}-${checkpoint}-${kind}`,cluster:subject,subject,predicate:'status',text:`${subject} status`,knowledgeTime,validTime,kind,domain:domain.name,gold:state?.value??null});
      }
    }
  }
  for(let i=0;i<Math.ceil(entities*.6);i++){
    const subject=`missing${seed}x${i}`;
    queries.push({id:`unknown-${seed}-${i}`,cluster:subject,subject,predicate:'status',text:`${subject} status`,knowledgeTime:T0+32*DAY,validTime:T0+32*DAY,kind:'unknown',domain:'unknown',gold:null});
  }
  observations.sort((a,b)=>a.observedAt-b.observedAt||a.id.localeCompare(b.id));
  queries.sort((a,b)=>a.knowledgeTime-b.knowledgeTime||a.id.localeCompare(b.id));
  return{version:'BMTR-1',seed,entities,noise,metadata,observations,truth,queries};
}
export function toCandidate(o){return{
  id:o.id,kind:'SemanticFact',fact:{subject:o.subject,predicate:o.predicate,object:o.value},
  canonicalText:`${o.subject} ${o.predicate} ${o.value}`,
  validity:{start:o.validFrom,end:o.validUntil,scope:'shared',sourceType:o.domain},
  epistemic:{status:'Active',rank:'Normal',confidence:.9},createdAt:o.observedAt,
  provenance:Array.from({length:o.sources},(_,j)=>({sourceUrl:o.url.replace('https://',`https://source${j}.`),extractedAt:o.observedAt,agentId:o.writer}))
};}
export function summarizeRows(rows){
  const n=rows.length, answered=rows.filter(r=>r.predicted!==null),answerable=rows.filter(r=>r.gold!==null),unanswerable=rows.filter(r=>r.gold===null);
  const mean=(arr,f)=>arr.length?arr.reduce((s,r)=>s+f(r),0)/arr.length:null;
  return{n,answerAccuracy:mean(rows,r=>Number(r.predicted===r.gold)),coverage:answered.length/n,
    answerableSuccess:mean(answerable,r=>Number(r.predicted===r.gold)),
    selectiveAccuracy:mean(answered,r=>Number(r.predicted===r.gold)),
    correctAbstention:mean(unanswerable,r=>Number(r.predicted===null)),
    validEvidenceRecall:mean(answerable,r=>Number(r.goldInHits)),
    wrongAnswerRate:mean(rows,r=>Number(r.predicted!==null&&r.predicted!==r.gold)),
    retrievedCount:rows.reduce((s,r)=>s+r.returned,0),
    relevantEvidencePrecision:rows.reduce((s,r)=>s+r.relevantCorrect,0)/Math.max(1,rows.reduce((s,r)=>s+r.relevantReturned,0))};
}
