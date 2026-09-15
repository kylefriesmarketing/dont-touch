import fs from 'node:fs';
import {Sim,C} from '../sim.js';
fs.mkdirSync(new URL('../output/',import.meta.url),{recursive:true});
const s=new Sim({seed:'law'}),started=Date.now();
for(let d=0;d<180;d++){
 for(let t=0;t<C.TICKS_PER_DAY;t++)s.step();
 if((d+1)%20===0){console.log(JSON.stringify({days:d+1,alive:s.alive,works:s.works.length,age:s.ageNow(),seconds:(Date.now()-started)/1000}));fs.writeFileSync(new URL('../output/mature-colony.json',import.meta.url),JSON.stringify(s.toJSON()));}
 if(!s.alive)throw Error('Colony extinct before day180');
}
console.log('Mature colony fixture ready.');
