"""Derive manuscript tables and figures from recorded outputs only."""
import json, math, statistics, pathlib, os
import random
os.environ.setdefault('MPLCONFIGDIR','/tmp/bmtr-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=pathlib.Path(__file__).resolve().parents[1]
FIG=ROOT.parent/'figures';FIG.mkdir(exist_ok=True)
data=json.loads((ROOT/'results/temporal-summary.json').read_text())
extra=ROOT/'results/strong-controls-summary.json'
if extra.exists():
 for setting,worlds in json.loads(extra.read_text()).items():
  for seed,item in worlds.items():data[setting][seed]['methods'].update(item['methods'])
names={'latest':'Latest observation','bm25':'BM25','bm25-time':'BM25 + time','bm25-time-recency':'BM25 + time + recency','latest-valid':'Latest valid (exact key)','webnugget':'WebNugget Active','webnugget-contested':'WebNugget + Contested'}
colors={'latest':'#767676','bm25':'#b55e3c','bm25-time':'#346a9f','latest-valid':'#b47822','webnugget':'#16766c','webnugget-contested':'#8b6396'}
def vals(setting,method,metric,kind='all'):
 return [v['methods'][method][kind][metric] for v in data[setting].values()]
def ci(a):
 return statistics.mean(a),2.776445*statistics.stdev(a)/math.sqrt(len(a))
def fmt(a,percent=True):
 m,e=ci(a);s=100 if percent else 1
 return f'{m*s:.1f} $\\pm$ {e*s:.1f}'
table=[]
for setting,label in [('ttl-noise0','Estimated intervals; clean'),('ttl-noise0.1','Estimated intervals; 10\\% corruption')]:
 table.append(r'\multicolumn{5}{l}{\textit{'+label+r'}}\\')
 for m in names:
  table.append(names[m]+' & '+' & '.join(fmt(vals(setting,m,metric))for metric in ['answerAccuracy','wrongAnswerRate','coverage','validEvidenceRecall'])+r' \\')
 table.append(r'\addlinespace')
(ROOT/'results/temporal-table.tex').write_text(r'\begin{tabular}{@{}lrrrr@{}}\toprule Method & Accuracy $\uparrow$ & Wrong $\downarrow$ & Coverage & Recall $\uparrow$\\\midrule'+'\n'+'\n'.join(table)+'\n'+r'\bottomrule\end{tabular}'+'\n')
summary={setting:{m:{metric:{'mean':ci(vals(setting,m,metric))[0],'ci95HalfWidth':ci(vals(setting,m,metric))[1]}for metric in ['answerAccuracy','wrongAnswerRate','coverage','validEvidenceRecall']}for m in names}for setting in data}
(ROOT/'results/aggregate-statistics.json').write_text(json.dumps(summary,indent=2))
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'axes.spines.top':False,'axes.spines.right':False,'pdf.fonttype':42})
fig,axes=plt.subplots(1,2,figsize=(6.8,2.65),layout='constrained')
for ax,metadata,title in zip(axes,['oracle','ttl'],['Exact validity intervals','Estimated validity intervals']):
 for m in ['latest','bm25-time','latest-valid','webnugget','webnugget-contested']:
  xs=[];ys=[]
  for noise in [0,.05,.1,.2]:
   setting=f'{metadata}-noise{noise if noise else 0}';xs.append(100*ci(vals(setting,m,'coverage'))[0]);ys.append(100*ci(vals(setting,m,'wrongAnswerRate'))[0])
  ax.plot(xs,ys,'o-',label=names[m],color=colors[m],markersize=4,lw=1.4)
  for x,y,n in zip(xs,ys,[0,5,10,20]):
   if m=='webnugget':ax.annotate(str(n),(x,y),xytext=(4,1),textcoords='offset points',fontsize=7)
 ax.set(title=title,xlabel='Answer coverage (%)',ylabel='Wrong answers / all queries (%)',xlim=(0,100),ylim=(-1,52));ax.grid(alpha=.18)
axes[0].legend(fontsize=6.5,loc='upper left');fig.savefig(FIG/'quality-coverage.pdf');fig.savefig(FIG/'quality-coverage.png',dpi=200);plt.close(fig)
fig,ax=plt.subplots(figsize=(6.8,2.25),layout='constrained')
xs=[0,5,10,20]
for m in ['latest','bm25-time','latest-valid','webnugget','webnugget-contested']:
 means=[];errs=[]
 for n in [0,.05,.1,.2]:
  a=vals(f'ttl-noise{n if n else 0}',m,'wrongAnswerRate');mean,err=ci(a);means.append(mean*100);errs.append(err*100)
 ax.errorbar(xs,means,yerr=errs,label=names[m],color=colors[m],marker='o',capsize=2,lw=1.5)
