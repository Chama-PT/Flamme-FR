/* FlammeFR — accueil : indicateur national, carte vivante, départements sous vigilance, liste. */
import {
  LEVELS, DAYS, el, svgEl, icon, badge, fmt, fold, getData, getDepts, reading, trend, ranked, dayDate, formatDateTime, initReveal, DataError,
} from './lib.js';

const $ = (id) => document.getElementById(id);
const state = { day: 1, view: 'map', sort: 'code', filter: '' };
let DATA = null;
let DEPTS = [];
let INFO = new Map();

const dayName = (k) => DAYS[k].label;
const dayLower = (k) => DAYS[k].label.toLowerCase();
const trendIcon = { up: 'trend-up', down: 'trend-down', flat: 'trend-flat' };

/* ------------------------------------------------------------------ */
/* Statistiques du jour affiché                                          */
/* ------------------------------------------------------------------ */
function stats() {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let total = 0;
  for (const d of DATA.byCode.values()) {
    const { level } = reading(d, state.day);
    if (level) { counts[level] += 1; total += 1; }
  }
  const max = [4, 3, 2, 1].find((l) => counts[l] > 0) ?? null;
  return { counts, total, max };
}

function describe(info, r) {
  const where = `${info.name} (${info.code})`;
  if (!r.level) return `${where} : données indisponibles pour ${dayLower(state.day)}`;
  const fwi = r.fwi !== null ? `, indice FWI ${fmt(r.fwi)}` : '';
  return `${where} : niveau ${r.level} ${LEVELS[r.level].short}${fwi}, ${dayLower(state.day)}`;
}

/* ------------------------------------------------------------------ */
/* Hero : indicateur national                                           */
/* ------------------------------------------------------------------ */
const RADIUS = 88;
const CIRC = 2 * Math.PI * RADIUS;

function paintHero(s) {
  const hero = $('hero');
  hero.dataset.calm = String(s.max !== null && s.max <= 1);

  $('nat-day').textContent = `${dayName(state.day)} · ${dayDate(DATA.dataDate, state.day)}`;
  const center = $('nat-center');
  center.dataset.l = s.max ?? 0;
  $('nat-word').textContent = s.max ? LEVELS[s.max].label : 'Indisponible';
  $('nat-sub').textContent = s.max ? `Niveau ${s.max} sur 4` : 'Aucune donnée';

  let acc = 0;
  const present = [1, 2, 3, 4].filter((l) => s.counts[l] > 0).length;
  for (const l of [1, 2, 3, 4]) {
    const seg = document.querySelector(`#nat-ring .seg[data-l="${l}"]`);
    const len = s.total ? (CIRC * s.counts[l]) / s.total : 0;
    const gap = present > 1 && len > 0 ? 3 : 0;
    seg.style.strokeDasharray = `${Math.max(len - gap, 0)} ${CIRC}`;
    seg.style.strokeDashoffset = `${-acc}`;
    acc += len;
    const row = document.querySelector(`#nat-rows [data-l="${l}"] b`);
    row.textContent = String(s.counts[l]);
  }

  const top = ranked(DATA, state.day)[0];
  const foot = $('nat-foot');
  foot.replaceChildren();
  if (top && top.fwi !== null) {
    const info = INFO.get(top.d.code);
    foot.append('Indice FWI le plus élevé : ', el('strong', { text: fmt(top.fwi) }), ` à ${info?.name ?? top.d.name} (${top.d.code}).`);
  } else {
    foot.append('Indice FWI indisponible pour cette échéance.');
  }

  // Bande de métadonnées
  const upd = $('m-update');
  upd.replaceChildren();
  if (DATA.fileDate) upd.append(el('time', { datetime: DATA.fileDate, text: formatDateTime(DATA.fileDate) }));
  else upd.append('Indisponible');
  $('m-count').textContent = `${s.total} sur ${DEPTS.length}`;
  const lvl = $('m-level');
  lvl.replaceChildren();
  if (s.max) lvl.append(badge(s.max, 'sm'), el('span', { class: 'sr-only', text: ` ${dayLower(state.day)}` }));
  else lvl.append('Indisponible');
}

