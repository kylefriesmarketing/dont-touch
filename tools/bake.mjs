// DON'T TOUCH — bake.mjs
//
// Dad's diorama is a model OF SOMEWHERE REAL.
//
// Model railroaders build their layouts from real places, and this board has had
// a rail loop running round its edge since the first commit — so the fiction was
// always sitting there waiting. This turns a real patch of Earth into the 96x96
// board: its actual hills, its actual water, its actual green, and the places
// real people actually chose to build.
//
// Two free, key-less sources, the same pair HOMETOWN uses:
//   • OpenStreetMap via Overpass        — water, green, roads, buildings (ODbL)
//   • AWS Terrain Tiles (terrarium PNG) — elevation (public domain-ish)
//
// ⚠️ BAKE-TIME ONLY. Nothing in the running game imports this file, and sim.js
// stays import-free: a bake writes a plain JSON world and the game reads it.
//
//   node tools/bake.mjs --place "Ithaca, New York" --radius 700 --name ithaca
//   node tools/bake.mjs --center 44.4759,-73.2121 --radius 900 --name burlington

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
// ⚠️ fileURLToPath, NOT new URL(...).pathname. This project lives in a folder
// with a SPACE in its name and import.meta.url percent-encodes it -- so the
// naive pathname gives .../New%20folder/... and the first bake cheerfully
// created a whole second directory called literally 'New%20folder', wrote a
// 99KB world into it, and printed 'wrote worlds/ithaca.json'.
import { fileURLToPath } from 'node:url';
import { decodePng, terrariumToMetres } from './png.mjs';

const N = 96;                      // must match C.N in sim.js
const UA = 'dont-touch-baker/0.1 (hobby diorama project)';

// ⚠️ GLOBAL mirrors only. A regional mirror answers 200 OK with ZERO elements
// for anywhere outside its own region, which bakes a silently empty world — the
// zero-element guard below is the real defence, but not listing regional
// mirrors keeps it from having to fire.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const log = (...a) => console.log(...a);

function parseArgs(argv) {
  const o = { radius: 700, zoom: 13 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--place') o.place = argv[++i];
    else if (k === '--center') o.center = argv[++i];
    else if (k === '--radius') o.radius = +argv[++i];
    else if (k === '--name') o.name = argv[++i];
    else if (k === '--zoom') o.zoom = +argv[++i];
    else if (k === '--title') o.title = argv[++i];
  }
  return o;
}

const metresPerDegree = (lat) => {
  const r = lat * Math.PI / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * r) + 1.175 * Math.cos(4 * r),
    lon: 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r),
  };
};

function bboxAround(lat, lon, radiusM) {
  const m = metresPerDegree(lat);
  return {
    s: lat - radiusM / m.lat, n: lat + radiusM / m.lat,
    w: lon - radiusM / m.lon, e: lon + radiusM / m.lon,
  };
}

async function geocode(place) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(place);
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('geocode ' + r.status);
  const j = await r.json();
  if (!j.length) throw new Error('nowhere called "' + place + '"');
  return { lat: +j[0].lat, lon: +j[0].lon, label: j[0].display_name };
}

// --- overpass ---------------------------------------------------------------
function overpassQuery(b) {
  const bb = b.s + ',' + b.w + ',' + b.n + ',' + b.e;
  return '[out:json][timeout:60];(' +
    'way["natural"="water"](' + bb + ');' +
    'way["waterway"~"^(river|stream|canal)$"](' + bb + ');' +
    'way["landuse"="reservoir"](' + bb + ');' +
    'way["leisure"~"^(park|garden|nature_reserve|pitch)$"](' + bb + ');' +
    'way["landuse"~"^(forest|grass|meadow|orchard|recreation_ground|village_green|cemetery)$"](' + bb + ');' +
    'way["natural"~"^(wood|scrub|grassland|heath)$"](' + bb + ');' +
    'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|track)$"](' + bb + ');' +
    'way["building"](' + bb + ');' +
    ');out geom;';
}

