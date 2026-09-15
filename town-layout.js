// Shared, deterministic street geometry. No simulation RNG and no render state.
const unit=(x,y)=>{const d=Math.sqrt(x*x+y*y);return{x:x/d,y:y/d};};
export function townNoise(seed,a,b=0){let n=(seed^Math.imul(a+419,374761393)^Math.imul(b+73,668265263))>>>0;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;}
export function townLane(s,branch,t){
 const seed=s.seed>>>0,tilt=(townNoise(seed,1)-.5)*.65;
 const mainBend=(townNoise(seed,2)<.5?-1:1)*(.38+townNoise(seed,3)*.3);
 const main=unit(1,tilt),normal={x:-main.y,y:main.x};
 const curve=(u,k)=>k*u*u/(Math.abs(u)+22);
 const mainPoint=u=>({x:s.hearth.x+main.x*u+normal.x*curve(u,mainBend),y:s.hearth.y+main.y*u+normal.y*curve(u,mainBend)});
 let origin=s.hearth,dir=main,bend=mainBend;
 if(branch){origin=mainPoint(branch===1?6.5:-8.5);dir=branch===1?unit(-.55+tilt,1):unit(-.65-tilt,-1);bend=(townNoise(seed,branch+7)-.5)*1.1;}
 const n={x:-dir.y,y:dir.x},point=u=>({x:origin.x+dir.x*u+n.x*curve(u,bend),y:origin.y+dir.y*u+n.y*curve(u,bend)});
 const p=point(t),q=point(t+.02),d=unit(q.x-p.x,q.y-p.y);return{...p,dx:d.x,dy:d.y};
}
export function townLots(s,half){
 const out=[],steps=Math.ceil(s.N/6);
 for(let branch=0;branch<3;branch++)for(let j=branch?1:-steps;j<=steps;j++)for(const side of [-1,1]){
  const noise=townNoise(s.seed,j*2+side,branch),t=j*6.1+(noise-.5)*2.3+(side===1?1.35:0);
  const p=townLane(s,branch,t),setback=half+1.35+townNoise(s.seed,j+123,branch*2+side)*.95;
  const x=p.x-p.dy*side*setback,y=p.y+p.dx*side*setback;
  out.push({x,y,lane:branch,along:t,roadX:p.x,roadY:p.y,faceX:p.x-x,faceY:p.y-y});
 }
 return out;
}