/* ------------------------------------------------------------------ */
/* Carte                                                                */
/* ------------------------------------------------------------------ */
const stage = $('map-stage');
const svg = $('france-map');
const tip = $('tip');
const hl = $('map-hl');
const sel = $('sel');
const BASE = { w: 1000, h: 930 };
const view = { x: 0, y: 0, w: BASE.w, h: BASE.h };
let dragMoved = false;

function paintMap() {
  const glow = $('map-glow');
  const hatch = $('map-hatch');
  glow.replaceChildren();
  hatch.replaceChildren();
  for (const a of stage.querySelectorAll('.dept')) {
    const code = a.dataset.code;
    const r = reading(DATA.byCode.get(code), state.day);
    a.dataset.l = r.level ?? 0;
    if (a.closest('#france-map')) {
      a.setAttribute('aria-label', describe(INFO.get(code), r));
      const d = a.querySelector('.shape').getAttribute('d');
      if (r.level >= 3) glow.append(svgEl('path', { d, 'data-l': r.level }));
      if (r.level === 4) hatch.append(svgEl('path', { d, fill: 'url(#hatch-4)' }));
    }
  }
}

function paintHeroMap() {
  const g = $('hero-map-g');
  if (!g.childElementCount) {
    for (const a of svg.querySelectorAll('.dept')) {
      g.append(svgEl('path', { class: 'shape', d: a.querySelector('.shape').getAttribute('d'), 'data-code': a.dataset.code }));
    }
  }
  for (const p of g.children) p.dataset.l = reading(DATA.byCode.get(p.dataset.code), state.day).level ?? 0;
}

function paintLegend(s) {
  for (const li of document.querySelectorAll('#legend [data-l]')) li.querySelector('[data-count]').textContent = String(s.counts[li.dataset.l]);
}

/* Infobulle */
function fillTip(code) {
  const info = INFO.get(code);
  const d = DATA.byCode.get(code);
  const r = reading(d, state.day);
  tip.dataset.l = r.level ?? 0;
  tip.querySelector('.tip__name').textContent = info.name;
  tip.querySelector('.tip__code').textContent = info.code;
  const bd = tip.querySelector('.tip__badge');
  bd.replaceChildren(r.level ? badge(r.level, 'sm') : el('span', { text: 'Données indisponibles' }));
  tip.querySelector('.tip__fwi').textContent = r.fwi !== null ? fmt(r.fwi) : '—';
  const tr = trend(d);
  const trendEl = tip.querySelector('.tip__trend');
  trendEl.replaceChildren();
  if (tr) trendEl.append(icon(trendIcon[tr.dir]), tr.dir === 'flat' ? 'Stable' : tr.dir === 'up' ? 'En hausse' : 'En baisse');
  else trendEl.append('Indisponible');
  tip.querySelector('.tip__region').textContent = info.region;
}

function placeTip(x, y) {
  const box = stage.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let px = x - box.left + 16;
  let py = y - box.top + 16;
  if (px + tw > box.width - 8) px = x - box.left - tw - 16;
  if (py + th > box.height - 8) py = box.height - th - 8;
  tip.style.transform = `translate3d(${Math.max(8, px)}px, ${Math.max(8, py)}px, 0)`;
}

function setActive(a) {
  stage.querySelectorAll('.dept.is-active').forEach((n) => n.classList.remove('is-active'));
  if (!a) { hl.classList.remove('on'); return; }
  a.classList.add('is-active');
  if (a.closest('#france-map')) {
    hl.setAttribute('d', a.querySelector('.shape').getAttribute('d'));
    hl.classList.add('on');
  }
}

function hideTip() { tip.classList.remove('on'); setActive(null); }

