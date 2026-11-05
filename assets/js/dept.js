/* FlammeFR — page département : échéances, jauge, graphique FWI, conditions, conseils, départements voisins. */
import {
  LEVELS, DAYS, THRESHOLDS, el, svgEl, icon, badge, fmt, getData, reading, trend, dayDate, initReveal, DataError,
} from './lib.js';
import { MEANING, adviceFor } from './content.js';

const $ = (id) => document.getElementById(id);
const root = $('dept-root');
const CODE = root.dataset.code;
const PREF = root.dataset.pref;
const state = { day: 1 };
let DATA = null;
let D = null;
let DAYS_OK = [];

const dayLower = (k) => DAYS[k].label.toLowerCase();
const plural = (n, w) => `${w}${n >= 2 ? 's' : ''}`;

/* ------------------------------------------------------------------ */
/* Jauge semi-circulaire (échelle FWI 0 à 60)                           */
/* ------------------------------------------------------------------ */
const CX = 150;
const CY = 150;
const R = 118;
const SCALE_MAX = 60;
const ang = (v) => Math.PI + (Math.min(Math.max(v, 0), SCALE_MAX) / SCALE_MAX) * Math.PI;
const pt = (a, r) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];

function arcPath(v0, v1, r) {
  const gap = 0.018;
  const [x0, y0] = pt(ang(v0) + gap, r);
  const [x1, y1] = pt(ang(v1) - gap, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function buildDial() {
  const bounds = [0, ...THRESHOLDS, SCALE_MAX];
  const s = svgEl('svg', { viewBox: '0 0 300 190', role: 'img', focusable: 'false' });
  for (let l = 1; l <= 4; l += 1) s.append(svgEl('path', { class: 'arc', 'data-l': l, d: arcPath(bounds[l - 1], bounds[l], R) }));
  for (const v of [0, ...THRESHOLDS, SCALE_MAX]) {
    const a = ang(v);
    const [tx, ty] = pt(a, R + 22);
    s.append(svgEl('text', { class: 'tick', x: tx.toFixed(1), y: (ty + 4).toFixed(1), 'text-anchor': v === 0 ? 'end' : v === SCALE_MAX ? 'start' : 'middle' }, fmt(v, v % 1 ? 1 : 0)));
  }
  const needle = svgEl('g', { class: 'needle' },
    svgEl('path', { d: `M${CX - R + 26} ${CY}L${CX - 12} ${CY - 3.5}L${CX - 12} ${CY + 3.5}Z`, fill: 'var(--ink)' }),
    svgEl('circle', { cx: CX, cy: CY, r: 8, fill: 'var(--ink)' }),
    svgEl('circle', { cx: CX, cy: CY, r: 3, fill: 'var(--bg)' }));
  s.append(needle);
  s.append(svgEl('text', { class: 'tick', x: CX, y: CY + 32, 'text-anchor': 'middle' }, 'INDICE FWI'));
  return { svg: s, needle };
}

/* ------------------------------------------------------------------ */
/* Panneau « maintenant »                                               */
/* ------------------------------------------------------------------ */
let dial = null;

function paintNow(animate) {
  const r = reading(D, state.day);
  const panel = $('now-panel');
  panel.dataset.l = r.level ?? 0;
  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    panel.classList.remove('swap');
    void panel.offsetWidth; // relance l'animation
    panel.classList.add('swap');
  }
  $('now-date').textContent = `${DAYS[state.day].label} · ${dayDate(DATA.dataDate, state.day, true)}`;
  $('now-badge').replaceChildren(badge(r.level, 'lg'));
  $('now-fwi').textContent = fmt(r.fwi);
  $('now-hint').textContent = LEVELS[r.level].hint;
  $('dept-badge').replaceChildren(badge(r.level, 'lg'), el('span', { class: 'sr-only', text: ` ${dayLower(state.day)}` }));

  const v = r.fwi ?? 0;
  dial.svg.setAttribute('aria-label', `Indice FWI ${fmt(r.fwi)} sur une échelle de 0 à 60, niveau ${r.level} ${LEVELS[r.level].short}`);
  dial.svg.querySelectorAll('.arc').forEach((a) => a.classList.toggle('on', Number(a.dataset.l) === r.level));
  dial.needle.style.transform = `rotate(${(Math.min(v, SCALE_MAX) / SCALE_MAX) * 180}deg)`;
}

function buildTabs() {
  const host = $('dtabs');
  host.replaceChildren();
  host.className = 'tabs';
  host.setAttribute('role', 'tablist');
  host.setAttribute('aria-label', 'Échéance affichée');
  const tabs = DAYS_OK.map((k) => {
    const b = el('button', { type: 'button', class: 'tab', role: 'tab', id: `dtab-${k}`, 'aria-selected': String(k === state.day), 'aria-controls': 'now-panel', tabindex: k === state.day ? '0' : '-1' },
      el('span', { text: DAYS[k].short }), el('small', { text: dayDate(DATA.dataDate, k) }));
    b.addEventListener('click', () => setDay(k));
    return b;
  });
  host.append(...tabs);
  host.addEventListener('keydown', (e) => {
    const i = tabs.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length];
    t.focus();
    t.click();
  });
}

