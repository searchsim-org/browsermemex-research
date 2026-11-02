import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const original=JSON.parse(await fs.readFile(new URL('../cikm26/experiments/results/rq1-cross-agent-hard.json',root),'utf8'));
const norm=s=>String(s).trim().toLowerCase().replace(/[^a-z0-9.\-:/ ]/g,'').replace(/\s+/g,' ');
const metrics={};
for(const condition of ['shared','isolated']){
  const scenarios=original[condition];const answers=scenarios.flatMap(x=>x.answers);
  metrics[condition]={scenarios:scenarios.length,answers:answers.length,strictExactCorrect:answers.filter(a=>norm(a.predicted)!==''&&norm(a.predicted)===norm(a.gold)).length,emptyPredictions:answers.filter(a=>!norm(a.predicted)).length,
    agentAMeanTokens:scenarios.reduce((s,x)=>s+x.agentATokens,0)/scenarios.length,agentBMeanTokens:scenarios.reduce((s,x)=>s+x.agentBTokens,0)/scenarios.length,
    perScenario:scenarios.map(x=>({id:x.scenarioId,correct:x.answers.filter(a=>norm(a.predicted)!==''&&norm(a.predicted)===norm(a.gold)).length,n:x.answers.length,agentATokens:x.agentATokens,agentBTokens:x.agentBTokens}))};
}
const out={provenance:'Reanalysis of archived outputs; no new LLM calls. Scenarios are synthetic per archived generator.',providerModelAlias:original.model,metrics};
await fs.writeFile(new URL('results/archive-audit.json',root),JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
