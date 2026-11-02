"""Real MiniLM CPU inference and exactly matched-prefix lexical retrieval."""
from pathlib import Path
import argparse, collections, hashlib, importlib.metadata, json, os, platform, re, resource, sqlite3, sys, time, urllib.request
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
ROOT=Path(__file__).resolve().parents[1]
MODEL='sentence-transformers/all-MiniLM-L6-v2'
REVISION='1110a243fdf4706b3f48f1d95db1a4f5529b4d41'
FILES={'model.onnx':('onnx/model.onnx','6fd5d72fe4589f189f8ebc006442dbb529bb7ce38f8082112682524616046452'),'tokenizer.json':('tokenizer.json','be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037'),'config.json':('config.json','953f9c0d463486b10a6871cc2fd59f223b2c70184f49815e7efbcab5d8908b41'),'vocab.txt':('vocab.txt','07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3'),'tokenizer_config.json':('tokenizer_config.json','acb92769e8195aabd29b7b2137a9e6d6e25c476a4f15aa4355c233426c61576b'),'special_tokens_map.json':('special_tokens_map.json','303df45a03609e4ead04bc3dc1536d0ab19b5358db685b6f3da123d05ec200e3'),'sentence_bert_config.json':('sentence_bert_config.json','fc1993fde0a95c24ec6c022539d41cf6e2f7c9721e5415d6fb6897472a9cd4b7'),'1_Pooling/config.json':('1_Pooling/config.json','4be450dde3b0273bb9787637cfbd28fe04a7ba6ab9d36ac48e92b11e350ffc23')}
def digest(b):return hashlib.sha256(b).hexdigest()
def sha(p):return digest(Path(p).read_bytes())
def rss():return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024)
def timestamp(s):
 m=re.search(r'(\d{4})/(\d{2})/(\d{2}).*?(\d{2}):(\d{2})',s)
 if not m:raise ValueError(s)
 return tuple(map(int,m.groups()))
def score(ids,gold):return {'recall5':sum(i in ids[:5] for i in gold)/len(gold) if gold else None,'recall10':sum(i in ids for i in gold)/len(gold) if gold else None,'allEvidence10':float(all(i in ids for i in gold)) if gold else None}
parser=argparse.ArgumentParser();parser.add_argument('--model-dir',type=Path,default=ROOT/'data/external/models'/('all-MiniLM-L6-v2-'+REVISION[:12]));parser.add_argument('--reuse-embeddings',action='store_true');args=parser.parse_args()
started=time.perf_counter();args.model_dir.mkdir(parents=True,exist_ok=True);downloaded=0
for local,(remote,expected) in FILES.items():
 p=args.model_dir/local;p.parent.mkdir(parents=True,exist_ok=True)
 if not p.exists():
  with urllib.request.urlopen(f'https://huggingface.co/{MODEL}/resolve/{REVISION}/{remote}',timeout=120) as source,p.open('wb') as dest:
   while True:
    part=source.read(1048576)
    if not part:break
    downloaded+=len(part);dest.write(part)
 assert sha(p)==expected, f'Model artifact hash mismatch: {local}'
assert json.loads((args.model_dir/'sentence_bert_config.json').read_text())['max_seq_length']==256
model_bytes=sum((args.model_dir/name).stat().st_size for name in FILES)
data_path=ROOT/'data/external/longmemeval_s_cleaned.json';data_bytes=data_path.read_bytes();dataset_hash=digest(data_bytes)
assert dataset_hash=='d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442'
data=json.loads(data_bytes);del data_bytes;assert len(data)==500
# Only visible role/content text enters unique-text cache. No annotations enter it.
texts=[];text_to_index={};question_info=[];session_indices=[]
def text_index(text):
 if text not in text_to_index:text_to_index[text]=len(texts);texts.append(text)
 return text_to_index[text]