async function fetchOsm(bbox) {
  const body = 'data=' + encodeURIComponent(overpassQuery(bbox));
  const tries = 10;
  for (let a = 1; a <= tries; a++) {
    const host = MIRRORS[(a - 1) % MIRRORS.length];
    const shortHost = new URL(host).host;
    const t0 = Date.now();
    try {
      const r = await fetch(host, {
        method: 'POST', body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      });
      if (r.ok) {
        const j = await r.json();
        const n = j.elements ? j.elements.length : 0;
        // ⚠️ 200 OK with zero elements is a WRONG-REGION MIRROR, not an empty
        // world. Treating it as success bakes a blank board that reads like a
        // rendering bug three hours later.
        if (!n) { log('  ' + shortHost + ' gave 0 elements — wrong region? retrying elsewhere'); continue; }
        log('  overpass ok via ' + shortHost + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's — ' + n + ' elements');
        return j.elements;
      }
      log('  overpass ' + r.status + ' from ' + shortHost + ' (' + a + '/' + tries + ')');
    } catch (e) {
      log('  overpass ' + e.message + ' from ' + shortHost + ' (' + a + '/' + tries + ')');
    }
    await new Promise((res) => setTimeout(res, 900 * a));
  }
  throw new Error('every overpass mirror refused');
}

// --- elevation --------------------------------------------------------------
const lonLatToTile = (lat, lon, z) => {
  const n2 = 2 ** z, r = lat * Math.PI / 180;
  return {
    x: Math.floor((lon + 180) / 360 * n2),
    y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n2),
  };
};

async function fetchTile(z, x, y) {
  const url = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + z + '/' + x + '/' + y + '.png';
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) return terrariumToMetres(decodePng(Buffer.from(await r.arrayBuffer())));
    } catch (e) { /* retry */ }
    await new Promise((res) => setTimeout(res, 400 * (a + 1)));
  }
  throw new Error('terrarium tile ' + z + '/' + x + '/' + y + ' unreachable');
}

/** Every terrarium tile covering bbox, as a bilinear sampler over lat/lon. */
async function buildElevation(bbox, zoom) {
  const a = lonLatToTile(bbox.n, bbox.w, zoom), b = lonLatToTile(bbox.s, bbox.e, zoom);
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const tiles = new Map();
  let count = 0;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      tiles.set(x + '/' + y, await fetchTile(zoom, x, y));
      count++;
    }
  }
  log('  elevation: ' + count + ' terrarium tile' + (count === 1 ? '' : 's') + ' at z' + zoom);
  const n2 = 2 ** zoom, TS = 256;
  return (lat, lon) => {
    const fx = (lon + 180) / 360 * n2;
    const r = lat * Math.PI / 180;
    const fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n2;
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const t = tiles.get(tx + '/' + ty);
    if (!t) return null;
    const px = (fx - tx) * TS, py = (fy - ty) * TS;
    const xi = Math.min(TS - 1, Math.max(0, Math.floor(px)));
    const yi = Math.min(TS - 1, Math.max(0, Math.floor(py)));
    const xj = Math.min(TS - 1, xi + 1), yj = Math.min(TS - 1, yi + 1);
    const sx = px - xi, sy = py - yi;
    const h00 = t[yi * TS + xi], h10 = t[yi * TS + xj];
    const h01 = t[yj * TS + xi], h11 = t[yj * TS + xj];
    return (h00 * (1 - sx) + h10 * sx) * (1 - sy) + (h01 * (1 - sx) + h11 * sx) * sy;
  };
}

// --- rasterising OSM ways onto the board ------------------------------------
function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** lat/lon geometry -> flat [x,y,...] in CELL space (north is -y, matching the board) */
function ringToCells(geometry, bbox) {
  const out = [];
  for (const p of geometry) {
    out.push((p.lon - bbox.w) / (bbox.e - bbox.w) * (N - 1),
             (bbox.n - p.lat) / (bbox.n - bbox.s) * (N - 1));
  }
  return out;
}

function fillRing(mask, ring, value) {
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let i = 0; i < ring.length; i += 2) {
    if (ring[i] < minx) minx = ring[i];
    if (ring[i] > maxx) maxx = ring[i];
    if (ring[i + 1] < miny) miny = ring[i + 1];
    if (ring[i + 1] > maxy) maxy = ring[i + 1];
  }
  const x0 = Math.max(0, Math.floor(minx)), x1 = Math.min(N - 1, Math.ceil(maxx));
  const y0 = Math.max(0, Math.floor(miny)), y1 = Math.min(N - 1, Math.ceil(maxy));
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (mask[y * N + x] !== value && pointInRing(x + 0.5, y + 0.5, ring)) { mask[y * N + x] = value; n++; }
    }
  }
  return n;
}

