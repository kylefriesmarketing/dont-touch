const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/kylef/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
await page.goto('http://localhost:8460/?newgame&seed=live&skiptitle&pause');await page.waitForFunction(()=>window.__G?.app?.view?.natureRoot&&__G.app.view.kits.civic);await page.waitForTimeout(1300);
await page.evaluate(()=>__G.step());
assert.equal(await page.evaluate(()=>__G.sim.N),192);assert.equal(await page.evaluate(()=>__G.app.view.post.p.blurMax),0);
assert.equal(await page.evaluate(()=>__G.app.view.natureRoot.children.length),9);
await page.keyboard.press('m');assert(await page.locator('#survey').evaluate(e=>e.open));
await page.locator('#survey canvas').click({position:{x:150,y:85}});await page.waitForTimeout(800);
const target=await page.evaluate(()=>[__G.app.view.centerTo.x,__G.app.view.centerTo.z]);
assert(Math.hypot(...target)>.2);assert(await page.evaluate(()=>__G.app.view.panHold===Infinity));
await page.waitForTimeout(4500);assert.deepEqual(await page.evaluate(()=>[__G.app.view.centerTo.x,__G.app.view.centerTo.z]),target);
await page.keyboard.press('h');assert(await page.evaluate(()=>__G.app.view.panHold!==Infinity));
await page.evaluate(()=>{const s=__G.sim;for(let i=0;i<s.count;i++)if(s.k.alive[i])s.k.need[i*6+1]=.9;s.k.need[1]=.1;});
await page.locator('[data-go="water"]').click();assert.equal(await page.evaluate(()=>__G.app.ui.selected),0);
assert((await page.locator('#inspectHint').textContent()).includes('shallow'));
assert(!(await page.locator('#survey').evaluate(e=>e.open)));await page.keyboard.press('m');
await page.evaluate(()=>{const s=__G.sim;s.humid=.7*24.75*s.area;__G.app.ui.frame(.5);});assert((await page.locator('#weather').textContent()).includes('heavy air'));
await page.keyboard.press('m');assert(!(await page.locator('#survey').evaluate(e=>e.open)));
// View reads alone cannot change the sim, including loading the Blender kit.
const fp=await page.evaluate(()=>__G.fingerprint());await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>__G.fingerprint()),fp);
const geometry=await page.evaluate(()=>{const v=__G.app.view,GR=v.GR,N=__G.sim.N,p=v.apron.children[0].geometry.attributes.position;let interior=0,seam=0;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);if(Math.max(Math.abs(x),Math.abs(z))<GR-1e-6)interior++;if(Math.abs(Math.max(Math.abs(x),Math.abs(z))-GR)<1e-6){const y=v._heightAt((x/GR*.5+.5)*(N-1),(z/GR*.5+.5)*(N-1));seam=Math.max(seam,Math.abs(p.getY(i)-y));}}return{interior,seam,vertices:p.count};});
assert.equal(geometry.interior,0);assert(geometry.seam<1e-5);
await page.keyboard.press('h');await page.waitForTimeout(1200);await page.screenshot({path:'C:/Users/kylef/Downloads/New folder/dont-touch/preview-opening.jpg',type:'jpeg',quality:78});
await page.evaluate(()=>{const v=__G.app.view;v.centerTo.set(.83,.06,0);v.center.copy(v.centerTo);v.panHold=Infinity;v.orbit.dist=v.orbit.tDist=1;v.orbit.el=v.orbit.tEl=1.15;});await page.waitForTimeout(700);
await page.screenshot({path:'C:/Users/kylef/Downloads/New folder/dont-touch/preview-edge.jpg',type:'jpeg',quality:78});
const perf=await page.evaluate(()=>{const v=__G.app.view;v.post.enabled=false;v.renderer.render(v.scene,v.camera);return{draws:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,geometries:v.renderer.info.memory.geometries};});
await page.setViewportSize({width:390,height:844});await page.keyboard.press('m');await page.waitForTimeout(500);assert(await page.locator('#survey canvas').isVisible());
const box=await page.locator('#survey').boundingBox();assert(box.x>=0&&box.x+box.width<=391);
// The baked-world path must still boot with its own grid and the new scenery.
await page.goto('http://localhost:8460/?newgame&world=keswick&seed=live&skiptitle&pause');await page.waitForFunction(()=>window.__G?.app?.view?.natureRoot);assert.equal(await page.evaluate(()=>__G.sim.N),96);
assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:19,geometry,perf,bakedN:96,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
