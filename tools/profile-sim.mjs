import fs from 'node:fs';import {Sim} from '../sim.js';
const s=Sim.fromJSON(JSON.parse(fs.readFileSync(new URL('../output/mature-colony.json',import.meta.url),'utf8'))),stats={};
for(const name of ['_kin','_weave','_sow','_growth','_thermal','_fluids','_irrigate','_decide','_move']){
 const fn=s[name];stats[name]={calls:0,ms:0};s[name]=function(...a){const t=performance.now();try{return fn.apply(this,a);}finally{stats[name].calls++;stats[name].ms+=performance.now()-t;}};
}
const times=[];for(let i=0;i<900;i++){const t=performance.now();s.step();times.push(performance.now()-t);}times.sort((a,b)=>a-b);
const result={alive:s.alive,works:s.works.length,tickMs:{median:times[450],p95:times[855],max:times[899]},methods:stats};console.log(JSON.stringify(result,null,2));fs.writeFileSync(new URL('../output/sim-profile.json',import.meta.url),JSON.stringify(result,null,2));
