// DON'T TOUCH — glb.js · a minimal GLB reader, ~150 lines, no dependencies.
//
// ⚠️ WHY THIS EXISTS INSTEAD OF GLTFLoader. The vendored three.js is CORE ONLY
// by project rule — GLTFLoader lives in examples/, and pulling examples in was
// the line this project drew on day one. But a plain, unskinned, uncompressed
// GLB is just a zip-less container: 12-byte header, a JSON chunk, a BIN chunk.
// Reading THAT is a hundred and fifty lines of our own code, which is how
// everything else here is built anyway.
//
// ⚠️ WHAT IT DELIBERATELY DOES NOT READ — and these are load-time contracts,
// not omissions to fix later. The tool side (tools/glb-diet.mjs) guarantees
// every model we ship is already inside these lines:
//   · no Draco / meshopt / quantization extensions (decompressed at diet time)
//   · no skins, no animations (nothing here is rigged — see the Age of Toys
//     rigging post-mortem before ever changing that)
//   · no sparse accessors, no camera/light nodes
// A file outside the contract fails loudly in dev (console.error names the
// extension) and resolves null, and the caller treats null as "no model" —
// the same silent degradation the title art uses.
//
// Usage:  loadGLB('assets/station.glb', THREE).then(group => ...)

export async function loadGLB(url, THREE) {
  try {
    const buf = await (await fetch(url)).arrayBuffer();
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
    // chunks: [len][type][data...] — JSON first, BIN second
    let off = 12, json = null, bin = null;
    while (off < buf.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      const data = buf.slice(off + 8, off + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
      else if (type === 0x004e4942) bin = data;
      off += 8 + len + (len % 4 ? 4 - (len % 4) : 0);
    }
    const g = json;
    const ext = (g.extensionsRequired || []);
    if (ext.length) throw new Error('required extension: ' + ext.join(','));

    // accessors → typed arrays (tightly packed or strided)
    const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
    const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const readAcc = (ai) => {
      const a = g.accessors[ai];
      if (a.sparse) throw new Error('sparse accessor');
      const bv = g.bufferViews[a.bufferView];
      const T = COMP[a.componentType], n = SIZE[a.type];
      const stride = bv.byteStride || 0;
      const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
      if (!stride || stride === n * T.BYTES_PER_ELEMENT) {
        return new T(bin, base, a.count * n);
      }
      // strided: copy out — models this small never make it worth a view
      const out = new T(a.count * n);
      for (let i = 0; i < a.count; i++) {
        const src = new T(bin, base + i * stride, n);
        out.set(src, i * n);
      }
      return out;
    };

    // materials → MeshStandardMaterial; textures decode from the BIN blob
    const texCache = new Map();
    const loadTex = async (ti) => {
      if (texCache.has(ti)) return texCache.get(ti);
      const img = g.images[g.textures[ti].source];
      const bv = g.bufferViews[img.bufferView];
      const blob = new Blob([new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength)], { type: img.mimeType });
      const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
      const t = new THREE.Texture(bmp);
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false;                      // glTF UV convention
      t.needsUpdate = true;
      texCache.set(ti, t);
      return t;
    };
    const mats = await Promise.all((g.materials || []).map(async (m) => {
      const p = m.pbrMetallicRoughness || {};
      const mat = new THREE.MeshStandardMaterial({
        color: p.baseColorFactor ? new THREE.Color(p.baseColorFactor[0], p.baseColorFactor[1], p.baseColorFactor[2]) : 0xffffff,
        roughness: p.roughnessFactor != null ? p.roughnessFactor : 0.9,
        metalness: p.metallicFactor != null ? p.metallicFactor : 0.0,
      });
      if (p.baseColorTexture) mat.map = await loadTex(p.baseColorTexture.index);
      // ⚠️ normal/occlusion/emissive deliberately ignored: the Age of Toys work
      // measured AI normal maps rendering as DENTS on flat plastic. Diet strips
      // them; ignoring them here is the second line of the same defence.
      return mat;
    }));

    const meshGroup = (mi) => {
      const grp = new THREE.Group();
      for (const prim of g.meshes[mi].primitives) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(readAcc(prim.attributes.POSITION), 3));
        if (prim.attributes.NORMAL != null) geo.setAttribute('normal', new THREE.BufferAttribute(readAcc(prim.attributes.NORMAL), 3));
        if (prim.attributes.TEXCOORD_0 != null) geo.setAttribute('uv', new THREE.BufferAttribute(readAcc(prim.attributes.TEXCOORD_0), 2));
        if (prim.indices != null) geo.setIndex(new THREE.BufferAttribute(readAcc(prim.indices), 1));
        if (prim.attributes.NORMAL == null) geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, prim.material != null ? mats[prim.material] : new THREE.MeshStandardMaterial());
        grp.add(mesh);
      }
      return grp;
    };

    // nodes → groups, with each node's own TRS
    const buildNode = (ni) => {
      const nd = g.nodes[ni];
      const grp = nd.mesh != null ? meshGroup(nd.mesh) : new THREE.Group();
      if (nd.matrix) {
        const m = new THREE.Matrix4().fromArray(nd.matrix);
        m.decompose(grp.position, grp.quaternion, grp.scale);
      } else {
        if (nd.translation) grp.position.fromArray(nd.translation);
        if (nd.rotation) grp.quaternion.fromArray(nd.rotation);
        if (nd.scale) grp.scale.fromArray(nd.scale);
      }
      for (const c of (nd.children || [])) grp.add(buildNode(c));
      return grp;
    };
    const root = new THREE.Group();
    const scene = g.scenes[g.scene || 0];
    for (const ni of scene.nodes) root.add(buildNode(ni));
    return root;
  } catch (e) {
    console.error('glb: ' + url + ' failed to load — the game continues without it.', e.message || e);
    return null;
  }
}
