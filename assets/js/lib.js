/* FlammeFR — bibliothèque partagée (module ES, sans dépendance).
 * Toutes les données affichées sont insérées via textContent ou setAttribute, jamais innerHTML. */

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const DATA_URL = '/data/fwi.json';
export const DEPTS_URL = '/assets/data/departements.json';
export const STALE_AFTER_DAYS = 4;

/** Seuils du FWI (classes EFFIS) : bornes basses des niveaux 2, 3 et 4. */
export const THRESHOLDS = [11.2, 21.3, 38];

export const LEVELS = {
  1: { label: 'Faible', short: 'faible', hint: 'Conditions peu favorables aux départs de feu de végétation.', range: 'FWI inférieur à 11,2' },
  2: { label: 'Modéré', short: 'modéré', hint: 'Prudence : un départ de feu reste possible. Respectez les consignes locales.', range: 'FWI de 11,2 à 21,3' },
  3: { label: 'Élevé', short: 'élevé', hint: 'Conditions favorables aux incendies. Évitez tout usage du feu en forêt ou à proximité.', range: 'FWI de 21,3 à 38' },
  4: { label: 'Très élevé', short: 'très élevé', hint: 'Risque maximal. Renseignez-vous auprès de la préfecture sur d’éventuelles restrictions d’accès aux massifs.', range: 'FWI de 38 et plus' },
};

/** Échéances publiées : J0 n'existe que si le calcul le fournit (schéma 3). */
export const DAYS = [
  { k: 0, label: 'Aujourd’hui', short: 'Aujourd’hui' },
  { k: 1, label: 'Demain', short: 'Demain' },
  { k: 2, label: 'Après-demain', short: 'Après-demain' },
];

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

/** Minuscules, sans accents, ponctuation remplacée par des espaces. */
export const fold = (value) =>
  String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children);
  return node;
}

export function svgEl(tag, props = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
}

/** Icône du sprite inline : <svg class="icon"><use href="#icon-nom"/></svg>. */
export function icon(name, cls = '') {
  const svg = svgEl('svg', { class: `icon${cls ? ` ${cls}` : ''}`, 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgEl('use', { href: `#icon-${name}` }));
  return svg;
}

/** Nombre au format français : 27,4. */
export const fmt = (n, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits).replace('.', ',') : '—');

export const levelOfFwi = (v) => (!Number.isFinite(v) ? null : v < 11.2 ? 1 : v < 21.3 ? 2 : v < 38 ? 3 : 4);

/** Pastille « icône + niveau + libellé ». */
export function badge(level, size = '') {
  const known = Boolean(LEVELS[level]);
  return el(
    'span',
    { class: `badge${size ? ` badge--${size}` : ''}`, 'data-l': known ? level : 0 },
    icon(known ? level : 0),
    el('span', { text: known ? `${level} — ${LEVELS[level].label}` : 'Non disponible' })
  );
}

const parisFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
/** « 4 novembre 2026 à 12 h 50 », en heure de Paris. */
export function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = parisFmt.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')} à ${get('hour')} h ${get('minute')}`;
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayLongFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
/** Date d'une échéance : « mer. 4 nov. » à partir de dataDate (AAAA-MM-JJ) et du décalage en jours. */
export function dayDate(dataDate, k, long = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataDate ?? '');
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + k));
  return (long ? dayLongFmt : dayFmt).format(d);
}

/* ------------------------------------------------------------------ */
/* Données                                                              */
/* ------------------------------------------------------------------ */

export class DataError extends Error {}

const isLevel = (v) => v === null || v === undefined || (Number.isInteger(v) && v >= 1 && v <= 4);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

let deptsPromise = null;
/** Liste statique des 96 départements : code, nom, slug, région, préfecture. */
export function getDepts() {
  deptsPromise ??= fetch(DEPTS_URL).then((r) => {
    if (!r.ok) throw new DataError('La liste des départements est indisponible.');
    return r.json();
  });
  return deptsPromise;
}