/* ------------------------------------------------------------------ */
/* Graphique FWI                                                        */
/* ------------------------------------------------------------------ */
let chartNarrow = null;
function paintChart() {
  const pts = DAYS_OK.map((k) => ({ k, ...reading(D, k) })).filter((p) => p.fwi !== null);
  const host = $('chart');
  if (!pts.length) { $('chart-card').hidden = true; return; }
  const narrow = (host.clientWidth || window.innerWidth) < 560;
  chartNarrow = narrow;
  const W = narrow ? 420 : 960;
  const H = narrow ? 340 : 360;
  const m = narrow ? { l: 40, r: 14, t: 34, b: 52 } : { l: 52, r: 110, t: 36, b: 56 };
  const maxV = Math.max(...pts.map((p) => p.fwi));
  const yMax = Math.max(45, Math.ceil((maxV * 1.12) / 5) * 5);
  const y = (v) => m.t + (1 - Math.min(v, yMax) / yMax) * (H - m.t - m.b);
  const s = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', focusable: 'false', 'aria-label': `Indice FWI par échéance : ${pts.map((p) => `${dayLower(p.k)} ${fmt(p.fwi)}`).join(', ')}.` });

  const bounds = [0, ...THRESHOLDS, yMax];
  for (let l = 1; l <= 4; l += 1) {
    const top = y(bounds[l]);
    const bottom = y(bounds[l - 1]);
    if (bounds[l - 1] >= yMax) continue;
    const g = svgEl('g', { 'data-l': l });
    g.append(svgEl('rect', { class: 'band', x: m.l, y: top, width: W - m.l - m.r, height: bottom - top }));
    if (!narrow && bottom - top > 16) g.append(svgEl('text', { class: 'thr-t', x: W - m.r + 12, y: (top + bottom) / 2 + 4, 'text-anchor': 'start' }, LEVELS[l].label.toUpperCase()));
    s.append(g);
  }
  for (const t of THRESHOLDS) {
    if (t >= yMax) continue;
    s.append(svgEl('line', { class: 'thr', x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
    s.append(svgEl('text', { class: 'thr-t', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, fmt(t)));
  }
  s.append(svgEl('text', { class: 'thr-t', x: m.l - 8, y: y(0) + 4, 'text-anchor': 'end' }, '0'));

  const slot = (W - m.l - m.r) / pts.length;
  const bw = Math.min(110, slot * (narrow ? 0.5 : 0.45));
  pts.forEach((p, i) => {
    const cx = m.l + slot * (i + 0.5);
    const top = y(p.fwi);
    const h = Math.max(2, y(0) - top);
    const rect = svgEl('rect', { class: 'bar', 'data-l': p.level, 'data-k': p.k, x: cx - bw / 2, y: y(0) - h, width: bw, height: h, rx: 4 });
    rect.style.animationDelay = `${i * 0.12}s`;
    rect.style.cursor = 'pointer';
    rect.addEventListener('click', () => setDay(p.k));
    s.append(rect);
    s.append(svgEl('text', { class: 'val', x: cx, y: top - 10, 'text-anchor': 'middle' }, fmt(p.fwi)));
    s.append(svgEl('text', { class: 'axis', x: cx, y: H - 26, 'text-anchor': 'middle' }, DAYS[p.k].short));
    s.append(svgEl('text', { class: 'thr-t', x: cx, y: H - 10, 'text-anchor': 'middle' }, dayDate(DATA.dataDate, p.k)));
  });

  host.replaceChildren(s);
  const table = $('chart-table');
  table.replaceChildren(
    el('caption', { text: 'Indice FWI et niveau par échéance' }),
    el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'Échéance' }), el('th', { scope: 'col', text: 'Indice FWI' }), el('th', { scope: 'col', text: 'Niveau' }))),
    el('tbody', {}, ...pts.map((p) => el('tr', {}, el('th', { scope: 'row', text: DAYS[p.k].label }), el('td', { text: fmt(p.fwi) }), el('td', { text: `${p.level} — ${LEVELS[p.level].label}` })))));
  markBars();
}

