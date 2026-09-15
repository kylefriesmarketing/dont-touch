// CPU visibility checks keep one instanced draw per material without submitting
// a whole continent of trees to the GPU. This module never writes sim state.
import { WORKS, WORK_HALF } from './sim.js';
export function cullNature(view, THREE, batches) {
  const frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
  const sphere = new THREE.Sphere(), worldScale = new THREE.Vector3();
  const groups = [...new Set(batches.map(b => b.rows))];
  let clearanceTime = Infinity, signature = '', terrainRevision = -1;
  view.natureStats = { visible: 0, total: groups.reduce((n, rows) => n + rows.length, 0) };
  view.updateNature = (dt = 0) => {
    const s = view.sim;
    clearanceTime += dt;
    if (clearanceTime >= .5 || terrainRevision !== (view.natureTerrainRevision || 0)) {
      clearanceTime = 0;
      const sig = s.works.map(w => `${w.id}:${w.x}:${w.y}:${w.prog >= .15}`).join('|');
      const changedGround = terrainRevision !== (view.natureTerrainRevision || 0);
      if (sig !== signature || changedGround) {
        signature = sig; terrainRevision = view.natureTerrainRevision || 0;
        const roofs = s.works.filter(w => w.prog >= .15 && !WORKS[w.kind].ring);
        for (const rows of groups) for (const t of rows) {
          if (t.cx == null) { t.present = true; if (changedGround) t.y = view.landscapeHeight(t.x,t.z); continue; }
          t.present = roofs.every(w => (w.x-t.cx)**2 + (w.y-t.cy)**2 > ((WORK_HALF[w.kind] || 1.2)+2.2)**2);
          if (changedGround) t.y = view._heightAt(t.cx, t.cy);
        }
        if (changedGround) for (const batch of batches) batch.rows.forEach((t, i) => {
          batch.full[i*16+13] = t.y;
        });
      }
    }
    view.camera.updateMatrixWorld();
    view.jar.updateWorldMatrix(true, false);
    projection.multiplyMatrices(view.camera.projectionMatrix, view.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    view.jar.getWorldScale(worldScale);
    const scale = Math.max(worldScale.x, worldScale.y, worldScale.z);
    let visible = 0;
    for (const rows of groups) for (const t of rows) {
      // A generous border keeps nearby shadows and crowns from popping at the edge.
      sphere.center.set(t.x, t.y + t.size*.45, t.z).applyMatrix4(view.jar.matrixWorld);
      sphere.radius = (t.size*1.3 + .04)*scale;
      t.visible = t.present !== false && frustum.intersectsSphere(sphere);
      if (t.visible) visible++;
    }
    for (const {mesh, rows, full} of batches) {
      let n = 0, hash = 2166136261;
      for (let i=0;i<rows.length;i++) if (rows[i].visible) {
        hash = Math.imul(hash ^ i, 16777619);
        mesh.instanceMatrix.array.set(full.subarray(i*16,i*16+16),n++*16);
      }
      if (mesh.count !== n || mesh.userData.visibleHash !== hash || mesh.userData.terrainRevision !== terrainRevision) {
        mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.visibleHash = hash; mesh.userData.terrainRevision = terrainRevision;
      }
      // The manually checked spheres replace the mesh's stale aggregate bound.
      mesh.frustumCulled = false;
      mesh.visible = n > 0;
    }
    view.natureStats.visible = visible;
  };
}