function strokeLine(mask, ring, value, half) {
  let n = 0;
  for (let i = 0; i < ring.length - 2; i += 2) {
    const ax = ring[i], ay = ring[i + 1], bx = ring[i + 2], by = ring[i + 3];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const x = Math.round(cx + dx), y = Math.round(cy + dy);
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          if (mask[y * N + x] !== value) { mask[y * N + x] = value; n++; }
        }
      }
    }
  }
  return n;
}

// --- the bake ---------------------------------------------------------------
async function bake(opts) {
  let lat, lon, label;
  if (opts.center) {
    const parts = opts.center.split(',').map(Number);
    lat = parts[0]; lon = parts[1];
    label = lat.toFixed(4) + ', ' + lon.toFixed(4);
  } else if (opts.place) {
    log('geocoding "' + opts.place + '"...');
    const g = await geocode(opts.place);
    lat = g.lat; lon = g.lon; label = g.label;
    log('  ' + label + '  (' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ')');
  } else {
    throw new Error('need --place or --center');
  }

  const name = opts.name
    || (opts.place || 'world').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const bbox = bboxAround(lat, lon, opts.radius);
  log('baking ' + name + ': ' + (opts.radius * 2) + 'm across, onto a ' + N + 'x' + N + ' board');

  const els = await fetchOsm(bbox);
  const sample = await buildElevation(bbox, opts.zoom);

  // ---- elevation -> the board's own range
  const raw = new Float64Array(N * N);
  let lo = Infinity, hi = -Infinity, missing = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const la = bbox.n - (y / (N - 1)) * (bbox.n - bbox.s);
      const ln = bbox.w + (x / (N - 1)) * (bbox.e - bbox.w);
      const h = sample(la, ln);
      if (h === null) { missing++; raw[y * N + x] = 0; continue; }
      raw[y * N + x] = h;
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  if (missing) log('  ⚠ ' + missing + ' cells had no elevation tile');
  const relief = hi - lo;
  log('  relief: ' + relief.toFixed(1) + 'm  (' + lo.toFixed(0) + 'm to ' + hi.toFixed(0) + 'm)');

  // ⚠️ NORMALISED, NOT SCALED 1:1. The game's terrain lives in roughly 0..0.8
  // and every constant downstream — CLIMB, the slide term in _move, pondLevel —
  // was tuned against that range. A 400m mountain mapped 1:1 would be a wall
  // nothing could walk up; a 3m-relief coastal town mapped 1:1 would be a flat
  // table with no drainage at all. Both get the same usable range, and the real
  // `reliefM` is recorded so the game can honestly say which kind of place it is.
  const height = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) {
    height[i] = relief > 0.5 ? (raw[i] - lo) / relief * 0.62 : 0.30;
  }

  // ---- OSM masks
  const water = new Uint8Array(N * N);
  const green = new Uint8Array(N * N);
  const road = new Uint8Array(N * N);
  let nWater = 0, nGreen = 0, nRoad = 0, nBuild = 0;
  const buildings = [];
  for (const e of els) {
    if (!e.geometry || e.geometry.length < 2) continue;
    const t = e.tags || {};
    const ring = ringToCells(e.geometry, bbox);
    if (t.natural === 'water' || t.landuse === 'reservoir') {
      nWater += fillRing(water, ring, 1);
    } else if (t.waterway) {
      nWater += strokeLine(water, ring, 1, 0);
    } else if (t.building) {
      // the centre of each real building: where real people already chose to live
      let cx = 0, cy = 0;
      const n = ring.length / 2;
      for (let i = 0; i < ring.length; i += 2) { cx += ring[i]; cy += ring[i + 1]; }
      cx /= n; cy /= n;
      if (cx >= 1 && cy >= 1 && cx < N - 1 && cy < N - 1) {
        buildings.push(+cx.toFixed(2), +cy.toFixed(2));
        nBuild++;
      }
    } else if (t.highway) {
      nRoad += strokeLine(road, ring, 1, 0);
    } else if (t.leisure || t.landuse || t.natural) {
      nGreen += fillRing(green, ring, 1);
    }
  }
  log('  osm: ' + nWater + ' water cells, ' + nGreen + ' green cells, ' + nRoad + ' road cells, ' + nBuild + ' buildings');

  // ⚠️ REAL WATER HAS TO SIT IN A REAL BASIN. OSM says where the lake is; the
  // elevation model does not necessarily agree — terrarium is ~30m native, so a
  // pond is smoothed flat and a river is invisible. So the water mask is pressed
  // INTO the terrain rather than floated on top of it. Without this the game's
  // own _fluids drains the lake downhill on the first tick and the place you
  // baked is gone in about a second.
  // ⚠⚠ FEATHERED BY DISTANCE FROM THE BANK, NOT A FLAT PRESS. The first
  // version dropped every water cell a flat 0.10, which turns a two-cell-wide
  // river into a walled trench with no shallows at all. Measured on Ithaca:
  // NINE kin drowned in 60 days against ZERO on a generated world, because a
  // toy walking down to drink stepped off a bank straight into deep water.
  // The generated pond is broad and shallow ON PURPOSE (it is the only kind
  // TILT can move), so a real one has to be too. A chamfer distance transform
  // gives every water cell its distance to the nearest dry land, so a wide lake
  // gets a deep middle and a narrow stream stays ankle-deep -- which is also
  // just what those things are actually like.
  if (nWater > 0) {
    const INF = 1e9;
    const dist = new Float64Array(N * N);
    for (let i = 0; i < N * N; i++) dist[i] = water[i] ? INF : 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!dist[i]) continue;
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (y > 0) dist[i] = Math.min(dist[i], dist[i - N] + 1);
      if (x > 0 && y > 0) dist[i] = Math.min(dist[i], dist[i - N - 1] + 1.414);
    }
    for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
      const i = y * N + x;
      if (!dist[i]) continue;
      if (x < N - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (y < N - 1) dist[i] = Math.min(dist[i], dist[i + N] + 1);
      if (x < N - 1 && y < N - 1) dist[i] = Math.min(dist[i], dist[i + N + 1] + 1.414);
    }
    let deepest = 0;
    for (let i = 0; i < N * N; i++) {
      if (!water[i]) continue;
      // 0.035 per cell from the bank, capped -- a 1-cell stream drops 0.035,
      // a big lake bottoms out at 0.11 about three cells in
      const d = Math.min(0.11, dist[i] * 0.035);
      height[i] = Math.max(0, height[i] - d);
      if (d > deepest) deepest = d;
    }
    log('  water pressed in, deepest ' + deepest.toFixed(3) + ' (feathered from the bank)');
  }

  const out = {
    // ⚠️ TWO NAMES ON PURPOSE. `label` is the full Nominatim string and it is
    // what the ODbL attribution line shows. `title` is what a human calls the
    // place -- because the geocoder happily resolves "Keswick, Cumbria" to
    // "Keswick Climbing Wall & Activity Centre, Goosewell Farm, ...", which is
    // correct, useless as a button, and was exactly what the picker displayed.
    v: 1, name, label, title: opts.title || (opts.place ? String(opts.place).split(',')[0].trim() : name),
    lat, lon, radius: opts.radius, zoom: opts.zoom, N,
    reliefM: +relief.toFixed(1),
    // quantised to 1/4096 — the game clamps height to [0, 1.2] and nothing reads
    // finer than that, and it keeps a world file at tens of KB instead of megabytes
    height: Array.from(height, (v) => Math.round(v * 4096)),
    water: Array.from(water),
    green: Array.from(green),
    road: Array.from(road),
    buildings,
    attribution: 'terrain: AWS Terrain Tiles (SRTM/Copernicus); map data © OpenStreetMap contributors (ODbL)',
  };

  const here = fileURLToPath(new URL('.', import.meta.url));
  const dir = here + '../worlds/';
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = dir + name + '.json';
  writeFileSync(file, JSON.stringify(out));
  log('wrote worlds/' + name + '.json  (' + ((readFileSync(file).length / 1024) | 0) + ' KB)');

  const idxFile = dir + 'index.json';
  let idx = [];
  if (existsSync(idxFile)) {
    try { idx = JSON.parse(readFileSync(idxFile, 'utf8')); } catch (e) { idx = []; }
  }
  idx = idx.filter((w) => w.name !== name);
  idx.push({ name, title: out.title, label, reliefM: out.reliefM, radius: opts.radius, water: nWater, buildings: nBuild });
  writeFileSync(idxFile, JSON.stringify(idx, null, 1));
  log('worlds/index.json now lists ' + idx.length);
}

bake(parseArgs(process.argv.slice(2))).catch((e) => {
  console.error('bake failed:', e.message);
  process.exit(1);
});
