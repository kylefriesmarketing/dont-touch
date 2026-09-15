import * as THREE from './lib/three.module.js';
// Objects and social cues are projections of saved simulation state only.
export function paintLittleLife(v){
  const s=v.sim,k=s.k;
  if(!v.littleViews){
    v.littleViews=new Map();v.littleRoot=new THREE.Group();v.jar.add(v.littleRoot);
    const leaf=new THREE.Shape();leaf.moveTo(0,-.068);leaf.bezierCurveTo(.071,-.025,.066,.032,0,.068);leaf.bezierCurveTo(-.066,.032,-.071,-.025,0,-.068);
    v.littleAssets={bead:new THREE.TorusGeometry(.021,.009,8,18),leaf:new THREE.ShapeGeometry(leaf,8),stem:new THREE.CylinderGeometry(.0013,.0018,.14,5),
      blue:new THREE.MeshStandardMaterial({color:0x67bacb,roughness:.37}),green:new THREE.MeshStandardMaterial({color:0x7d9c42,roughness:.9,side:THREE.DoubleSide}),wood:new THREE.MeshStandardMaterial({color:0x899851,roughness:1})};
    v.littleFxTick=s.tick;
  }
  const alive=new Set(s.life.props.map(p=>p.id)),a=v.littleAssets;
  for(const [id,g]of v.littleViews)if(!alive.has(id)){v.littleRoot.remove(g);v.littleViews.delete(id);}
  for(const p of s.life.props){
    let g=v.littleViews.get(p.id);
    if(!g){g=new THREE.Group();g.userData.kind=p.kind;
      if(p.kind==='bead'){const bead=new THREE.Mesh(a.bead,a.blue);bead.rotation.x=-Math.PI/2;bead.position.y=.011;bead.castShadow=true;g.add(bead);}
      else {const leaf=new THREE.Mesh(a.leaf,a.green);leaf.rotation.x=-Math.PI/2+.13;leaf.rotation.z=.18;leaf.position.y=.025;leaf.castShadow=true;leaf.receiveShadow=true;g.add(leaf);const vein=new THREE.Mesh(a.stem,a.wood);vein.rotation.x=Math.PI/2;vein.position.y=.028;g.add(vein);}
      g.scale.setScalar(v.cs);g.rotation.y=p.id*2.4;v.littleViews.set(p.id,g);v.littleRoot.add(g);
    }
    g.position.set(...v.cellToLocal(p.x,p.y,.001*v.cs));
    if(p.kind==='bead')g.children[0].rotation.z=p.visits*.055;
  }
  if(s.tick-v.littleFxTick<60)return;v.littleFxTick=s.tick;
  let shown=0;for(let id=0;id<s.count&&shown<4;id++){
    if(!k.alive[id]||k.socialUntil[id]<=s.tick||k.socialAct[id]<2)continue;
    const act=k.socialAct[id],color=act===4?0xe8c275:act===5?0x9bd36d:act===6?0xc8a2e8:0x7bcfd1;
    v.vfx.ring(k.x[id],k.y[id],{color,r0:.15,r1:.85,life:.7});shown++;
  }
}
