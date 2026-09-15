const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/kylef/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
try{const p=await b.newPage({viewport:{width:900,height:700},deviceScaleFactor:2});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://localhost:8460/?newgame&seed=live&skiptitle&pause');await p.waitForFunction(()=>window.__G?.app?.view?.natureRoot);
const sizes=await p.evaluate(()=>{const v=__G.app.view;return {canvas:[v.canvas.width,v.canvas.height],post:[v.post.rtScene.width,v.post.rtScene.height]};});assert.deepEqual(sizes.canvas,[1800,1400]);assert.deepEqual(sizes.post,sizes.canvas);
await p.evaluate(()=>{__G.step();__G.app.ui.showPage();__G.app.ui.chapter='living';__G.app.ui.renderBook();});
const link=p.locator('[data-visit-kin]').first(),id=+(await link.getAttribute('data-visit-kin'));await link.click();assert.equal(await p.evaluate(()=>__G.app.view.followId),id);assert(await p.locator('#pageWrap').evaluate(e=>e.classList.contains('hide')));
// Snapshot names are identity-checked when time advances behind the open book.
await p.evaluate(()=>{__G.app.ui.showPage();__G.app.ui.chapter='living';__G.app.ui.renderBook();});const old=p.locator('[data-visit-kin]').first(),oldId=+(await old.getAttribute('data-visit-kin'));await p.evaluate(id=>{__G.sim.k.nameId[id]+=2000;__G.app.view.followId=-1;},oldId);await old.click();assert.equal(await p.evaluate(()=>__G.app.view.followId),-1);assert(await p.locator('#pageWrap').isVisible());
await p.keyboard.press('b');await p.keyboard.press('m');await p.evaluate(()=>{const s=__G.sim;s.works.push({id:9991,kind:3,x:s.hearth.x+20,y:s.hearth.y,prog:.4,stock:0,day:0,by:-1},{id:9992,kind:3,x:s.hearth.x,y:s.hearth.y+20,prog:.5,stock:0,day:0,by:-1});});
await p.locator('[data-go="work"]').click();const first=await p.evaluate(()=>__G.app.survey.last.work);await p.locator('[data-go="work"]').click();assert.notEqual(await p.evaluate(()=>__G.app.survey.last.work),first);
assert.deepEqual(errors,[]);console.log(JSON.stringify({retina:sizes,bookNavigation:'passed',staleNames:'rejected',constructionCycling:'passed',errors},null,2));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
