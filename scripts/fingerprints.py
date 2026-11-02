"""Freeze/verify canonical scientific values; never benchmark timings."""
from pathlib import Path
import argparse,gzip,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
FILES=[
 'query-outcomes.jsonl','strong-controls-outcomes.jsonl',
 'orchestration-routing-inputs.jsonl','orchestration-routing-outcomes.jsonl',
 'orchestration-skill-traces.json','orchestration-summary.json',
 'episode-repair-original.json','episode-repair-stress.json',
 'episode-repair-stress-inputs.json','independent-backend-outcomes.jsonl',
 'archive-audit.json','contracts.json','mechanism-ablation-outcomes.json']
OMIT={'latencyMs','elapsedMs','elapsedSeconds','started','finished','node','python','numpy'}
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in OMIT}
 if isinstance(x,list):return [clean(v) for v in x]
 return x
def fingerprint(name):
 path=ROOT/'evaluation/results'/name
 # Freeze always reads the frozen compressed bytes when available. Later verification
 # reads freshly regenerated logical files, so it cannot validate stale gzip copies.
 frozen=MODE=='freeze'
 z=Path(str(path)+'.gz')
 text=gzip.decompress(z.read_bytes()).decode() if (frozen and z.exists()) or not path.exists() else path.read_text()
 h=hashlib.sha256();rows=0
 values=(json.loads(s) for s in text.splitlines() if s.strip()) if name.endswith('.jsonl') else [json.loads(text)]
 for value in values:
  h.update(json.dumps(clean(value),sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode());h.update(b'\n');rows+=1
 return {'sha256':h.hexdigest(),'records':rows}
def main():
 global MODE
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['freeze','verify']);p.add_argument('--only',nargs='*');a=p.parse_args();MODE=a.mode
 target=ROOT/'EXPECTED-SCIENTIFIC-FINGERPRINTS.json'
 if MODE=='freeze':
  expected={'format':'canonical-scientific-json-v1','omittedKeys':sorted(OMIT),'files':{name:fingerprint(name) for name in FILES}}
  target.write_text(json.dumps(expected,indent=2)+'\n');print('Froze scientific fingerprints from evaluated outputs before reproduction');return
 expected=json.loads(target.read_text())['files']
 for name in a.only or FILES:
  actual=fingerprint(name);assert actual==expected[name],f'Scientific result mismatch: {name}: {actual} != {expected[name]}'
  print('Scientific fingerprint matches:',name,actual['records'])
if __name__=='__main__':main()
