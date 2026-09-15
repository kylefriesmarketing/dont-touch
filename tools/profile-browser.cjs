const {chromium}=require('C:/Users/kylef/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});const p=await b.newPage({viewport:{width:1280,height:800}});await p.goto('http://localhost:8460/?newgame&seed=live&skiptitle&pause');await p.waitForFunction(()=>window.__G?.app?.view?.natureRoot);await p.waitForTimeout(1800);const out=[];
for(const [name,x,z,dist]of [['town',null,null,.625],['edge',.83,0,1],['overview',0,0,1.35]]){
 await p.evaluate(({x,z,dist})=>{const v=__G.app.view;if(x!==null){v.centerTo.set(x,.06,z);v.center.copy(v.centerTo);}v.panHold=Infinity;v.orbit.dist=v.orbit.tDist=dist;v.post.enabled=false;}, {x,z,dist});await p.waitForTimeout(300);
 out.push(await p.evaluate(name=>{const v=__G.app.view;v.render(0);return {name,triangles:v.renderer.info.render.triangles,draws:v.renderer.info.render.calls,nature:v.natureStats||null};},name));
}
fs.writeFileSync('output/'+(process.argv[2]||'profile')+'.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));await b.close();})().catch(e=>{console.error(e);process.exit(1)});