for item in data:
 ids=item['haystack_session_ids'];seen_ids={}
 candidates=[]
 for j in sorted(range(len(ids)),key=lambda i:timestamp(item['haystack_dates'][i])):
  text='\n'.join(f"{turn['role']}: {turn['content']}" for turn in item['haystack_sessions'][j])
  index=text_index(text);session_indices.append(index)
  if ids[j] in seen_ids:
   assert seen_ids[ids[j]]==index, 'Repeated session ID has differing visible text'
   continue
  seen_ids[ids[j]]=index;candidates.append({'id':ids[j],'textIndex':index})
 query_index=text_index(item['question'])
 question_info.append({'questionId':item['question_id'],'type':item['question_type'],'queryIndex':query_index,'candidates':candidates,'evidenceSessionIds':item.get('answer_session_ids',[]),'abstention':item['question_id'].endswith('_abs')})
assert len(session_indices)==23867
prep_start=time.perf_counter();tokenizer=Tokenizer.from_file(str(args.model_dir/'tokenizer.json'));tokenizer.no_padding();tokenizer.no_truncation()
cls=tokenizer.token_to_id('[CLS]');sep=tokenizer.token_to_id('[SEP]');pad=tokenizer.token_to_id('[PAD]')
ids_by_text=[];visible=[];text_meta=[]
for i,text in enumerate(texts):
 encoding=tokenizer.encode(text,add_special_tokens=False);ids=encoding.ids[:254];offset=encoding.offsets[len(ids)-1][1] if ids else 0
 prefix=text[:offset];model_ids=[cls]+ids+[sep]
 assert len(model_ids)<=256
 ids_by_text.append(model_ids);visible.append(prefix);text_meta.append({'index':i,'textSha256':digest(text.encode()),'visibleSha256':digest(prefix.encode()),'originalWordpieces':len(encoding.ids),'visibleWordpieces':len(ids),'modelTokens':len(model_ids),'visibleCharacters':offset,'originalCharacters':len(text),'truncated':len(encoding.ids)>254})
 if (i+1)%2000==0:print('TOKENIZED',i+1,'/',len(texts),flush=True)
preprocessing_seconds=time.perf_counter()-prep_start
# Freeze all information-access metadata before first corpus model inference.
protocol_hash=sha(ROOT/'DENSE-RETRIEVAL-PROTOCOL.md');cache_key=digest(json.dumps({'revision':REVISION,'protocol':protocol_hash,'texts':[x['textSha256'] for x in text_meta]},sort_keys=True).encode())
metadata={'model':MODEL,'revision':REVISION,'license':'Apache-2.0','modelFileSha256':{name:value[1] for name,value in FILES.items()},'scriptSha256':sha(__file__),'protocolSha256':protocol_hash,'datasetSha256':dataset_hash,'maxModelTokens':256,'contentWordpieces':254,'pooling':'Attention-mask mean over all unpadded hidden tokens, then L2 normalization','dtype':'float32','embeddingDimension':384,'batchSize':16,'intraOpThreads':4,'interOpThreads':1,'executionProvider':'CPUExecutionProvider','python':platform.python_version(),'platform':platform.platform(),'machine':platform.machine(),'libraries':{name:importlib.metadata.version(name) for name in ['onnxruntime','tokenizers','numpy']},'nativeSQLite':sqlite3.sqlite_version,'questions':500,'sessionOccurrences':len(session_indices),'distinctQuestionSessionCandidates':sum(len(q['candidates']) for q in question_info),'duplicateSessionIdOccurrences':len(session_indices)-sum(len(q['candidates']) for q in question_info),'uniqueSessionTexts':len(set(session_indices)),'uniqueEncoderInputs':len(texts),'sessionOccurrencesTruncated':sum(text_meta[i]['truncated'] for i in session_indices),'uniqueSessionTextsTruncated':sum(text_meta[i]['truncated'] for i in set(session_indices)),'queriesTruncated':sum(text_meta[q['queryIndex']]['truncated'] for q in question_info),'totalOccurrenceFullWordpieces':sum(text_meta[i]['originalWordpieces'] for i in session_indices),'totalOccurrenceVisibleWordpieces':sum(text_meta[i]['visibleWordpieces'] for i in session_indices),'downloadedBytesDuringInvocation':downloaded,'modelArtifactBytes':model_bytes,'preprocessingSeconds':preprocessing_seconds,'cacheKey':cache_key,'paidApiCalls':0,'encoderInferenceCalls':0,'embeddingCacheReused':False,'peakRssBeforeEncodingBytes':rss(),'primarySources':['https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2','https://onnxruntime.ai/docs/api/python/api_summary.html','https://huggingface.co/docs/tokenizers/api/encoding']}
result_dir=ROOT/'results';environment_file=result_dir/'dense-retrieval-environment.json';environment_file.write_text(json.dumps(metadata,indent=2)+'\n')
(result_dir/'dense-retrieval-text-manifest.json').write_text(json.dumps({'cacheKey':cache_key,'texts':text_meta,'questions':question_info},indent=2)+'\n')
vector_file=result_dir/'dense-retrieval-embeddings.npy';cache_manifest=result_dir/'dense-retrieval-cache.json';encode_start=time.perf_counter()
if args.reuse_embeddings and vector_file.exists() and cache_manifest.exists() and json.loads(cache_manifest.read_text())['cacheKey']==cache_key:
 embeddings=np.load(vector_file);assert embeddings.shape==(len(texts),384);assert np.isfinite(embeddings).all();metadata['embeddingCacheReused']=True
