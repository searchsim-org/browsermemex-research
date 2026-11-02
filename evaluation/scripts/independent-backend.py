"""Independent rank-bm25 backend on frozen BMTR inputs; no model calls."""
from pathlib import Path
import collections, hashlib, importlib.metadata, inspect, json, math, platform, re, statistics, time
import numpy as np
import rank_bm25
from rank_bm25 import BM25Okapi
ROOT=Path(__file__).resolve().parents[1]
METHODS=('rank-bm25','rank-bm25-time','rank-bm25-time-recency')
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def tokens(s):return re.findall(r'[^\W_]+',s.lower(),flags=re.UNICODE)
def metrics(rows):
 answerable=[r for r in rows if r['gold'] is not None]
 return {'n':len(rows),'answerAccuracy':sum(r['predicted']==r['gold'] for r in rows)/len(rows),'wrongAnswerRate':sum(r['predicted'] is not None and r['predicted']!=r['gold'] for r in rows)/len(rows),'coverage':sum(r['predicted'] is not None for r in rows)/len(rows),'validEvidenceRecall':sum(r['goldInHits'] for r in answerable)/len(answerable) if answerable else None}
def ci(v):
 return {'mean':statistics.mean(v),'ci95HalfWidth':2.776445*statistics.stdev(v)/math.sqrt(len(v)),'values':v}
started=time.time();results=[];worlds=[];input_hashes={}
output=ROOT/'results/independent-backend-outcomes.jsonl'
with output.open('w') as dest:
 for path in sorted((ROOT/'data').glob('*-seed*.json')):
  data=json.loads(path.read_text());assert len(data['queries'])==1320
  input_hashes[path.name]=sha(path)
  # Construct observable records explicitly, discarding all hidden labels.
  observed=[{k:o[k] for k in ['id','subject','predicate','value','observedAt','validFrom','validUntil']} for o in data['observations']]
  grouped=collections.defaultdict(list)
  for q in data['queries']:grouped[q['knowledgeTime']].append(q)
  local={m:[] for m in METHODS}
  for checkpoint,queries in grouped.items():
   corpus=[o for o in observed if o['observedAt']<=checkpoint]
   docs=[tokens(f"{o['subject']} {o['predicate']} {o['value']}") for o in corpus]
   index=BM25Okapi(docs);docsets=list(map(set,docs))
   for q in queries:
    terms=tokens(q['text']);scores=index.get_scores(terms);termset=set(terms)
    eligible=[i for i,d in enumerate(docsets) if d & termset]
    for method in METHODS:
     choices=eligible if method=='rank-bm25' else [i for i in eligible if corpus[i]['validFrom']<=q['validTime']<corpus[i]['validUntil']]
     if method.endswith('-recency'):ordered=sorted(choices,key=lambda i:(-scores[i],-corpus[i]['validFrom'],-corpus[i]['observedAt'],corpus[i]['id']))
     else:ordered=sorted(choices,key=lambda i:(-scores[i],i))
     chosen=ordered[:10];relevant=[i for i in chosen if corpus[i]['subject']==q['subject'] and corpus[i]['predicate']==q['predicate']]
     predicted=corpus[relevant[0]]['value'] if relevant else None
     row={'id':q['id'],'cluster':q['cluster'],'kind':q['kind'],'domain':q['domain'],'seed':data['seed'],'metadata':data['metadata'],'noise':data['noise'],'method':method,'gold':q['gold'],'predicted':predicted,'goldInHits':q['gold'] is not None and any(corpus[i]['value']==q['gold'] for i in relevant),'returned':len(chosen),'relevantReturned':len(relevant),'relevantCorrect':sum(q['gold'] is not None and corpus[i]['value']==q['gold'] for i in relevant),'evidence':[{'id':corpus[i]['id'],'score':float(scores[i])} for i in chosen]}
     local[method].append(row);dest.write(json.dumps(row,separators=(',',':'))+'\n')
  setting=f"{data['metadata']}-noise{data['noise']}"
  world={'seed':data['seed'],'setting':setting,'metadata':data['metadata'],'noise':data['noise'],'observations':len(observed),'queries':len(data['queries']),'methods':{m:{'all':metrics(rows),**{kind:metrics([r for r in rows if r['kind']==kind]) for kind in ['current','historical','unknown']}} for m,rows in local.items()}}
  worlds.append(world);print(path.name,json.dumps({m:world['methods'][m]['all']['answerAccuracy'] for m in METHODS}),flush=True)
# Unknown-only query slices contain no answerable examples: recall undefined.
summary={}
for setting in sorted({w['setting'] for w in worlds}):
 selected=[w for w in worlds if w['setting']==setting]
 summary[setting]={m:{metric:ci([w['methods'][m]['all'][metric] for w in selected]) for metric in ['answerAccuracy','wrongAnswerRate','coverage','validEvidenceRecall']} for m in METHODS}
report={'backend':'rank-bm25 BM25Okapi','version':importlib.metadata.version('rank-bm25'),'license':'Apache-2.0','primaryDocumentation':'https://github.com/dorianbrown/rank_bm25','python':platform.python_version(),'numpy':np.__version__,'rankBm25SourceSha256':sha(inspect.getsourcefile(rank_bm25)),'scriptSha256':sha(__file__),'protocolSha256':sha(ROOT/'INDEPENDENT-BACKEND-PROTOCOL.md'),'inputSha256':input_hashes,'worlds':len(worlds),'queryInstances':sum(w['queries'] for w in worlds),'methodOutcomes':sum(w['queries']*len(METHODS) for w in worlds),'modelCalls':0,'elapsedSeconds':time.time()-started,'aggregation':'Mean and Student-t95% interval across5 worlds; generator variation only','byWorld':worlds,'summary':summary}
(ROOT/'results/independent-backend-summary.json').write_text(json.dumps(report,indent=2)+'\n')
print('Completed',report['methodOutcomes'],'outcomes',report['elapsedSeconds'],'seconds',flush=True)
