const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/kylef/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
 try {
 const p=await b.newPage({viewport:{width:1280,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
 await p.goto('http://localhost:8460/?newgame&seed=live&skiptitle&pause');await p.waitForFunction(()=>window.__G?.app?.view?.natureRoot);await p.waitForTimeout(1100);
 await p.evaluate(()=>{__G.step();__G.app.ui.select(0);});
 await p.locator('#closerKin').click();await p.waitForTimeout(1000);
 assert.equal(await p.evaluate(()=>__G.app.view.followId),0);assert(await p.evaluate(()=>__G.app.view.orbit.el<.8));
 const x=await p.evaluate(()=>__G.app.view.centerTo.x);await p.evaluate(()=>__G.sim.k.x[0]+=6);await p.waitForTimeout(300);assert(await p.evaluate(x=>__G.app.view.centerTo.x>x+.02,x));
 await p.keyboard.press('w');await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__G.app.view.followId),-1);
 await p.keyboard.press('f');assert.equal(await p.evaluate(()=>__G.app.view.followId),0);
 // A slot reused by another generation must not silently inherit the camera.
 await p.evaluate(()=>__G.sim.k.born[0]+=1);await p.waitForTimeout(80);assert.equal(await p.evaluate(()=>__G.app.view.followId),-1);
 await p.evaluate(()=>{__G.app.view.followKin(0);__G.sim.k.nameId[0]+=1000;});await p.waitForTimeout(80);assert.equal(await p.evaluate(()=>__G.app.view.followId),-1);
 let fp=await p.evaluate(()=>__G.fingerprint()),az=await p.evaluate(()=>__G.app.view.orbit.tAz);
 await p.keyboard.down('Alt');await p.mouse.move(600,320);await p.mouse.down();await p.mouse.move(730,370,{steps:5});await p.mouse.up();await p.keyboard.up('Alt');
 assert.equal(await p.evaluate(()=>__G.fingerprint()),fp);assert.notEqual(await p.evaluate(()=>__G.app.view.orbit.tAz),az);
 await p.keyboard.press('Escape');fp=await p.evaluate(()=>__G.fingerprint());await p.keyboard.press('t');await p.keyboard.press('l');await p.keyboard.down('Space');await p.waitForTimeout(100);await p.keyboard.up('Space');assert.equal(await p.evaluate(()=>__G.fingerprint()),fp);assert(!(await p.evaluate(()=>__G.app.breathing)));await p.keyboard.press('Escape');
 await p.keyboard.press('b');fp=await p.evaluate(()=>__G.fingerprint());await p.keyboard.press('t');await p.keyboard.press('l');assert.equal(await p.evaluate(()=>__G.fingerprint()),fp);await p.keyboard.press('b');assert(await p.locator('#pageWrap').evaluate(e=>e.classList.contains('hide')));
 await p.locator('#followKin').focus();await p.keyboard.down('Space');await p.waitForTimeout(150);assert(!(await p.evaluate(()=>__G.app.breathing)));await p.keyboard.up('Space');
 await p.keyboard.press('h');await p.waitForTimeout(1000);await p.locator('[data-p="water"]').click();await p.mouse.move(530,360);await p.mouse.down();await p.waitForTimeout(350);assert((await p.locator('#handReadout').textContent()).includes('pouring'));await p.mouse.up();await p.waitForTimeout(150);assert(!(await p.locator('#handReadout').isVisible()));
 console.log('Follow, camera, modal, keyboard and gesture checks passed.');
 // Load a real late-town save in this throwaway browser profile only.
 await p.evaluate(async()=>{const state=await(await fetch('/output/mature-colony.json')).json();await new Promise((resolve,reject)=>{const r=indexedDB.open('donttouch',1);r.onupgradeneeded=()=>r.result.createObjectStore('colony');r.onsuccess=()=>{const db=r.result,t=db.transaction('colony','readwrite');t.objectStore('colony').put({at:Date.now(),state},'save');t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};r.onerror=()=>reject(r.error);});});
 console.log('Mature save installed in isolated profile.');
 await p.goto('http://localhost:8460/?skiptitle&pause');await p.waitForFunction(()=>window.__G?.app?.view?.natureRoot);await p.waitForTimeout(1200);
 assert(await p.evaluate(()=>__G.sim.alive>300));
 const mature=await p.evaluate(()=>({day:__G.sim.day,alive:__G.sim.alive,works:__G.sim.works.length,visibleNature:__G.app.view.natureStats.visible}));
 await p.evaluate(()=>{__G.app.ui.select(-1);__G.app.setSpeed(20);});
 await p.waitForTimeout(900);const responsive=await p.evaluate(()=>{const t=performance.now();__G.app.setSpeed(0);return {time:performance.now()-t,tick:__G.sim.tick};});assert(responsive.time<30);
 // Sightseeing and selection are read-only even with hundreds of inhabitants.
 fp=await p.evaluate(()=>__G.fingerprint());await p.keyboard.press('m');await p.locator('#survey canvas').click({position:{x:90,y:80}});await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>__G.fingerprint()),fp);
 await p.screenshot({path:'output/mature-town.jpg',type:'jpeg',quality:85});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({controls:'passed',mature,responsive,errors},null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