else:
 options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
 session=ort.InferenceSession(str(args.model_dir/'model.onnx'),sess_options=options,providers=['CPUExecutionProvider']);metadata['actualSessionProviders']=session.get_providers()
 embeddings=np.full((len(texts),384),np.nan,dtype=np.float32)
 for first in range(0,len(texts),16):
  batch=ids_by_text[first:first+16];length=max(map(len,batch));input_ids=np.full((len(batch),length),pad,dtype=np.int64);mask=np.zeros_like(input_ids)
  for j,ids in enumerate(batch):input_ids[j,:len(ids)]=ids;mask[j,:len(ids)]=1
  outputs=session.run(['last_hidden_state'],{'input_ids':input_ids,'attention_mask':mask,'token_type_ids':np.zeros_like(input_ids)})[0]
  pooled=(outputs*mask[:,:,None]).sum(axis=1)/mask.sum(axis=1)[:,None]
  pooled=pooled.astype(np.float32);pooled/=np.linalg.norm(pooled,axis=1,keepdims=True)
  embeddings[first:first+len(batch)]=pooled;metadata['encoderInferenceCalls']+=1
  if (first+16)%256==0:print('ENCODED',min(first+16,len(texts)),'/',len(texts),'seconds',round(time.perf_counter()-encode_start,1),flush=True)
 assert np.isfinite(embeddings).all();assert np.max(np.abs(np.linalg.norm(embeddings,axis=1)-1))<1e-5
 np.save(vector_file,embeddings);cache_manifest.write_text(json.dumps({'cacheKey':cache_key,'sha256':sha(vector_file),'shape':list(embeddings.shape)},indent=2)+'\n')
