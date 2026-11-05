#!/usr/bin/env node
/**
 * Outil facultatif (déjà exécuté) : prépare le fond de carte des départements.
 * Entrées : departements.geojson et departements-version-simplifiee.geojson du dépôt
 *           https://github.com/gregoiredavid/france-geojson (Licence Ouverte, données IGN).
 * Sortie  : tools/out/map.json = tracés SVG projetés (Lambert-93), centres et départements limitrophes.
 * Usage   : node tools/build-map.mjs <dossier-france-geojson>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? '.');
const simple = JSON.parse(readFileSync(resolve(dir, 'departements-version-simplifiee.geojson'), 'utf8'));
const full = JSON.parse(readFileSync(resolve(dir, 'departements.geojson'), 'utf8'));

/* Projection conique conforme de Lambert (paramètres Lambert-93, ellipsoïde GRS80). */
const a = 6378137, f = 1 / 298.257222101, e = Math.sqrt(2 * f - f * f);
const rad = (d) => (d * Math.PI) / 180;
const phi0 = rad(46.5), phi1 = rad(44), phi2 = rad(49), lam0 = rad(3);
const m = (p) => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2);
const t = (p) => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
const n = (Math.log(m(phi1)) - Math.log(m(phi2))) / (Math.log(t(phi1)) - Math.log(t(phi2)));
const F = m(phi1) / (n * t(phi1) ** n);
const rho0 = a * F * t(phi0) ** n;
function project([lon, lat]) {
  const rho = a * F * t(rad(lat)) ** n;
  const theta = n * (rad(lon) - lam0);
  return [rho * Math.sin(theta), rho0 - rho * Math.cos(theta)]; // y vers le haut (mètres)
}

const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

/* Étendue globale en mètres, puis mise à l'échelle sur 1000 unités de large. */
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const ft of simple.features) for (const poly of polysOf(ft.geometry)) for (const [lon, lat] of poly[0]) {
  const [x, y] = project([lon, lat]);
  minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
}
const scale = 1000 / (maxX - minX);
const W = 1000, H = Math.ceil((maxY - minY) * scale);
const toSvg = (ll) => { const [x, y] = project(ll); return [(x - minX) * scale, (maxY - y) * scale]; };

/* Douglas-Peucker. */
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e2] = stack.pop(); let dmax = 0, idx = -1;
    const [x1, y1] = pts[s], [x2, y2] = pts[e2]; const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = s + 1; i < e2; i += 1) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > tol && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e2]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const r1 = (v) => Math.round(v * 10) / 10;
const TOL = 1.15;

const depts = {};
for (const ft of simple.features) {
  const code = ft.properties.code;
  let d = ''; let cx = 0, cy = 0, area = 0, best = 0, bcx = 0, bcy = 0;
  for (const poly of polysOf(ft.geometry)) {
    poly.forEach((ring, k) => {
      let pts = ring.map(toSvg);
      // Anneau fermé : on le coupe au point le plus éloigné du départ avant de simplifier chaque moitié.
      let far = 0, fd = -1;
      pts.forEach(([x, y], i) => { const dd = Math.hypot(x - pts[0][0], y - pts[0][1]); if (dd > fd) { fd = dd; far = i; } });
      pts = [...simplify(pts.slice(0, far + 1), TOL), ...simplify(pts.slice(far), TOL).slice(1)];
      if (pts.length < 4) return;
      d += `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z`;
      if (k === 0) { // centre de l'anneau extérieur le plus grand (formule du polygone)
        let A = 0, X = 0, Y = 0;
        for (let i = 0; i < pts.length - 1; i += 1) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const c = x0 * y1 - x1 * y0; A += c; X += (x0 + x1) * c; Y += (y0 + y1) * c;
        }
        A /= 2; if (Math.abs(A) > best) { best = Math.abs(A); bcx = X / (6 * A); bcy = Y / (6 * A); }
        area += Math.abs(A);
      }
    });
  }
  depts[code] = { name: ft.properties.nom, d, cx: r1(bcx), cy: r1(bcy), area: Math.round(area) };
}

/* Voisinage : deux départements sont limitrophes s'ils partagent au moins 2 sommets (carte haute définition). */
const key = ([x, y]) => `${Math.round(x * 1e5)}:${Math.round(y * 1e5)}`;
const owners = new Map();
for (const ft of full.features) {
  const code = ft.properties.code;
  for (const poly of polysOf(ft.geometry)) for (const ring of poly) for (const pt of ring) {
    const k = key(pt); if (!owners.has(k)) owners.set(k, new Set()); owners.get(k).add(code);
  }
}
const shared = new Map();
for (const set of owners.values()) {
  if (set.size < 2) continue; const arr = [...set];
  for (let i = 0; i < arr.length; i += 1) for (let j = i + 1; j < arr.length; j += 1) {
    const k = `${arr[i]}|${arr[j]}`; shared.set(k, (shared.get(k) ?? 0) + 1);
  }
}
for (const code of Object.keys(depts)) depts[code].neighbors = [];
for (const [k, count] of shared) {
  if (count < 2) continue; const [x, y] = k.split('|');
  if (depts[x] && depts[y]) { depts[x].neighbors.push(y); depts[y].neighbors.push(x); }
}
for (const dd of Object.values(depts)) dd.neighbors.sort();

mkdirSync(resolve('tools/out'), { recursive: true });
writeFileSync(resolve('tools/out/map.json'), JSON.stringify({ width: W, height: H, depts }));
const total = Object.values(depts).reduce((s, d) => s + d.d.length, 0);
console.log(`Carte : ${Object.keys(depts).length} départements, ${W}×${H}, ${(total / 1024).toFixed(1)} Ko de tracés.`);