window.addEventListener('resize', () => {
  const host = $('chart');
  if (!host || !host.firstChild) return;
  const narrow = host.clientWidth < 560;
  if (narrow !== chartNarrow) paintChart();
});

function markBars() {
  document.querySelectorAll('#chart .bar').forEach((b) => {
    const on = Number(b.dataset.k) === state.day;
    b.style.stroke = on ? 'var(--ink)' : 'none';
    b.style.strokeWidth = on ? '2' : '0';
    b.style.opacity = on ? '1' : '0.62';
  });
}

/* ------------------------------------------------------------------ */
/* Conditions météo                                                     */
/* ------------------------------------------------------------------ */
function paintConditions() {
  const w = reading(D, state.day).w;
  const sec = $('conditions');
  if (!w) { sec.hidden = true; return; }
  const items = [
    { ic: 'thermo', label: 'Température', v: w.t, unit: '°C', d: 1, text: 'Température de l’air à midi, heure de Paris.' },
    { ic: 'drop', label: 'Humidité de l’air', v: w.h, unit: '%', d: 0, text: 'Humidité relative à midi : plus l’air est sec, plus la végétation s’assèche vite.' },
    { ic: 'wind', label: 'Vent', v: w.w, unit: 'km/h', d: 1, text: 'Vitesse du vent à 10 m, à midi.' },
    { ic: 'rain', label: 'Pluie sur 24 h', v: w.r, unit: 'mm', d: 1, text: 'Pluie cumulée sur les 24 heures précédant midi.' },
    { ic: 'leaf', label: 'Végétation fine (FFMC)', v: w.ffmc, unit: '', d: 1, text: 'Humidité des feuilles et brindilles mortes : plus la valeur est haute, plus elles sont sèches.' },
    { ic: 'sun', label: 'Humus (DMC)', v: w.dmc, unit: '', d: 1, text: 'Humidité de la couche d’humus : plus la valeur est haute, plus elle est sèche.' },
    { ic: 'gauge', label: 'Sécheresse profonde (DC)', v: w.dc, unit: '', d: 1, text: 'Sécheresse des couches profondes du sol, qui évolue lentement : plus la valeur est haute, plus la sécheresse est installée.' },
  ].filter((i) => i.v !== null && i.v !== undefined);
  if (!items.length) { sec.hidden = true; return; }
  $('cond-title').textContent = `Conditions ${dayLower(state.day)}`;
  $('cond-grid').replaceChildren(...items.map((i) => el('div', { class: 'cond__item' },
    el('p', { class: 'eyebrow' }, icon(i.ic), i.label),
    el('p', { class: 'cond__val' }, fmt(i.v, i.d), ...(i.unit ? [el('small', { text: i.unit })] : [])),
    el('p', { text: i.text }))));
  sec.hidden = false;
}