metadata['encodingSeconds']=time.perf_counter()-encode_start;metadata['embeddingBytes']=int(embeddings.nbytes);metadata['peakRssAfterEncodingBytes']=rss();environment_file.write_text(json.dumps(metadata,indent=2)+'\n')
# Rank only inside each question's own provided-history pool.
outcomes=[];retrieval_start=time.perf_counter();lexical_index_seconds=0.;lexical_query_seconds=0.;dense_query_seconds=0.
for item in question_info:
 candidates=item['candidates'];session_ids=[x['id'] for x in candidates];indices=[x['textIndex'] for x in candidates];query_index=item['queryIndex']
 start=time.perf_counter();similarities=embeddings[indices]@embeddings[query_index];dense_order=sorted(range(len(candidates)),key=lambda i:(-float(similarities[i]),i))[:10];dense_query_seconds+=time.perf_counter()-start
 dense_ids=[session_ids[i] for i in dense_order]
 start=time.perf_counter();db=sqlite3.connect(':memory:');db.execute('CREATE VIRTUAL TABLE corpus USING fts5(session_id UNINDEXED,text)');db.executemany('INSERT INTO corpus(session_id,text) VALUES(?,?)',[(session_ids[i],visible[index]) for i,index in enumerate(indices)]);lexical_index_seconds+=time.perf_counter()-start
 terms=re.findall(r'[^\W_]+',visible[query_index].lower(),flags=re.UNICODE);match=' OR '.join('"'+t+'"' for t in terms)
 start=time.perf_counter();bm25=list(db.execute('SELECT session_id,bm25(corpus) AS score FROM corpus WHERE corpus MATCH ? ORDER BY score ASC,rowid ASC LIMIT 10',(match,))) if match else [];lexical_query_seconds+=time.perf_counter()-start;db.close()
 lexical_ids=[r[0] for r in bm25];gold=item['evidenceSessionIds']
 outcomes.append({'questionId':item['questionId'],'type':item['type'],'abstention':item['abstention'],'evidenceSessionIds':gold,'sessions':len(candidates),'queryTextIndex':query_index,'scores':{'dense-minilm':{'retrieved':dense_ids,'similarities':[float(similarities[i]) for i in dense_order],**score(dense_ids,gold)},'bm25-matched-prefix':{'retrieved':lexical_ids,'bm25Scores':[r[1] for r in bm25],**score(lexical_ids,gold)}}})
 if len(outcomes)%50==0:print('SCORED',len(outcomes),'/500',flush=True)
(result_dir/'dense-retrieval-outcomes.json').write_text(json.dumps(outcomes,indent=2)+'\n')
eligible=[x for x in outcomes if not x['abstention'] and x['evidenceSessionIds']];assert len(eligible)==470
# One paired draw matrix is shared by both methods and their differences.
bootstrap=np.random.RandomState(27301).randint(0,len(eligible),size=(2000,len(eligible)))
def describe(values):
 values=np.asarray(values,dtype=np.float64);means=values[bootstrap].mean(axis=1)
 return {'mean':float(values.mean()),'low95':float(np.quantile(means,.025)),'high95':float(np.quantile(means,.975))}
summary={};paired={}
for method in ['dense-minilm','bm25-matched-prefix']:
 summary[method]={metric:describe([x['scores'][method][metric] for x in eligible]) for metric in ['recall5','recall10','allEvidence10']}
for metric in ['recall5','recall10','allEvidence10']:paired[metric]=describe([x['scores']['dense-minilm'][metric]-x['scores']['bm25-matched-prefix'][metric] for x in eligible])
by_type={}
for kind in sorted({x['type'] for x in eligible}):
 chosen=[x for x in eligible if x['type']==kind];by_type[kind]={'questions':len(chosen),**{method:{metric:float(np.mean([x['scores'][method][metric] for x in chosen])) for metric in ['recall5','recall10','allEvidence10']} for method in ['dense-minilm','bm25-matched-prefix']}}
metadata.update(eligibleQuestions=len(eligible),abstentionQuestions=30,lexicalIndexSeconds=lexical_index_seconds,lexicalQuerySeconds=lexical_query_seconds,denseQuerySeconds=dense_query_seconds,retrievalSeconds=time.perf_counter()-retrieval_start,totalSeconds=time.perf_counter()-started,peakRssBytes=rss(),embeddingFileSha256=sha(vector_file))
environment_file.write_text(json.dumps(metadata,indent=2)+'\n')
report={'environment':metadata,'summary':summary,'pairedDenseMinusMatchedBM25':paired,'bootstrap':{'resamples':2000,'seed':27301,'unit':'470non-abstention questions','interval':'Percentile95% paired question bootstrap, conditional on this fixed benchmark'},'byQuestionType':by_type,'comparisonBoundary':'Same original text prefix per session/query and same provided candidate IDs; no full-session lexical versus truncated dense comparison'}
(result_dir/'dense-retrieval-summary.json').write_text(json.dumps(report,indent=2)+'\n');print('FINAL',json.dumps({'summary':summary,'paired':paired,'seconds':metadata['totalSeconds'],'truncatedOccurrences':metadata['sessionOccurrencesTruncated'],'peakRssBytes':metadata['peakRssBytes']}),flush=True)