ax.set(xlabel='Corrupted observations (%)',ylabel='Wrong answers / all queries (%)',xticks=xs,ylim=(-1,55));ax.grid(alpha=.18);ax.legend(fontsize=7,ncol=2,loc='upper left');fig.savefig(FIG/'corruption.pdf');plt.close(fig)
scale_path=ROOT/'results/scale.json'
if scale_path.exists():
 table=[]
 for filename,label in [('scale.json','Original schema'),('scale-indexed.json','Companion composite index')]:
  p=ROOT/'results'/filename
  if not p.exists():continue
  table.append(r'\multicolumn{6}{l}{\textit{'+label+r'}}\\')
  for s in json.loads(p.read_text()):
   table.append(f"{s['n']:,} & {s['insertsPerSecond']:.0f} & {s['dbBytes']/2**20:.2f} & {s['rssBytes']/2**20:.1f} & {s['coldOrder']['p95']:.3f} & {s['warmOrder']['p95']:.3f}"+r' \\')
 (ROOT/'results/scale-table.tex').write_text(r'\begin{tabular}{@{}rrrrrr@{}}\toprule Records & Inserts/s & DB & RSS & First P95 & Repeated P95\\\midrule'+'\n'+'\n'.join(table)+'\n'+r'\bottomrule\end{tabular}'+'\n')
audit=json.loads((ROOT/'results/archive-audit.json').read_text());sh=audit['metrics']['shared'];iso=audit['metrics']['isolated']
macros={
 'SharedTokens':sh['agentBMeanTokens'],'IsolatedTokens':iso['agentBMeanTokens'],'ExtractionTokens':sh['agentAMeanTokens'],
 'FollowerSaving':100*(1-sh['agentBMeanTokens']/iso['agentBMeanTokens']),
 'FullSaving':100*(1-(sh['agentBMeanTokens']+sh['agentAMeanTokens'])/iso['agentBMeanTokens']),
 'WrongReduction':100*(1-summary['ttl-noise0']['webnugget']['wrongAnswerRate']['mean']/summary['ttl-noise0']['bm25-time']['wrongAnswerRate']['mean'])}
(ROOT/'results/macros.tex').write_text('\n'.join('\\newcommand{\\'+k+'}{'+f'{v:.1f}'+'}'for k,v in macros.items())+'\n')
print(json.dumps(macros,indent=2))
orchestration_path=ROOT/'results/orchestration-summary.json'
if orchestration_path.exists():
 skills=json.loads(orchestration_path.read_text())['skills']['summary']
 lines=[r'\begin{tabular}{@{}lrrrr@{}}\toprule Trace & $\theta$ & Precision & Recall & Bad\\\midrule']
 def skill_fmt(d):return f'{100*d["mean"]:.1f} $\\pm$ {100*d["ci95HalfWidth"]:.1f}'
 for method,label in [('operational','Operational'),('value-checked','Value-checked')]:
  for threshold,v in skills[method].items():
   lines.append(f'{label} & {threshold} & {skill_fmt(v["precision"])} & {skill_fmt(v["recall"])} & {v["semanticFalse"]["mean"]:.1f}'+r' \\')
 lines.append(r'\bottomrule\end{tabular}')
 (ROOT/'results/orchestration-skill-table.tex').write_text('\n'.join(lines)+'\n')
external_path=ROOT/'results/longmemeval-provided-outcomes.json'
if external_path.exists():
 external=json.loads(external_path.read_text());eligible=[x for x in external if not x['abstention'] and x['evidenceSessionIds']]
 r=random.Random(27009);samples=[[r.randrange(len(eligible))for _ in eligible]for _ in range(2000)]
 labels={'unexpired':'No expiry (actual core)','ttl7':'7-day expiry','ttl30':'30-day expiry','ttl90':'90-day expiry'};lines=[];stats={}
 for method,label in labels.items():
  metrics=[];stats[method]={}
  for metric in ['recall5','recall10','allEvidence10']:
   values=[x['scores'][method][metric]for x in eligible];mean=statistics.mean(values)
   bs=sorted(statistics.mean(values[i]for i in sample)for sample in samples);lo=bs[49];hi=bs[1949]
   stats[method][metric]={'mean':mean,'low95':lo,'high95':hi}
   metrics.append(f'{100*mean:.1f} [{100*lo:.1f}, {100*hi:.1f}]')
  lines.append(label+' & '+' & '.join(metrics)+r' \\')
 (ROOT/'results/longmemeval-table.tex').write_text(r'\begin{tabular}{@{}lrrr@{}}\toprule Retention & Recall@5 & Recall@10 & All evidence@10\\\midrule'+'\n'+'\n'.join(lines)+'\n'+r'\bottomrule\end{tabular}'+'\n')
 (ROOT/'results/longmemeval-statistics.json').write_text(json.dumps(stats,indent=2))