/* Fiche de sélection (tactile et clavier) */
function showSel(code) {
  const info = INFO.get(code);
  const d = DATA.byCode.get(code);
  const r = reading(d, state.day);
  const tr = trend(d);
  sel.dataset.l = r.level ?? 0;
  sel.replaceChildren(
    el('p', { class: 'eyebrow', text: `${info.region} · ${dayName(state.day)}` }),
    el('h3', { class: 'sel__name', text: `${info.name} (${info.code})` }),
    r.level ? badge(r.level, 'lg') : el('p', { class: 'sel__hint', text: 'Données indisponibles pour cette échéance.' }),
    ...(r.fwi !== null ? [el('p', { class: 'sel__fwi' }, el('span', { class: 'num', text: fmt(r.fwi) }), el('span', { text: 'INDICE FWI' }))] : []),
    ...(r.level ? [el('p', { class: 'sel__hint', text: LEVELS[r.level].hint })] : []),
    ...(tr ? [el('p', { class: 'bcard__trend' }, icon(trendIcon[tr.dir]), tr.text)] : []),
    el('a', { class: 'btn btn--primary btn--sm', href: `/departement/${info.slug}/` }, 'Voir la fiche', icon('arrow', 'icon--arrow'))
  );
}

function resetSel() {
  sel.dataset.l = 0;
  sel.replaceChildren(el('p', { class: 'eyebrow', text: 'Département sélectionné' }), el('p', { class: 'sel__hint', text: 'Survolez la carte, ou touchez un département, pour afficher son niveau. Au clavier, parcourez les départements avec la touche Tab.' }));
}

/* Zoom et déplacement */
function applyView() {
  svg.setAttribute('viewBox', `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`);
  stage.dataset.zoomed = String(view.w < BASE.w - 1);
  const [plus, minus, reset] = stage.querySelectorAll('.map-ctrl button');
  if (plus) { plus.disabled = view.w <= 251; minus.disabled = view.w >= BASE.w - 1; reset.disabled = view.w >= BASE.w - 1; }
}
const clampView = (v) => {
  v.w = Math.min(BASE.w, Math.max(250, v.w));
  v.h = (v.w * BASE.h) / BASE.w;
  v.x = Math.min(BASE.w - v.w, Math.max(0, v.x));
  v.y = Math.min(BASE.h - v.h, Math.max(0, v.y));
  return v;
};
let anim = 0;
function animateTo(target) {
  cancelAnimationFrame(anim);
  const from = { ...view };
  const to = clampView({ ...target });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { Object.assign(view, to); applyView(); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 260);
    const e = 1 - (1 - p) ** 3;
    for (const key of ['x', 'y', 'w', 'h']) view[key] = from[key] + (to[key] - from[key]) * e;
    applyView();
    if (p < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
function zoomBy(factor, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
  const w = Math.min(BASE.w, Math.max(250, view.w / factor));
  const k = w / view.w;
  animateTo({ x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w, h: 0 });
}
function toSvgPoint(clientX, clientY) {
  const r = svg.getBoundingClientRect();
  return [view.x + ((clientX - r.left) / r.width) * view.w, view.y + ((clientY - r.top) / r.height) * view.h];
}

function buildControls() {
  const mk = (label, text, handler) => {
    const b = el('button', { type: 'button', 'aria-label': label, text });
    b.addEventListener('click', handler);
    return b;
  };
  stage.append(el('div', { class: 'map-ctrl', role: 'group', 'aria-label': 'Zoom de la carte' },
    mk('Zoomer', '+', () => zoomBy(1.6)),
    mk('Dézoomer', '−', () => zoomBy(1 / 1.6)),
    mk('Réinitialiser le zoom', '1×', () => animateTo({ x: 0, y: 0, w: BASE.w, h: BASE.h }))));
  applyView();

  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || view.w >= BASE.w - 1) return;
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, id: e.pointerId, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; dragMoved = true; stage.dataset.dragging = 'true'; hideTip(); }
    if (!drag.moved) return;
    const r = svg.getBoundingClientRect();
    const v = clampView({ x: drag.vx - (dx / r.width) * view.w, y: drag.vy - (dy / r.height) * view.h, w: view.w, h: view.h });
    Object.assign(view, v);
    applyView();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    delete stage.dataset.dragging;
    setTimeout(() => { dragMoved = false; }, 0);
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return; // le défilement normal de la page n'est jamais détourné
    e.preventDefault();
    const [cx, cy] = toSvgPoint(e.clientX, e.clientY);
    zoomBy(e.deltaY < 0 ? 1.25 : 0.8, cx, cy);
  }, { passive: false });
}

