// Stable buttons: changing categories never rebuilds controls under a pointer.
const GROUPS={care:['rest','crumb','water','breathe','seed','leaf','mend'],play:['bead','call','lift'],shape:['raise','lower','tilt','tidy'],disrupt:['press','knock','dread','still','strike']};
const LABELS={care:'Care',play:'Play',shape:'Shape',disrupt:'Disrupt'};
const HELP={rest:'Hold still on the ground to warm a gentle patch.',crumb:'Click the ground to drop food they can gather around.',water:'Hold to pour. A deep pool can drown them.',breathe:'Hold on the world to breathe rain into their sky.',seed:'Click depleted ground to help green growth return.',leaf:'Click open, dry ground to place a leaf shelter. It lasts 18 days.',mend:'Hold on a creature to restore its needs and health.',bead:'Click open, dry ground to leave a play bead. Neighbours gather and bond.',call:'Click a place to call nearby creatures over.',lift:'Hold a creature, then release over land to move it safely.',raise:'Hold the ground to build a hill. Water flows away.',lower:'Hold the ground to make a hollow. Water collects there.',tilt:'Drag to tilt the board and move its water.',tidy:'Click near a leaf or bead to put it away.',press:'Hold to heat a small spot. It can burn creatures.',knock:'Click the board to startle them and damage their buildings.',dread:'Click a place to frighten nearby creatures away.',still:'Hold a creature to glue it down permanently.',strike:'Hold a creature to extinguish its life.'};
export class InteractionMenu {
  constructor(ui){
    this.ui=ui;this.root=document.getElementById('hand');this.root.classList.add('action-menu');
    this.root.setAttribute('aria-label','Interact with the world');
    for(const [p,g,n] of [['bead','◉','Play bead'],['leaf','❧','Leaf shelter'],['tidy','↶','Put away']]){
      const b=document.createElement('button');b.className='hb';b.dataset.p=p;b.dataset.say=HELP[p];b.setAttribute('aria-pressed','false');
      const icon=document.createElement('span');icon.className='g';icon.textContent=g;const label=document.createElement('span');label.className='n';label.textContent=n;b.append(icon,label);this.root.append(b);
    }
    this.buttons=[...this.root.querySelectorAll('.hb')];
    this.tabs=document.createElement('div');this.tabs.className='action-tabs';this.tabs.setAttribute('role','tablist');this.tabs.setAttribute('aria-label','Action categories');
    this.row=document.createElement('div');this.row.id='actionTools';this.row.setAttribute('role','tabpanel');
    this.status=document.createElement('div');this.status.id='actionStatus';this.status.setAttribute('aria-live','polite');
    for(const [key,label] of Object.entries(LABELS)){const b=document.createElement('button');b.textContent=label;b.dataset.category=key;b.id='actions-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls','actionTools');b.onclick=()=>this.show(key);this.tabs.append(b);}
    this.tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const tabs=[...this.tabs.children],i=tabs.indexOf(document.activeElement);const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[next].click();tabs[next].focus();});
    for(const b of this.buttons){b.title=HELP[b.dataset.p]||b.dataset.say;b.setAttribute('aria-label',b.querySelector('.n').textContent);this.row.append(b);}
    this.root.append(this.tabs,this.row,this.status);this.show('care');this.reflect('rest');
  }
  show(key){this.group=key;for(const b of this.tabs.children){const on=b.dataset.category===key;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}this.row.setAttribute('aria-labelledby','actions-'+key);for(const b of this.buttons)b.hidden=!GROUPS[key].includes(b.dataset.p);}
  reflect(p){const group=Object.keys(GROUPS).find(k=>GROUPS[k].includes(p));if(group)this.show(group);const b=this.buttons.find(b=>b.dataset.p===p);this.status.textContent=(b?b.querySelector('.n').textContent+': ':'')+(HELP[p]||'');}
  feedback(text){this.status.textContent=text;}
}
