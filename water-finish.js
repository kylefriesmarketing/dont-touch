// View-only surface detail. The water data remains the simulation's real water.
export function finishWater(view) {
  const time = {value:0}; view.waterTime = time;
  view.water.material.onBeforeCompile = sh => {
    sh.uniforms.uWaterTime=time;sh.uniforms.uWaterScale={value:view.cs};
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
      uniform float uWaterTime; uniform float uWaterScale;`)
      .replace('#include <map_fragment>',`#include <map_fragment>
      float waterLines=pow(.5+.5*sin(vMapUv.x*240.+vMapUv.y*110.+sin(vMapUv.y*67.)*1.8-uWaterTime*1.1),18.);
      float waterBreak=.35+.65*(.5+.5*sin(vMapUv.y*127.-vMapUv.x*80.+uWaterTime*.45));
      diffuseColor.rgb+=vec3(.024,.048,.052)*waterLines*waterBreak*smoothstep(.06,.35,diffuseColor.a);`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      // Two crossing capillary waves perturb the reflection, not the water level.
      float waveHeight=(sin(vMapUv.x*190.0+vMapUv.y*75.0+uWaterTime*.9)
        +sin(vMapUv.y*230.0-vMapUv.x*45.0-uWaterTime*.7))*.00022*uWaterScale;
      vec3 waterDx=dFdx(-vViewPosition), waterDy=dFdy(-vViewPosition);
      vec3 waterR1=cross(waterDy,normal), waterR2=cross(normal,waterDx);
      float waterDet=dot(waterDx,waterR1);
      normal=normalize(abs(waterDet)*normal-sign(waterDet)*(dFdx(waveHeight)*waterR1+dFdy(waveHeight)*waterR2));`);
  };
  // Damp banks use the same water texture, so newly poured pools leave a rim too.
  const ground=view.ground.material, original=ground.onBeforeCompile;
  ground.onBeforeCompile=sh=>{
    original(sh);sh.uniforms.uBankWater={value:view.waterTex};sh.uniforms.uBankTexel={value:1/view.sim.N};
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
      uniform sampler2D uBankWater;uniform float uBankTexel;`)
      .replace('#include <map_fragment>',`#include <map_fragment>
      float bankHere=texture2D(uBankWater,vMapUv).a;
      float bankNear=max(max(texture2D(uBankWater,vMapUv+vec2(uBankTexel,0.)).a,texture2D(uBankWater,vMapUv-vec2(uBankTexel,0.)).a),
        max(texture2D(uBankWater,vMapUv+vec2(0.,uBankTexel)).a,texture2D(uBankWater,vMapUv-vec2(0.,uBankTexel)).a));
      float dampBank=smoothstep(.02,.22,bankNear)*(1.-smoothstep(.02,.10,bankHere));
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.78,.83,.88),dampBank*.55);`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,.58,dampBank*.6);`);
  };
}
