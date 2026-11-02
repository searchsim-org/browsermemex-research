import os,pathlib
os.environ.setdefault('MPLCONFIGDIR','/tmp/bmtr-matplotlib')
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
fig,ax=plt.subplots(figsize=(6.8,2.5));ax.set(xlim=(0,10),ylim=(0,3.6));ax.axis('off')
def box(x,y,w,h,text,color='#edf4f4',edge='#45726f',size=8):
 ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle='round,pad=0.05,rounding_size=.06',facecolor=color,edgecolor=edge,linewidth=.8));ax.text(x+w/2,y+h/2,text,ha='center',va='center',fontsize=size,color='#193b3b')
def arrow(a,b):ax.annotate('',xy=b,xytext=a,arrowprops=dict(arrowstyle='->',lw=.9,color='#52666f'))
box(3,.1,3.1,3.3,'',color='#f4f7f8',edge='#a7b8be');ax.text(4.55,3.13,'AUTHORITATIVE LOCAL STATE',ha='center',fontsize=7.3,weight='bold',color='#2c5458')
box(3.2,1.82,2.7,1.0,'Core API / MCP bridge\nRegistry, scheduler, router, skills',size=7.6)
box(3.2,.42,2.7,.85,'Memory + provenance\nExecution traces\nSQLite / FTS5 / OPFS',size=7.6)
arrow((4.55,1.82),(4.55,1.27))
box(.15,1.9,2.15,1.0,'Agent clients\nModel inference\nLocal or remote',color='#fbf6ec',edge='#ad9464')
arrow((2.3,2.4),(3.2,2.4));ax.text(2.72,2.58,'tools',ha='center',fontsize=6.7)
box(7.35,1.9,2.45,1.0,'Replay generator\nObservations + truth ledger',color='#f4edf6',edge='#907399',size=7.7)
arrow((7.35,2.4),(5.9,2.4));ax.text(6.62,2.58,'observations',ha='center',fontsize=6.7)
box(7.35,.42,2.45,.85,'Scorer\nRaw query outcomes',color='#ffffff',edge='#907399')
arrow((8.58,1.9),(8.58,1.27));ax.text(8.72,1.55,'gold only',va='center',fontsize=6.7)
arrow((5.9,.84),(7.35,.84));ax.text(6.62,1.01,'retrieval',ha='center',fontsize=6.7)
fig.tight_layout(pad=.2);p=pathlib.Path(__file__).resolve().parents[2]/'figures';fig.savefig(p/'architecture.pdf');plt.close(fig)
