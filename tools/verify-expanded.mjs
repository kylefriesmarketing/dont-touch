import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Sim,C,WORK_HALF,WORK_AT} from '../sim.js';
const log=[];const run=(s,days)=>{for(let t=0;t<days*C.TICKS_PER_DAY;t++)s.step();};
for(const N of [96,144,192])for(const seed of ['live','law','report',10,1234,7919]){
 const s=new Sim({seed,N});
 assert.equal(s.N,N);assert.equal(s.works.length,14,'missing founding works '+seed+'/'+N);
 for(let i=0;i<s.works.length;i++)for(let j=0;j<i;j++){
 const a=s.works[i],b=s.works[j],d=Math.hypot(a.x-b.x,a.y-b.y);
 assert(d>=WORK_HALF[a.kind]+WORK_HALF[b.kind]+1.19,`overlap ${N}/${seed}: ${d}`);
 }
 for(let id=0;id<s.count;id++)if(s.k.alive[id]){assert(s.inJar(s.k.x[id],s.k.y[id]));assert(s.water[s.idx(s.k.x[id],s.k.y[id])]<=.001);}
 s.step();
 const r=Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));assert.deepEqual(r.toJSON(),s.toJSON());
 log.push({N,seed,works:s.works.length});
}
console.log('18 opening layouts: all 14 works, no footprint overlap, dry founders, full save round-trip.');
for(const seed of ['live','law','report',7919]){
 const s=new Sim({seed});run(s,20);
 assert(s.alive>=8,`opening collapse ${seed}: ${s.alive}`);
 const r=Sim.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));assert.deepEqual(r.toJSON(),s.toJSON());
 s.setTilt(.08,-.03);r.setTilt(.08,-.03);run(s,1);run(r,1);assert.equal(s.fingerprint(),r.fingerprint());
 console.log(JSON.stringify({seed,day:s.day,alive:s.alive,works:s.works.length,wellbeing:s.wellbeing,deterministic:true}));
 run(s,39);assert(s.alive>0,`colony died out ${seed}`);
 for(let id=0;id<s.count;id++)if(s.k.alive[id])assert(Number.isFinite(s.k.x[id])&&Number.isFinite(s.k.y[id]));
 console.log(JSON.stringify({seed,day:s.day,alive:s.alive,works:s.works.length,age:s.ageNow()}));
}
const world=JSON.parse(fs.readFileSync(new URL('../worlds/keswick.json',import.meta.url),'utf8'));
const baked=new Sim({seed:'baked-check',world});baked.step();const restored=Sim.fromJSON(JSON.parse(JSON.stringify(baked.toJSON())),world);assert.equal(restored.N,world.N);assert.deepEqual(restored.toJSON(),baked.toJSON());
console.log('PASS: expanded-world, opening, determinism, legacy size, and baked-world checks.');
