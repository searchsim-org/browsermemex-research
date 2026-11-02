"""Post-audit, label-blind coverage matching of saved replay predictions."""
from pathlib import Path
import hashlib
import json
import math
import random
import statistics

ROOT = Path(__file__).resolve().parents[1]
FILES = [ROOT / 'results/query-outcomes.jsonl', ROOT / 'results/strong-controls-outcomes.jsonl']
groups = {}
for path in FILES:
    with path.open() as handle:
        for line in handle:
            row = json.loads(line)
            if row['method'] not in {'webnugget', 'latest-valid'}:
                continue
            key = (row['metadata'], row['noise'], row['seed'])
            groups.setdefault(key, {}).setdefault(row['method'], []).append(row)


def metrics(rows):
    n = len(rows)
    answered = [r for r in rows if r['predicted'] is not None]
    correct = sum(r['predicted'] == r['gold'] for r in rows)
    wrong = sum(r['predicted'] != r['gold'] for r in answered)
    return {'n': n, 'answered': len(answered), 'accuracy': correct/n,
            'wrongRate': wrong/n, 'coverage': len(answered)/n,
            'selectiveAccuracy': 1-wrong/len(answered) if answered else None}


raw = []
for (metadata, noise, seed), methods in sorted(groups.items()):
    active = sorted(methods['webnugget'], key=lambda r: r['id'])
    latest = sorted(methods['latest-valid'], key=lambda r: r['id'])
    assert [r['id'] for r in active] == [r['id'] for r in latest]
    assert [r['gold'] for r in active] == [r['gold'] for r in latest]
    a, b = metrics(active), metrics(latest)
    indices = [i for i, r in enumerate(latest) if r['predicted'] is not None]
    assert a['answered'] <= len(indices)
    permutations = []
    for repetition in range(100):
        sampler_seed = 271000 + (seed-27001)*100 + repetition
        selected = set(random.Random(sampler_seed).sample(indices, a['answered']))
        thinned = [r if i in selected else dict(r, predicted=None)
                   for i, r in enumerate(latest)]
        m = metrics(thinned)
        assert m['answered'] == a['answered']
        permutations.append({'samplerSeed': sampler_seed, **m})
    expected_wrong = b['wrongRate'] * a['answered']/b['answered'] if b['answered'] else 0
    raw.append({'metadata': metadata, 'noise': noise, 'seed': seed,
                'active': a, 'latestValid': b,
                'slices': {kind: {'active': metrics([r for r in active if r['kind']==kind]),
                                  'latestValid': metrics([r for r in latest if r['kind']==kind])}
                           for kind in ['current', 'historical', 'unknown']},
                'expectedMatchedWrongRate': expected_wrong,
                'matchedMean': {m: statistics.mean(x[m] for x in permutations)
                                for m in ['accuracy', 'wrongRate', 'coverage', 'selectiveAccuracy']},
                'permutations': permutations})


def estimate(values):
    return {'mean': statistics.mean(values),
            'ci95HalfWidth': 2.776445*statistics.stdev(values)/math.sqrt(len(values))}


summary = {}
for metadata in ['oracle', 'ttl']:
    for noise in [0, .05, .1, .2]:
        worlds = [r for r in raw if r['metadata']==metadata and r['noise']==noise]
        assert len(worlds)==5
        label = f'{metadata}-noise{noise:g}'
        summary[label] = {policy: {m: estimate([r[policy][m] for r in worlds])
                                   for m in ['accuracy', 'wrongRate', 'coverage', 'selectiveAccuracy']}
                          for policy in ['active', 'latestValid', 'matchedMean']}
        summary[label]['expectedMatchedWrongRate'] = estimate([r['expectedMatchedWrongRate'] for r in worlds])
        summary[label]['pairedActiveMinusMatchedWrongRate'] = estimate([
            r['active']['wrongRate']-r['matchedMean']['wrongRate'] for r in worlds])
        print(label, 'Active wrong', round(100*summary[label]['active']['wrongRate']['mean'],3),
              'matched latest-valid wrong', round(100*summary[label]['matchedMean']['wrongRate']['mean'],3),
              'coverage', round(100*summary[label]['active']['coverage']['mean'],3))

manifest = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in FILES+[ROOT/'COVERAGE-PROTOCOL.md']}
output = {'analysis':'post-audit coverage matching', 'independentWorlds':5,
          'permutationsPerWorld':100, 'inputHashes':manifest, 'summary':summary, 'worlds':raw}
(ROOT/'results/coverage-matched.json').write_text(json.dumps(output,indent=2)+'\n')
table = [r'\begin{tabular}{@{}lrrrr@{}}\toprule',
         r'Intervals; corruption & Coverage & Active wrong & Matched wrong & Difference\\\midrule']
for label, item in summary.items():
    intervals, noise = label.split('-noise')
    name = ('Exact' if intervals=='oracle' else 'Estimated') + f'; {float(noise)*100:g}'+r'\%'
    delta = item['pairedActiveMinusMatchedWrongRate']
    table.append(name+' & '+' & '.join(f'{100*item[policy][metric]["mean"]:.2f}'
                 for policy,metric in [('active','coverage'),('active','wrongRate'),('matchedMean','wrongRate')])
                 +f' & {100*delta["mean"]:+.2f} $\\pm$ {100*delta["ci95HalfWidth"]:.2f}'+r' \\')
table.append(r'\bottomrule\end{tabular}')
(ROOT/'results/coverage-matched-table.tex').write_text('\n'.join(table)+'\n')