/* ------------------------------------------------------------------ */
/* Signification et conseils                                            */
/* ------------------------------------------------------------------ */
function paintMeaning() {
  const r = reading(D, state.day);
  const tr = trend(D);
  const card = $('meaning');
  card.dataset.l = r.level;
  const lines = [
    el('p', {}, el('strong', { text: `Niveau ${r.level} — ${LEVELS[r.level].label}` }), ` (${LEVELS[r.level].range.toLowerCase()}). `, MEANING[r.level]),
  ];
  if (r.fwi !== null) {
    if (r.level < 4) {
      const next = THRESHOLDS[r.level - 1];
      const gap = Math.round((next - r.fwi) * 10) / 10;
      lines.push(el('p', { text: `L’indice est de ${fmt(r.fwi)} : il manque ${fmt(gap)} ${plural(gap, 'point')} pour atteindre le niveau ${r.level + 1} (${fmt(next)}).` }));
    } else {
      const over = Math.round((r.fwi - THRESHOLDS[2]) * 10) / 10;
      lines.push(el('p', { text: `L’indice est de ${fmt(r.fwi)}, soit ${fmt(over)} ${plural(over, 'point')} au-dessus du seuil du niveau 4 (${fmt(THRESHOLDS[2])}).` }));
    }
  }
  if (tr) lines.push(el('p', { text: `Évolution entre demain et après-demain : ${tr.text.charAt(0).toLowerCase()}${tr.text.slice(1)}.` }));
  lines.push(el('p', { class: 'fine-print', text: `Le niveau est calculé au chef-lieu (${PREF}) : il peut différer ailleurs dans le département, notamment sur le littoral ou en altitude.` }));
  $('meaning-body').replaceChildren(...lines);

  $('advice-title').textContent = `Conseils de vigilance · niveau ${r.level}`;
  $('advice').dataset.l = r.level;
  $('advice-list').replaceChildren(...adviceFor(r.level, PREF).map((t) => el('li', { text: t })));
  document.querySelectorAll('#levels-fold [data-level]').forEach((n) => n.toggleAttribute('data-current', Number(n.dataset.level) === r.level));
}

function paintNeighbors() {
  document.querySelectorAll('.neighbors a[data-code]').forEach((a) => {
    const r = reading(DATA.byCode.get(a.dataset.code), state.day);
    a.dataset.l = r.level ?? 0;
    a.querySelector('.slot')?.replaceChildren(...(r.level ? [badge(r.level, 'sm'), ...(r.fwi !== null ? [el('span', { class: 'code', text: `FWI ${fmt(r.fwi)}` })] : [])] : []));
  });
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                        */
/* ------------------------------------------------------------------ */
function setDay(k, animate = true) {
  state.day = k;
  $('dtabs').querySelectorAll('.tab').forEach((b, i) => {
    const on = DAYS_OK[i] === k;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  paintNow(animate);
  markBars();
  paintConditions();
  paintMeaning();
  paintNeighbors();
}

function fail(message) {
  $('now-panel').replaceChildren(el('p', { class: 'notice notice--error', text: message }));
  $('now-panel').classList.remove('skeleton');
  $('dtabs').replaceChildren();
  $('dtabs').className = '';
  $('chart-card').hidden = true;
  $('dept-badge').replaceChildren();
}

async function init() {
  initReveal();
  try {
    DATA = await getData();
  } catch (error) {
    fail(error instanceof DataError ? error.message : 'Les niveaux n’ont pas pu être chargés. Rechargez la page.');
    return;
  }
  D = DATA.byCode.get(CODE);
  DAYS_OK = DATA.days.filter((k) => reading(D, k).level !== null);
  if (!D || !DAYS_OK.length) {
    fail('Aucune prévision n’est disponible actuellement pour ce département. Les niveaux sont recalculés chaque jour, toute l’année.');
    return;
  }
  state.day = DAYS_OK.includes(0) ? 0 : DAYS_OK.includes(1) ? 1 : DAYS_OK[0];

  // Structure du panneau (créée une seule fois)
  const panel = $('now-panel');
  dial = buildDial();
  panel.replaceChildren(
    el('div', { class: 'now__body' },
      el('p', { class: 'now__date', id: 'now-date' }),
      el('div', { id: 'now-badge' }),
      el('p', { class: 'now__big' }, el('span', { class: 'num', id: 'now-fwi' }), el('small', { text: 'Indice FWI' })),
      el('p', { class: 'now__hint', id: 'now-hint' })),
    el('div', { class: 'dial' }, dial.svg));
  panel.classList.remove('skeleton', 'sk-now');

  buildTabs();
  paintChart();
  setDay(state.day, false);
  initReveal();
}

init();
