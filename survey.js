// Optional field notebook: navigation and observations, never orders to the kin.
import { NEEDS, HIDE_BAND, LOCI, L, expressed, WORKS, WORK_DONE } from './sim.js';
export class Survey {
  constructor(app) {
    this.app=app; this.elapsed=0; this.last={};
    const root=document.createElement('details');root.id='survey';root.className='hide';
    root.innerHTML=`<summary>the map <small>M</small></summary>
      <canvas width="192" height="192" aria-label="Map of the colony. Click to visit a place." tabindex="0"></canvas>
      <div class="survey-key">blue · water &nbsp; ivory · homes &nbsp; gold · kin</div>
      <button data-go="home">back to the town <small>H</small></button>
      <div class="survey-caption">look in on…</div>
      <button data-go="water">water</button><button data-go="food">food</button><button data-go="warmth">warmth</button>
      <button data-go="work">what they are building</button>
      <p class="survey-note" aria-live="polite">Click the map to explore. WASD to walk; wheel to lean in.</p>`;
    document.body.appendChild(root);this.root=root;this.canvas=root.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
    root.addEventListener('toggle',()=>this.paint());
    root.querySelectorAll('button').forEach(b=>b.onclick=()=>this.visit(b.dataset.go));
    const point=e=>{const r=this.canvas.getBoundingClientRect(),N=app.sim.N;this.focus((e.clientX-r.left)/r.width*(N-1),(e.clientY-r.top)/r.height*(N-1));};
    this.canvas.addEventListener('pointerdown',e=>{e.preventDefault();point(e);this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{if(this.canvas.hasPointerCapture(e.pointerId))point(e);});
    this.canvas.addEventListener('keydown',e=>{const d={ArrowUp:[0,-4],ArrowDown:[0,4],ArrowLeft:[-4,0],ArrowRight:[4,0]}[e.key];if(!d)return;e.preventDefault();e.stopPropagation();const v=app.view,N=app.sim.N;this.focus((v.centerTo.x/v.GR*.5+.5)*(N-1)+d[0],(v.centerTo.z/v.GR*.5+.5)*(N-1)+d[1]);});
  }
  home(){this.app.view.panHold=0;this.app.view.lookAtTown();}
  focus(x,y){const v=this.app.view,N=this.app.sim.N;v.followId=-1;let wx=(x/(N-1)-.5)*v.GR*2,wz=(y/(N-1)-.5)*v.GR*2;const r=Math.hypot(wx,wz),lim=v.panLimitNow();if(r>lim){wx*=lim/r;wz*=lim/r;}v.centerTo.set(wx,.06,wz);v.panHold=Infinity;}
  visit(kind){
    if(kind==='home'){this.home();return;}
    const s=this.app.sim,k=s.k;
    if(kind==='work'){
      const sites=s.works.filter(w=>w.prog<WORK_DONE).sort((a,b)=>a.prog-b.prog||a.id-b.id);
      const next=(sites.findIndex(w=>w.id===this.last.work)+1)%sites.length,w=sites[next];
      if(w){this.last.work=w.id;this.focus(w.x,w.y);this.note(WORKS[w.kind].name+' · '+Math.round(w.prog*100)+'% · '+(w.done!=null?'being tended':'taking shape'));}
      else this.note('Nothing is under construction just now.');return;
    }
    const n=NEEDS.indexOf(kind),ids=[];
    for(let id=0;id<s.count;id++)if(k.alive[id]&&k.need[id*NEEDS.length+n]<.35)ids.push(id);
    ids.sort((a,b)=>k.need[a*NEEDS.length+n]-k.need[b*NEEDS.length+n]||a-b);
    if(!ids.length){this.note('Nobody is short of '+kind+' just now.');return;}
    let next=(ids.indexOf(this.last[kind])+1)%ids.length,id=ids[next];this.last[kind]=id;
    this.focus(k.x[id],k.y[id]);this.app.ui.select(id);
    const heat=s.temp[s.idx(k.x[id],k.y[id])];
    const genes=k.genome.subarray(id*LOCI.length*2,(id+1)*LOCI.length*2);
    const band=HIDE_BAND[expressed(genes,L.hide)];
    const care=kind==='water'?'Sheet off, then pour a shallow pool nearby. Keep it off their feet.':kind==='food'?'Sheet off: a crumb feeds them now; seed restores the ground over time.':heat>band[1]?'This ground is hot. Lift your finger and let it cool.':'Rest your finger nearby. A still hand spreads gentler warmth.';
    this.note(care);
    const hint=document.getElementById('inspectHint');hint.textContent=care;hint.classList.remove('hide');
  }
  note(text){this.root.querySelector('p').textContent=text;}
  frame(dt){this.root.classList.toggle('hide',this.app.phase!=='play');if(!this.root.open)return;this.elapsed+=dt;if(this.elapsed<.5)return;this.elapsed=0;this.paint();}
  paint(){if(!this.root.open)return;const s=this.app.sim,N=s.N,k=s.k,c=this.ctx,D=192,im=c.createImageData(D,D);
    for(let y=0;y<D;y++)for(let x=0;x<D;x++){const i=s.idx(x/(D-1)*(N-1),y/(D-1)*(N-1)),q=(y*D+x)*4,m=s.moss[i],h=s.height[i],wet=s.water[i]>.001;im.data[q]=wet?43:57+m*32+h*15;im.data[q+1]=wet?99:69+m*61+h*15;im.data[q+2]=wet?117:35+m*18;im.data[q+3]=255;}
    c.putImageData(im,0,0);const f=(D-1)/(N-1);
    c.strokeStyle='#d7cead66';c.beginPath();c.arc(D/2,D/2,D*.455,0,Math.PI*2);c.stroke();
    c.fillStyle='#eee0b9';for(const w of s.works)c.fillRect(w.x*f-1,w.y*f-1,3,3);
    c.fillStyle='#ffc869';for(let id=0;id<s.count;id++)if(k.alive[id])c.fillRect(k.x[id]*f-1,k.y[id]*f-1,2,2);
    const v=this.app.view,x=(v.center.x/v.GR*.5+.5)*D,y=(v.center.z/v.GR*.5+.5)*D;c.strokeStyle='#fff5dc';c.lineWidth=1.5;c.beginPath();c.arc(x,y,6,0,Math.PI*2);c.stroke();
    for(const kind of ['water','food','warmth']){let count=0,n=NEEDS.indexOf(kind);for(let id=0;id<s.count;id++)if(k.alive[id]&&k.need[id*NEEDS.length+n]<.35)count++;this.root.querySelector('[data-go="'+kind+'"]').textContent=count?count+' short of '+kind:kind+' · settled';}
  }
}
