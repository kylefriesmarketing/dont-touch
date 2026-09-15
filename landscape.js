import { cullNature } from './nature-culling.js';
// Surrounding terrain is real geometry, never a stretched edge pixel.
// View-only: no writes to the simulation or its random streams.
export function landscape(view, THREE, GR, detail, subdivisions) {
  const s=view.sim, N=s.N, root=new THREE.Group(); root.name='continuous landscape';
  const smooth=t=>t*t*(3-2*t);
  const hash=(x,y)=> { let h=Math.imul(x,374761393)^Math.imul(y,668265263)^s.seed; h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967296; };
  const noise=(x,y)=>{const a=Math.floor(x),b=Math.floor(y),u=smooth(x-a),v=smooth(y-b);return (hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v;};
  const ground=(x,z)=>view._heightAt((x/GR*.5+.5)*(N-1),(z/GR*.5+.5)*(N-1));
  view.landscapeHeight=(x,z)=>{
    const m=Math.max(Math.abs(x),Math.abs(z)); if(m<=GR)return ground(x,z);
    const d=m-GR, bx=x*GR/m,bz=z*GR/m, edge=ground(bx,bz);
    const inward=ground(bx*.99,bz*.99);
    const slope=Math.max(-.7,Math.min(.7,(edge-inward)/(GR*.01)));
    const far=.035+(noise(x*2.8,z*2.8)*.11+noise(x*7,z*7)*.018)*view.cs;
    const t=smooth(Math.min(1,d/.65));
    return edge*(1-t)+far*t+slope*d*Math.exp(-d*14)*(1-t);
  };
  const verts=[],uv=[],indices=[]; const steps=(N-1)*subdivisions, rows=32, stride=steps*4;
  const perimeter=(j)=>{const side=Math.floor(j/steps),t=(j%steps)/steps;return side===0?[-1+2*t,-1]:side===1?[1,-1+2*t]:side===2?[1-2*t,1]:[-1,1-2*t];};
  for(let r=0;r<=rows;r++){
    const radius=GR+(GR*6)*Math.pow(r/rows,2);
    for(let j=0;j<stride;j++){const [a,b]=perimeter(j),x=a*radius,z=b*radius; verts.push(x,view.landscapeHeight(x,z),z);uv.push(.5+x/(GR*2),.5-z/(GR*2));}
  }
  for(let r=0;r<rows;r++)for(let j=0;j<stride;j++){const k=(j+1)%stride,a=r*stride+j,b=r*stride+k,c=a+stride,d=b+stride;indices.push(a,b,c,b,d,c);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  // Same state texture at the seam; beyond it, independent meadow variation.
  const mat=new THREE.MeshStandardMaterial({map:view.groundTex,roughness:.97,side:THREE.DoubleSide});
  mat.onBeforeCompile=sh=>{
    sh.uniforms.uDetail={value:detail};
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D uDetail;
      float landNoise(vec2 p){return sin(p.x*1.71+sin(p.y*1.39))*sin(p.y*1.17+sin(p.x*.91));}`)
      .replace('#include <map_fragment>',`#include <map_fragment>
      vec2 land = (vMapUv-.5)*1.88;
      float edgeDistance=max(abs(land.x),abs(land.y))-.94;
      float mixLand=smoothstep(0.0,.24,edgeDistance);
      float landPatch=landNoise(land*9.)*.5+.5;
      vec3 meadow=mix(vec3(.045,.10,.022),vec3(.10,.18,.040),landPatch);
      diffuseColor.rgb=mix(diffuseColor.rgb,meadow,mixLand);
      vec3 det=texture2D(uDetail,vMapUv*30.).rgb;
      diffuseColor.rgb *= .46 + det.r*1.08;`);
  };
  view.refreshLandscape = () => {
    const p = geo.attributes.position;
    for (let i=0;i<p.count;i++) p.setY(i,view.landscapeHeight(p.getX(i),p.getZ(i)));
    p.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
  };
  const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;root.add(mesh);view.jar.add(root);return root;
}

// One instanced draw per material, regardless of the number of trees.
export function plantNature(view, THREE, model, trees, fallback) {
  const s=view.sim,N=s.N,GR=view.GR;
  model.updateMatrixWorld(true);
  const pieces={};model.traverse(o=>{if(/^(oak|pine|rock)$/.test(o.name))pieces[o.name]=o;});
  if(Object.keys(pieces).length!==3)throw Error('nature kit missing named pieces');
  let seed=(s.seed^0x55aa1234)>>>0; const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const groups={oak:[],pine:[],rock:[]};
  // Generate from the immutable terrain and a fixed number of random draws.
  // Clearing a new roof must not relocate the rest of the forest on reload.
  for(let i=0;i<Math.round(420*s.area);i++){
    const x=2+rnd()*(N-4),y=2+rnd()*(N-4),cell=s.idx(x,y);
    const kind=rnd()<.22?'rock':rnd()<.5?'oak':'pine';
    const size=(.055+rnd()*.07)*view.cs,az=rnd()*6.283;
    if(view.ballast[cell]>.1 || s.height[cell]-(s.lump[cell]||0)<s.pondLevel+.04)continue;
    if((x-s.hearth.x)**2+(y-s.hearth.y)**2<13**2)continue;
    const [wx,wy,wz]=view.cellToLocal(x,y,0);
    groups[kind].push({x:wx,y:wy,z:wz,cx:x,cy:y,size,az});
  }
  // Woodland continues beyond the playable area; no featureless skirt.
  for(let i=0;i<850;i++){
    const radius=GR+.015+Math.pow(rnd(),2)*GR*3,side=(rnd()*4)|0,across=(rnd()*2-1)*radius;
    const x=side===0?-radius:side===1?radius:across,z=side===2?-radius:side===3?radius:across;
    if(Math.max(Math.abs(x),Math.abs(z))<GR+.012)continue;
    groups[rnd()<.17?'rock':rnd()<.55?'oak':'pine'].push({x,y:view.landscapeHeight(x,z),z,size:(.055+rnd()*.10)*view.cs,az:rnd()*6.283});
  }
  const root=new THREE.Group();root.name='Blender woodland';const batches=[];
  const matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  for(const [name,src]of Object.entries(pieces)){
    const rows=groups[name],box=new THREE.Box3().setFromObject(src),height=box.max.y-box.min.y;
    src.traverse(mesh=>{if(!mesh.isMesh)return;
      const geo=mesh.geometry.clone();geo.applyMatrix4(mesh.matrixWorld);geo.translate(0,-box.min.y,0);
      const im=new THREE.InstancedMesh(geo,mesh.material,rows.length);
      rows.forEach((t,i)=>{const size=t.size/height*(name==='rock'?.38:1);pos.set(t.x,t.y,t.z);quat.setFromAxisAngle(up,t.az);scale.setScalar(size);matrix.compose(pos,quat,scale);im.setMatrixAt(i,matrix);});
      im.castShadow=true;im.receiveShadow=true;root.add(im);
      batches.push({mesh:im,rows,full:im.instanceMatrix.array.slice()});
    });
  }
  const tuftGeo = new THREE.BufferGeometry();
  tuftGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.28,0,0, .12,1,0, .28,0,0, 0,0,-.3, 0,.8,.05, 0,0,.3],3));tuftGeo.computeVertexNormals();
  const tufts = new THREE.InstancedMesh(tuftGeo,new THREE.MeshStandardMaterial({color:0x647e38,roughness:1,side:THREE.DoubleSide}),1800);
  const grassRows=[];
  for(let i=0;i<1800;i++){const radius=GR+.004+Math.pow(rnd(),2)*GR*1.8,side=(rnd()*4)|0,a=(rnd()*2-1)*radius,x=side===0?-radius:side===1?radius:a,z=side===2?-radius:side===3?radius:a;
    pos.set(x,view.landscapeHeight(x,z),z);quat.setFromAxisAngle(up,rnd()*6.283);scale.setScalar((.006+rnd()*.012)*view.cs);matrix.compose(pos,quat,scale);tufts.setMatrixAt(i,matrix);grassRows.push({x,y:pos.y,z,size:scale.x});}
  root.add(tufts);batches.push({mesh:tufts,rows:grassRows,full:tufts.instanceMatrix.array.slice()});
  fallback.forEach(m=>{if(m)m.visible=false;});view.jar.add(root);view.natureRoot=root;cullNature(view,THREE,batches);
}

