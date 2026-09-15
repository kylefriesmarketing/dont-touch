import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Sim,C,WORK_AT} from '../sim.js';
const baseline=process.argv.includes('--original');
if(!baseline){const src=fs.readFileSync(new URL('../sim.js',import.meta.url),'utf8');assert(src.includes('for (const o of services)'));fs.mkdirSync(new URL('../output/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../output/sim-linear-service.js',import.meta.url),src.replace('for (const o of services)','for (const o of this.works)'));}
const {Sim:Old}=await import(baseline?'../output/sim-before-service.js':'../output/sim-linear-service.js');
const maturePath=new URL('../output/mature-colony.json',import.meta.url);
const fixtures=[['small',new Sim({seed:'service',N:96}).toJSON()],['large',new Sim({seed:'law',N:192}).toJSON()]];
if(fs.existsSync(maturePath))fixtures.push(['mature',JSON.parse(fs.readFileSync(maturePath,'utf8'))]);
const results=[];
for(const [name,json] of fixtures){
 const a=Old.fromJSON(structuredClone(json)),b=Sim.fromJSON(structuredClone(json));
 // Completion crosses the threshold while stock and kin move during the pass.
 for(const s of [a,b]){for(const o of s.works)if(o.kind===WORK_AT.store){o.prog=.9799;o.stock=1.2;}s.setTilt(.025,-.015);}
 let oldMs=0,newMs=0;
 for(let day=0;day<5;day++){
  let t=performance.now();for(let i=0;i<C.TICKS_PER_DAY;i++)a.step();oldMs+=performance.now()-t;
  t=performance.now();for(let i=0;i<C.TICKS_PER_DAY;i++)b.step();newMs+=performance.now()-t;
  assert.deepEqual(b.toJSON(),a.toJSON(),name+' full state day '+day);
 }
 const result={name,alive:b.alive,works:b.works.length,oldMs:Math.round(oldMs),newMs:Math.round(newMs),speedup:Number((oldMs/newMs).toFixed(2)),identical:true};results.push(result);console.log(JSON.stringify(result));
}
fs.writeFileSync(new URL('../output/service-comparison.json',import.meta.url),JSON.stringify(results,null,2));
console.log('PASS: all full saved states match the linear service scan.');
