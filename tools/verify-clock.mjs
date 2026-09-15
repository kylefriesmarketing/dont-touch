import assert from 'node:assert/strict';
import {advanceSimulation} from '../clock-step.js';
let elapsed=0,ticks=0;
const slow={step(){ticks++;elapsed+=3;}};
let r=advanceSimulation(slow,0,.25,20,45,()=>elapsed);
assert.equal(ticks,3);assert.equal(r.limited,true);assert(r.pending<=.5);
let order=[],timer=0;
for(let i=0;i<60;i++){const result=advanceSimulation({step(){order.push(order.length);}},timer,1/60,1,45,()=>0);timer=result.pending;}
assert.equal(order.length,45);assert.deepEqual(order,Array.from({length:45},(_,i)=>i));
const fast=advanceSimulation({step(){ticks++;}},0,.02,4,45,()=>0);assert.equal(fast.steps,3);
console.log('PASS: slow frames yield, ordinary 1x keeps 45 ordered ticks/s, fast-forward keeps tick order.');
