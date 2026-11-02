"""Compare fresh dense/BM25 evidence scores with immutable archived outcomes."""
from pathlib import Path
import gzip
import json
from unpack import read_payload

root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'ARTIFACT-MANIFEST.json').read_text())
item=next(x for x in manifest['files'] if x['path']=='evaluation/results/dense-retrieval-outcomes.json')
raw=read_payload(root,item)
expected=json.loads(gzip.decompress(raw) if item['compression']=='gzip' else raw)
actual=json.loads((root/item['path']).read_text())
assert len(actual)==len(expected)==500
rank_changes=0
for old,new in zip(expected,actual):
    for key in ['questionId','type','abstention','evidenceSessionIds','sessions','queryTextIndex']:
        assert old[key]==new[key],(key,old['questionId'])
    assert old['scores'].keys()==new['scores'].keys()
    for method in old['scores']:
        a,b=old['scores'][method],new['scores'][method]
        for metric in ['recall5','recall10','allEvidence10']:
            assert a[metric]==b[metric],(old['questionId'],method,metric,a[metric],b[metric])
        rank_changes+=int(a['retrieved']!=b['retrieved'])
env=json.loads((root/'evaluation/results/dense-retrieval-environment.json').read_text())
assert not env['embeddingCacheReused'] and env['encoderInferenceCalls']>0
print('Fresh real encoder: all500question metrics exactly match frozen evaluated results.')
print('Question/method rankings with platform-dependent tie/order differences:',rank_changes)
