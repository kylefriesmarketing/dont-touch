// THE GLASS — test-view.mjs
// Browser battery. Start the server first:  node serve.mjs 8460
// Then:  node test-view.mjs
// Needs playwright:  npm i -D playwright
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:1280,height:800}, acceptDownloads:true });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{ if(m.type()==='error' && !/404/.test(m.text())) errs.push('CONSOLE '+m.text()); });
const T = [];
const check = (n,c,extra='') => T.push(`${c?'ok  ':'FAIL'} ${n}${extra?' — '+extra:''}`);

await p.goto('http://localhost:8460/?newgame&seed=live',{waitUntil:'load'});
await p.waitForTimeout(2200);
check('boots and hides the splash', await p.evaluate(()=>document.getElementById('boot').classList.contains('hide')));
check('kin render', await p.evaluate(()=>__G.app.view.kinCount>5), await p.evaluate(()=>''+__G.app.view.kinCount));

// TILT
await p.evaluate(()=>__G.run(20));
const w0 = await p.evaluate(()=>{let l=0;const s=__G.sim;for(let i=0;i<s.N*s.N;i++) if(i%s.N<s.N/2) l+=s.water[i]; return l;});
await p.keyboard.down('Shift');
await p.mouse.move(640,420); await p.mouse.down(); await p.mouse.move(400,420,{steps:12}); await p.waitForTimeout(200);
const tilted = await p.evaluate(()=>Math.abs(__G.sim.tilt.x)+Math.abs(__G.sim.tilt.y));
await p.evaluate(()=>__G.run(6));
const w1 = await p.evaluate(()=>{let l=0;const s=__G.sim;for(let i=0;i<s.N*s.N;i++) if(i%s.N<s.N/2) l+=s.water[i]; return l;});
await p.mouse.up(); await p.keyboard.up('Shift');
check('shift-drag tilts the jar', tilted>0.02, tilted.toFixed(3));
check('tilting moves the water', Math.abs(w1-w0)>0.05, `${w0.toFixed(2)}→${w1.toFixed(2)}`);
await p.waitForTimeout(400);
check('the jar rights itself', await p.evaluate(()=>Math.abs(__G.sim.tilt.x)<0.001));

// WARM + fingerprint
const t0 = await p.evaluate(()=>__G.sim.temp[__G.sim.idx(32,32)]);
await p.mouse.move(640,430); await p.mouse.down();
await p.waitForTimeout(300); await p.mouse.move(645,432); await p.waitForTimeout(400);
await p.evaluate(()=>__G.run(2));
await p.mouse.up();
const t1 = await p.evaluate(()=>{let m=0;const s=__G.sim;for(let i=0;i<s.N*s.N;i++) m=Math.max(m,s.temp[i]); return m;});
check('the finger heats the glass', t1>t0+8, `${t0.toFixed(1)}→${t1.toFixed(1)}`);

// BREATHE
const h0 = await p.evaluate(()=>__G.sim.humid);
await p.keyboard.down(' '); await p.waitForTimeout(2600); await p.keyboard.up(' ');
const h1 = await p.evaluate(()=>__G.sim.humid + __G.sim.rainLeft);
check('space breathes weather into the jar', h1>h0, `${h0.toFixed(1)}→${h1.toFixed(1)}`);

// SELECT a kin (before we do anything cruel)
await p.evaluate(()=>{ __G.app.ui.select(__G.app.view.kinScreen[0]); __G.app.ui.paintInspector(); });
await p.waitForTimeout(200);
const insp = await p.evaluate(()=>document.getElementById('inspectBody').innerHTML.length);
check('the inspector paints a kin', insp>400, insp+' chars');
check('the genome strip has all six loci', await p.evaluate(()=>document.querySelectorAll('#inspectBody .locus').length===6));
check('needs decompose into causes', await p.evaluate(()=>document.querySelectorAll('#inspectBody .need').length===6));

// LID
await p.keyboard.press('l');
check('L opens the lid', await p.evaluate(()=>__G.sim.lid===true));
const tot = () => p.evaluate(()=>{const s=__G.sim;let w=s.humid+s.rainLeft;for(let i=0;i<s.N*s.N;i++)w+=s.water[i];return w;});
const v0 = await tot(); await p.evaluate(()=>__G.run(40)); const v1 = await tot();
check('an open lid dries the jar out', v1<v0*0.96, `${v0.toFixed(1)}→${v1.toFixed(1)}`);
await p.keyboard.press('l');

// TAP
const before = await p.evaluate(()=>__G.sim.chronicle.length);
await p.keyboard.press('t');
check('T startles the whole colony', await p.evaluate(()=>__G.sim.chronicle.some(e=>e.kind==='tap')));

// THE BOOK
await p.click('#pageBtn'); await p.waitForTimeout(300);
const lines = await p.evaluate(()=>document.querySelectorAll('#pageBody li').length);
check('the book writes a page', lines>0 && lines<=7, lines+' lines');

// PNG export
const dl = p.waitForEvent('download', {timeout:15000}).catch(()=>null);
await p.click('#savePage');
const d = await dl;
check('the page exports a 9:16 png', !!d, d? await d.suggestedFilename() : 'no download');
await p.click('#closePage');

// SAVE + RELOAD
const fp = await p.evaluate(async ()=>{ await __G.app.save(); return __G.sim.fingerprint(); });
const day = await p.evaluate(()=>__G.sim.day);
const snap = await p.evaluate(()=>({g:__G.sim.graves.length,b:__G.sim.stats.born,d:__G.sim.stats.died,n:__G.sim.names.length}));
await p.goto('http://localhost:8460/?pause',{waitUntil:'load'});
await p.waitForTimeout(2500);
const fp2 = await p.evaluate(()=>__G.sim.fingerprint());
const day2 = await p.evaluate(()=>__G.sim.day);
const snap2 = await p.evaluate(()=>({g:__G.sim.graves.length,b:__G.sim.stats.born,d:__G.sim.stats.died,n:__G.sim.names.length}));
check('the colony survives a reload', day2===day, `day ${day} → ${day2}`);
check('and restores byte-identically', fp===fp2, fp+' / '+fp2);
check('graves, births, deaths and names all survive', JSON.stringify(snap)===JSON.stringify(snap2), JSON.stringify(snap2));
check('the house contract save key exists', await p.evaluate(()=>!!localStorage.getItem('theglass-save')));

await p.screenshot({path:'/tmp/final.png'});
console.log(T.join('\n'));
console.log('\nerrors:', errs.length?errs.slice(0,6):'none');
await b.close();
process.exit(T.some(x=>x.startsWith('FAIL'))?1:0);