/* Loupe sur l'Île-de-France */
function buildLoupe() {
  const codes = ['75', '92', '93', '94', '78', '91', '95', '77'];
  const boxes = codes.map((c) => svg.querySelector(`.dept[data-code="${c}"] .shape`)).filter(Boolean).map((p) => p.getBBox());
  if (boxes.length < codes.length) return;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  const side = Math.max(x1 - x0, y1 - y0) * 1.04;
  const vb = `${(x0 + x1) / 2 - side / 2} ${(y0 + y1) / 2 - side / 2} ${side} ${side}`;
  const loupe = svgEl('svg', { viewBox: vb, 'aria-hidden': 'true', focusable: 'false' });
  for (const c of codes) {
    const a = svgEl('a', { class: 'dept', 'data-code': c, href: `/departement/${INFO.get(c).slug}/`, tabindex: '-1' });
    a.append(svgEl('path', { class: 'shape', d: svg.querySelector(`.dept[data-code="${c}"] .shape`).getAttribute('d') }));
    loupe.append(a);
  }
  stage.append(el('div', { class: 'loupe' }, loupe, el('span', { class: 'loupe__label', 'aria-hidden': 'true', text: 'Île-de-France' })));
}

function initMapEvents() {
  const canHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || dragMoved) return;
    const a = e.target.closest?.('.dept');
    if (!a) { hideTip(); return; }
    fillTip(a.dataset.code);
    setActive(a);
    tip.classList.add('on');
    placeTip(e.clientX, e.clientY);
  });
  stage.addEventListener('pointerleave', hideTip);
  stage.addEventListener('focusin', (e) => {
    const a = e.target.closest?.('.dept');
    if (!a) return;
    fillTip(a.dataset.code);
    setActive(a);
    const r = a.getBoundingClientRect();
    tip.classList.add('on');
    placeTip(r.left + r.width / 2, r.top + r.height / 2);
    showSel(a.dataset.code);
  });
  stage.addEventListener('focusout', hideTip);
  stage.addEventListener('click', (e) => {
    const a = e.target.closest?.('.dept');
    if (!a) return;
    if (dragMoved) { e.preventDefault(); return; }
    if (!canHover()) { e.preventDefault(); setActive(a); showSel(a.dataset.code); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
}

/* ------------------------------------------------------------------ */
/* Onglets de jour et bascule carte / liste                             */
/* ------------------------------------------------------------------ */
function buildTabs() {
  const host = $('day-tabs');
  host.replaceChildren();
  host.setAttribute('role', 'tablist');
  host.setAttribute('aria-label', 'Échéance affichée');
  host.classList.remove('sk-tabs', 'skeleton');
  const tabs = DATA.days.map((k) => {
    const b = el('button', { type: 'button', class: 'tab', role: 'tab', id: `tab-${k}`, 'aria-selected': String(k === state.day), tabindex: k === state.day ? '0' : '-1' },
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

function setDay(k) {
  state.day = k;
  $('day-tabs').querySelectorAll('.tab').forEach((b, i) => {
    const on = DATA.days[i] === k;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  render();
  $('day-live').textContent = `Affichage : ${dayLower(k)}, ${dayDate(DATA.dataDate, k, true)}.`;
}

function initViewSwitch() {
  const buttons = document.querySelectorAll('#view-switch button');
  buttons.forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    document.querySelector('.map-view').hidden = state.view !== 'map';
    document.querySelector('.list-view').hidden = state.view !== 'list';
  }));
}

/* ------------------------------------------------------------------ */
/* Liste                                                                */
/* ------------------------------------------------------------------ */
function paintList() {
  const q = fold(state.filter);
  const rows = DEPTS.map((info, order) => ({ info, order, ...reading(DATA.byCode.get(info.code), state.day), d: DATA.byCode.get(info.code) }))
    .filter((r) => !q || fold(`${r.info.code} ${r.info.name} ${r.info.region}`).includes(q));
  const sorters = {
    code: (a, b) => a.order - b.order,
    name: (a, b) => a.info.name.localeCompare(b.info.name, 'fr'),
    level: (a, b) => (b.level ?? 0) - (a.level ?? 0) || (b.fwi ?? 0) - (a.fwi ?? 0) || a.order - b.order,
    fwi: (a, b) => (b.fwi ?? -1) - (a.fwi ?? -1) || a.order - b.order,
  };
  rows.sort(sorters[state.sort]);
  $('list-caption').textContent = `Niveaux de risque ${dayLower(state.day)} : ${rows.length} département${rows.length > 1 ? 's' : ''}.`;
  $('list-body').replaceChildren(...rows.map((r) => {
    const tr = trend(r.d);
    return el('tr', {},
      el('th', { scope: 'row' }, el('a', { href: `/departement/${r.info.slug}/` }, el('span', { class: 'code', text: r.info.code }), r.info.name)),
      el('td', {}, badge(r.level, 'sm')),
      el('td', { class: 'n', text: fmt(r.fwi) }),
      el('td', {}, tr ? el('span', { class: 'bcard__trend' }, icon(trendIcon[tr.dir]), tr.dir === 'flat' ? 'Stable' : `${tr.delta > 0 ? '+' : '−'}${fmt(Math.abs(tr.delta))}`) : '—'));
  }));
  if (!rows.length) $('list-body').append(el('tr', {}, el('td', { colspan: '4', text: 'Aucun département ne correspond à votre recherche.' })));
  document.querySelectorAll('#list-table thead th').forEach((th) => {
    const active = [...th.querySelectorAll('button')].find((b) => b.dataset.sort === state.sort);
    if (active) th.setAttribute('aria-sort', state.sort === 'level' || state.sort === 'fwi' ? 'descending' : 'ascending');
    else th.removeAttribute('aria-sort');
  });
}

function initList() {
  document.querySelectorAll('#list-table thead button').forEach((b) => b.addEventListener('click', () => { state.sort = b.dataset.sort; paintList(); }));
  $('list-filter').addEventListener('input', (e) => { state.filter = e.target.value; paintList(); });
}

/* ------------------------------------------------------------------ */
/* Départements sous vigilance (bento)                                  */
/* ------------------------------------------------------------------ */
function bentoCard(r, size, scaleMax) {
  const info = INFO.get(r.d.code);
  const tr = trend(r.d);
  const bars = DATA.days.map((k) => ({ k, ...reading(r.d, k) })).filter((b) => b.fwi !== null);
  const aria = bars.map((b) => `${dayLower(b.k)} ${fmt(b.fwi)}`).join(', ');
  const traj = el('div', { class: 'traj', role: 'img', 'aria-label': `Indice FWI : ${aria}` },
    ...bars.map((b) => {
      const i = el('i', { class: b.k === state.day ? 'on' : '' });
      i.style.setProperty('--h', `${Math.max(8, Math.min(100, (b.fwi / scaleMax) * 100))}%`);
      return i;
    }));
  return el('article', { class: `bcard bcard--${size} reveal`, 'data-l': r.level },
    el('div', { class: 'bcard__top' },
      el('div', {}, el('p', { class: 'bcard__code', text: (size === 'std' ? info.code : `${info.code} · ${info.region}`).toUpperCase() }), el('h3', { text: info.name })),
      badge(r.level, size === 'hero' ? 'lg' : 'sm')),
    el('div', { class: 'bcard__bottom' },
      el('div', { class: 'bcard__fwi' },
        el('span', { class: 'num', text: fmt(r.fwi) }),
        el('small', { text: `Indice FWI · ${dayLower(state.day)}` }),
        ...(tr ? [el('span', { class: 'bcard__trend' }, icon(trendIcon[tr.dir]), tr.text)] : [])),
      el('div', { style: false }, traj)),
    el('span', { class: 'bcard__go', 'aria-hidden': 'true' }, 'Voir la fiche', icon('arrow')),
    el('a', { class: 'bcard__link', href: `/departement/${info.slug}/`, 'aria-label': `Voir la fiche : ${info.name} (${info.code}), niveau ${r.level} ${LEVELS[r.level].short}` }));
}

function paintBento(s) {
  const list = ranked(DATA, state.day).filter((r) => r.fwi !== null).slice(0, 6);
  const host = $('bento');
  const scaleMax = 1.1 * Math.max(12, ...list.map((r) => r.fwi), ...list.flatMap((r) => DATA.days.map((k) => reading(r.d, k).fwi ?? 0)));
  const sizes = ['hero', 'wide', 'wide', 'std', 'std', 'std'];
  host.replaceChildren(...list.map((r, i) => bentoCard(r, sizes[i], scaleMax)));
  initReveal(host);

  const note = $('bento-state');
  note.replaceChildren();
  const hot = s.counts[3] + s.counts[4];
  if (s.max !== null && s.max <= 1) {
    note.append(el('strong', { text: `Aucun département n’est au-dessus du niveau 1 ${dayLower(state.day)}.` }), ' Voici ceux dont l’indice FWI est le plus élevé.');
  } else if (hot > 0) {
    note.append(el('strong', { text: `${hot} département${hot > 1 ? 's' : ''} au niveau 3 ou plus ${dayLower(state.day)}.` }), ' Classés par niveau, puis par indice FWI.');
  } else {
    note.append(el('strong', { text: `Aucun département au niveau 3 ou plus ${dayLower(state.day)}.` }), ' Classés par niveau, puis par indice FWI.');
  }
  note.hidden = false;
}

/* ------------------------------------------------------------------ */
/* Index par région                                                     */
/* ------------------------------------------------------------------ */
function paintRegions() {
  for (const a of document.querySelectorAll('.region a[data-code]')) {
    const r = reading(DATA.byCode.get(a.dataset.code), state.day);
    a.dataset.l = r.level ?? 0;
    let hidden = a.querySelector('.sr-only');
    if (!hidden) { hidden = el('span', { class: 'sr-only' }); a.append(hidden); }
    hidden.textContent = r.level ? ` — niveau ${r.level}, ${LEVELS[r.level].short}` : '';
  }
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                        */
/* ------------------------------------------------------------------ */
function render() {
  const s = stats();
  paintHero(s);
  paintMap();
  paintHeroMap();
  paintLegend(s);
  paintBento(s);
  paintList();
  paintRegions();
}

function failed(error) {
  const msg = error instanceof DataError ? error.message : 'Les niveaux n’ont pas pu être chargés. Rechargez la page.';
  $('nat-word').replaceChildren('Indisponible');
  $('nat-sub').textContent = 'Données non chargées';
  $('nat-foot').textContent = msg;
  $('day-tabs').replaceChildren();
  $('day-tabs').classList.remove('skeleton', 'sk-tabs');
  sel.replaceChildren(el('p', { class: 'notice notice--error', text: msg }));
  $('bento').replaceChildren(el('p', { class: 'notice notice--error', text: msg }));
  $('bento-state').hidden = true;
  for (const id of ['m-update', 'm-count', 'm-level']) $(id).textContent = 'Indisponible';
}

async function init() {
  initReveal();
  try {
    [DEPTS, DATA] = await Promise.all([getDepts(), getData()]);
  } catch (error) {
    failed(error);
    return;
  }
  INFO = new Map(DEPTS.map((d) => [d.code, d]));
  if (!DATA.days.length) { failed(new DataError('Aucune donnée n’est disponible pour le moment. Les niveaux sont recalculés chaque jour : réessayez plus tard.')); return; }

  state.day = DATA.days.includes(0) ? 0 : DATA.days.includes(1) ? 1 : DATA.days[0];
  buildTabs();
  buildControls();
  buildLoupe();
  initMapEvents();
  initViewSwitch();
  initList();
  resetSel();
  render();
  document.getElementById('hero').classList.add('is-ready');
}

init();