let dataPromise = null;
/** Charge et valide data/fwi.json (une seule requête par page). */
export function getData() {
  dataPromise ??= (async () => {
    let response;
    try {
      response = await fetch(DATA_URL, { cache: 'no-cache' });
    } catch {
      throw new DataError(navigator.onLine === false
        ? 'Vous semblez hors connexion. Vérifiez votre connexion internet, puis rechargez la page.'
        : 'Les données sont momentanément injoignables. Réessayez dans quelques instants.');
    }
    if (!response.ok) throw new DataError(`Le fichier de données est indisponible (erreur ${response.status}). Réessayez plus tard.`);
    let json;
    try { json = await response.json(); } catch { throw new DataError('Le fichier de données est corrompu. Réessayez plus tard.'); }
    if (!json || typeof json !== 'object' || !Array.isArray(json.departments)) throw new DataError('Le fichier de données n’a pas le format attendu.');

    const byCode = new Map();
    for (const d of json.departments) {
      if (!d || typeof d.code !== 'string' || typeof d.name !== 'string') continue;
      if (![d.j0, d.j1, d.j2].every(isLevel)) continue;
      byCode.set(d.code, d);
    }
    const days = [0, 1, 2].filter((k) => [...byCode.values()].some((d) => Number.isInteger(d[`j${k}`])));
    return {
      fileDate: typeof json.fileDate === 'string' ? json.fileDate : null,
      dataDate: typeof json.dataDate === 'string' ? json.dataDate : null,
      byCode,
      days,
      count: byCode.size,
    };
  })();
  return dataPromise;
}

/** Niveau, FWI et météo d'un département pour une échéance (k = 0, 1 ou 2). */
export function reading(d, k) {
  if (!d) return { level: null, fwi: null, w: null };
  const level = d[`j${k}`];
  return {
    level: Number.isInteger(level) ? level : null,
    fwi: num(d[`fwi${k}`]),
    w: d[`m${k}`] && typeof d[`m${k}`] === 'object' ? d[`m${k}`] : null,
  };
}

/** Évolution entre J+1 et J+2 : sens, écart et phrase. */
export function trend(d) {
  const a = num(d?.fwi1);
  const b = num(d?.fwi2);
  if (a === null || b === null) return null;
  const delta = Math.round((b - a) * 10) / 10;
  if (Math.abs(delta) < 1) return { dir: 'flat', delta, text: 'Stable entre demain et après-demain' };
  return delta > 0
    ? { dir: 'up', delta, text: `En hausse de ${fmt(delta)} point${delta >= 2 ? 's' : ''} d’indice` }
    : { dir: 'down', delta, text: `En baisse de ${fmt(-delta)} point${-delta >= 2 ? 's' : ''} d’indice` };
}

export function isStale(fileDate) {
  const age = Date.now() - new Date(fileDate).getTime();
  return Number.isFinite(age) && age > STALE_AFTER_DAYS * 86_400_000;
}

/** Départements triés du plus au moins exposé pour une échéance (niveau, puis FWI). */
export function ranked(data, k) {
  return [...data.byCode.values()]
    .map((d) => ({ d, ...reading(d, k) }))
    .filter((r) => r.level !== null)
    .sort((x, y) => y.level - x.level || (y.fwi ?? 0) - (x.fwi ?? 0) || x.d.code.localeCompare(y.d.code));
}

/* ------------------------------------------------------------------ */
/* Recherche                                                            */
/* ------------------------------------------------------------------ */

/** Départements correspondant à la saisie : numéro (33, 2A), nom ou région, triés par pertinence. */
export function searchDepts(depts, raw) {
  const q = fold(raw).replace(/^(departement|dept|dep|numero|num|no|n)\s+(?=\S)/, '').replace(/^(departement|dept|dep)(?=\d)/, '');
  if (!q) return [];
  const withOrder = depts.map((d, order) => ({ d, order }));

  if (/^(\d{1,3}|2 ?[ab])$/.test(q)) {
    const code = q.replace(/\s/g, '').toUpperCase();
    const digits = code.replace(/^0+/, '');
    const exact = digits.padStart(2, '0');
    const out = [];
    for (const { d, order } of withOrder) {
      const isExact = d.code === exact || d.code === code || (digits === '20' && (d.code === '2A' || d.code === '2B'));
      if (isExact || (digits && d.code.startsWith(digits))) out.push({ d, order, score: isExact ? 0 : 1 });
    }
    return out.sort((a, b) => a.score - b.score || a.order - b.order).map((s) => s.d);
  }

  const tokens = q.split(' ');
  const out = [];
  for (const { d, order } of withOrder) {
    const name = fold(d.name);
    const words = name.split(' ');
    let score = null;
    if (name.startsWith(q)) score = 0;
    else if (tokens.every((t) => words.some((w) => w.startsWith(t)))) score = 1;
    else if (name.includes(q)) score = 2;
    else if (fold(d.region).includes(q)) score = 3;
    if (score !== null) out.push({ d, order, score });
  }
  return out.sort((a, b) => a.score - b.score || a.order - b.order).map((s) => s.d);
}

/** Observe les éléments .reveal et les révèle au défilement (sans effet si l'utilisateur limite les animations). */
export function initReveal(root = document) {
  const items = [...root.querySelectorAll('.reveal:not(.is-in)')];
  if (!items.length) return;
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((n) => n.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach((n) => io.observe(n));
}
