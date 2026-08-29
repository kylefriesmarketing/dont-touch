// DON'T TOUCH — tools/glb-diet.mjs · bake-time only, never shipped, never
// imported by the game. Turns a raw Higgsfield image_to_3d bake into a file
// inside glb.js's load contract:
//   node tools/glb-diet.mjs <in.glb> <out.glb> [texSize=1024]
//
// What it does, and why each step exists:
//   · decompress Draco/meshopt/quantization — glb.js reads plain buffers only
//   · strip normal / metallicRoughness / occlusion / emissive textures — the
//     Age of Toys pipeline measured AI normal maps rendering as DENTS on flat
//     plastic; only baseColor survives
//   · resize the baseColor texture and re-encode as JPEG — an AI bake ships a
//     2-4k PNG that is most of the file
//   · dedup + weld + prune — AI meshes are disconnected shells; expect little
//     (~17% was the measured ceiling in the AoT work), take what's free
//
// ⚠️ THE TEXTURE STEP SHELLS OUT TO POWERSHELL/System.Drawing, NOT sharp.
// sharp in the gltf-kit passes a trivial smoke test and then dies with
// ERR_DLOPEN_FAILED the moment the real pipeline loads it (win32-x64 native
// binding vs node 24 — the same breakage the Age of Toys bible recorded in
// July). System.Drawing is already the project's proven image tool (the title
// art shipped through it). Do not put textureCompress back without running
// THIS FILE end to end, not a smoke test.
//
// ⚠️ Uses the PERMANENT kit at C:\Users\kylef\tools\gltf-kit — installing a
// local copy would put 60MB of tooling inside a game folder that ships nothing.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire('file:///C:/Users/kylef/tools/gltf-kit/');
const { NodeIO } = require('@gltf-transform/core');
const { KHRONOS_EXTENSIONS } = require('@gltf-transform/extensions');
const { dedup, prune, weld } = require('@gltf-transform/functions');
const draco3d = require('draco3dgltf');

const [inFile, outFile, texArg] = process.argv.slice(2);
if (!inFile || !outFile) { console.error('usage: node tools/glb-diet.mjs <in.glb> <out.glb> [texSize]'); process.exit(1); }
const TEX = parseInt(texArg || '1024', 10);

const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const doc = await io.read(inFile);
const root = doc.getRoot();

// strip every texture slot except baseColor
for (const mat of root.listMaterials()) {
  mat.setNormalTexture(null);
  mat.setMetallicRoughnessTexture(null);
  mat.setOcclusionTexture(null);
  mat.setEmissiveTexture(null);
}

await doc.transform(dedup(), weld(), prune());

// shrink surviving textures via PowerShell + System.Drawing
for (const tex of root.listTextures()) {
  const src = join(tmpdir(), 'dt-tex-in.bin');
  const dst = join(tmpdir(), 'dt-tex-out.jpg');
  writeFileSync(src, tex.getImage());
  const ps = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${src}')
$S = [math]::Min(${TEX}, [math]::Max($img.Width, $img.Height))
$w = $S; $h = $S
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, $w, $h)
$g.Dispose()
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 86
$bmp.Save('${dst}', $enc, $p)
$bmp.Dispose(); $img.Dispose()`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps]);
  tex.setImage(readFileSync(dst));
  tex.setMimeType('image/jpeg');
  rmSync(src, { force: true }); rmSync(dst, { force: true });
}

// ⚠️ the load contract: no compression extensions survive to the output.
// io.read already decompressed the buffers; dropping the extension objects
// stops NodeIO from re-encoding them on write.
for (const ext of root.listExtensionsUsed()) ext.dispose();

await io.write(outFile, doc);

const kb = (f) => Math.round(statSync(f).size / 1024);
let tris = 0;
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const idx = prim.getIndices();
  tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
}
console.log(`${inFile} ${kb(inFile)}KB -> ${outFile} ${kb(outFile)}KB · ${Math.round(tris)} tris · tex<=${TEX} jpeg · extensions: none`);
