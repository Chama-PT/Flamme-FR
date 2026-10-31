#!/usr/bin/env node
/**
 * Calcule le risque d’incendie de forêt de chaque département de France métropolitaine
 * à partir des prévisions horaires d’Open-Meteo (API sans clé, disponible toute l’année),
 * puis écrit `data/fwi.json`.
 *
 * Méthode : indice forêt-météo canadien (FWI, Van Wagner 1987), calculé à 12 h (heure de Paris)
 * au chef-lieu de chaque département, pour aujourd’hui (J0), demain (J+1) et après-demain (J+2).
 * La série est amorcée sur les 30 derniers jours pour stabiliser les codes DMC et DC.
 * Le niveau (1 à 4) suit les classes du FWI utilisées par le système européen EFFIS.
 *
 * Variables d'environnement :
 *   OPEN_METEO_URL  (facultative) URL de l’API. Défaut : https://api.open-meteo.com/v1/forecast
 *
 * Codes de sortie :
 *   0  succès, ou données inchangées
 *   1  réponse inattendue ou requête refusée
 *   2  erreur réseau ou HTTP persistante
 *
 * Aucune dépendance externe : Node.js 20 ou plus récent.
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_API_URL = 'https://api.open-meteo.com/v1/forecast';
const LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/deed.fr';
const API_LABEL = 'Open-Meteo, prévisions horaires (/v1/forecast), 30 jours d’amorçage';
const METHOD_LABEL =
  'Indice forêt-météo canadien (FWI) calculé à 12 h, heure de Paris, au chef-lieu de chaque département. '
  + 'Niveaux : 1 Faible (FWI < 11,2) ; 2 Modéré (11,2 à 21,3) ; 3 Élevé (21,3 à 38) ; 4 Très élevé (38 et plus).';
const OUTPUT_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'fwi.json'
);
const HOURLY_VARIABLES = 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation';
const TIMEZONE = 'Europe/Paris';
const PAST_DAYS = 30; // amorçage des codes DMC et DC
const FORECAST_DAYS = 3; // aujourd’hui, demain, après-demain
const BATCH_SIZE = 48; // localisations par requête
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

/** Départements de France métropolitaine (ordre officiel des codes). */
export const DEPARTMENTS = [
  ['01', 'Ain'], ['02', 'Aisne'], ['03', 'Allier'], ['04', 'Alpes-de-Haute-Provence'],
  ['05', 'Hautes-Alpes'], ['06', 'Alpes-Maritimes'], ['07', 'Ardèche'], ['08', 'Ardennes'],
  ['09', 'Ariège'], ['10', 'Aube'], ['11', 'Aude'], ['12', 'Aveyron'],
  ['13', 'Bouches-du-Rhône'], ['14', 'Calvados'], ['15', 'Cantal'], ['16', 'Charente'],
  ['17', 'Charente-Maritime'], ['18', 'Cher'], ['19', 'Corrèze'], ['2A', 'Corse-du-Sud'],
  ['2B', 'Haute-Corse'], ['21', "Côte-d'Or"], ['22', "Côtes-d'Armor"], ['23', 'Creuse'],
  ['24', 'Dordogne'], ['25', 'Doubs'], ['26', 'Drôme'], ['27', 'Eure'],
  ['28', 'Eure-et-Loir'], ['29', 'Finistère'], ['30', 'Gard'], ['31', 'Haute-Garonne'],
  ['32', 'Gers'], ['33', 'Gironde'], ['34', 'Hérault'], ['35', 'Ille-et-Vilaine'],
  ['36', 'Indre'], ['37', 'Indre-et-Loire'], ['38', 'Isère'], ['39', 'Jura'],
  ['40', 'Landes'], ['41', 'Loir-et-Cher'], ['42', 'Loire'], ['43', 'Haute-Loire'],
  ['44', 'Loire-Atlantique'], ['45', 'Loiret'], ['46', 'Lot'], ['47', 'Lot-et-Garonne'],
  ['48', 'Lozère'], ['49', 'Maine-et-Loire'], ['50', 'Manche'], ['51', 'Marne'],
  ['52', 'Haute-Marne'], ['53', 'Mayenne'], ['54', 'Meurthe-et-Moselle'], ['55', 'Meuse'],
  ['56', 'Morbihan'], ['57', 'Moselle'], ['58', 'Nièvre'], ['59', 'Nord'],
  ['60', 'Oise'], ['61', 'Orne'], ['62', 'Pas-de-Calais'], ['63', 'Puy-de-Dôme'],
  ['64', 'Pyrénées-Atlantiques'], ['65', 'Hautes-Pyrénées'], ['66', 'Pyrénées-Orientales'],
  ['67', 'Bas-Rhin'], ['68', 'Haut-Rhin'], ['69', 'Rhône'], ['70', 'Haute-Saône'],
  ['71', 'Saône-et-Loire'], ['72', 'Sarthe'], ['73', 'Savoie'], ['74', 'Haute-Savoie'],
  ['75', 'Paris'], ['76', 'Seine-Maritime'], ['77', 'Seine-et-Marne'], ['78', 'Yvelines'],
  ['79', 'Deux-Sèvres'], ['80', 'Somme'], ['81', 'Tarn'], ['82', 'Tarn-et-Garonne'],
  ['83', 'Var'], ['84', 'Vaucluse'], ['85', 'Vendée'], ['86', 'Vienne'],
  ['87', 'Haute-Vienne'], ['88', 'Vosges'], ['89', 'Yonne'], ['90', 'Territoire de Belfort'],
  ['91', 'Essonne'], ['92', 'Hauts-de-Seine'], ['93', 'Seine-Saint-Denis'],
  ['94', 'Val-de-Marne'], ['95', "Val-d'Oise"],
];

/** Coordonnées (latitude, longitude) du chef-lieu de chaque département : point de calcul. */
export const CHEF_LIEU = {
  '01': [46.205, 5.226], '02': [49.563, 3.620], '03': [46.565, 3.333], '04': [44.093, 6.236],
  '05': [44.559, 6.079], '06': [43.710, 7.262], '07': [44.735, 4.599], '08': [49.773, 4.720],
  '09': [42.965, 1.605], '10': [48.297, 4.074], '11': [43.213, 2.349], '12': [44.350, 2.575],
  '13': [43.296, 5.381], '14': [49.183, -0.370], '15': [44.932, 2.443], '16': [45.650, 0.156],
  '17': [46.160, -1.151], '18': [47.084, 2.399], '19': [45.267, 1.771], '2A': [41.919, 8.738],
  '2B': [42.703, 9.450], '21': [47.322, 5.041], '22': [48.514, -2.765], '23': [46.170, 1.868],
  '24': [45.184, 0.719], '25': [47.238, 6.024], '26': [44.933, 4.892], '27': [49.024, 1.151],
  '28': [48.446, 1.489], '29': [47.996, -4.098], '30': [43.837, 4.360], '31': [43.605, 1.444],
  '32': [43.646, 0.586], '33': [44.838, -0.579], '34': [43.611, 3.877], '35': [48.112, -1.674],
  '36': [46.811, 1.691], '37': [47.394, 0.685], '38': [45.188, 5.724], '39': [46.674, 5.555],
  '40': [43.890, -0.499], '41': [47.586, 1.336], '42': [45.440, 4.387], '43': [45.043, 3.885],
  '44': [47.218, -1.554], '45': [47.902, 1.909], '46': [44.447, 1.442], '47': [44.203, 0.616],
  '48': [44.518, 3.500], '49': [47.478, -0.563], '50': [49.117, -1.083], '51': [48.956, 4.364],
  '52': [48.110, 5.139], '53': [48.070, -0.770], '54': [48.692, 6.184], '55': [48.772, 5.161],
  '56': [47.658, -2.760], '57': [49.120, 6.177], '58': [46.990, 3.161], '59': [50.629, 3.057],
  '60': [49.430, 2.081], '61': [48.429, 0.091], '62': [50.291, 2.779], '63': [45.777, 3.087],
  '64': [43.296, -0.370], '65': [43.233, 0.078], '66': [42.699, 2.895], '67': [48.574, 7.752],
  '68': [48.079, 7.358], '69': [45.764, 4.836], '70': [47.623, 6.155], '71': [46.307, 4.829],
  '72': [48.000, 0.200], '73': [45.565, 5.918], '74': [45.899, 6.129], '75': [48.857, 2.352],
  '76': [49.443, 1.100], '77': [48.539, 2.659], '78': [48.801, 2.131], '79': [46.323, -0.464],
  '80': [49.894, 2.296], '81': [43.928, 2.148], '82': [44.018, 1.355], '83': [43.124, 5.928],
  '84': [43.949, 4.806], '85': [46.670, -1.426], '86': [46.581, 0.340], '87': [45.833, 1.262],
  '88': [48.173, 6.450], '89': [47.798, 3.570], '90': [47.639, 6.863], '91': [48.624, 2.440],
  '92': [48.892, 2.207], '93': [48.907, 2.440], '94': [48.790, 2.455], '95': [49.036, 2.076],
};

const ORDER = new Map(DEPARTMENTS.map(([code], i) => [code, i]));
const NAMES = new Map(DEPARTMENTS);

/* -------------------------------------------------------------------------- */
/* Erreurs                                                                    */
/* -------------------------------------------------------------------------- */

class ScriptError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

/* -------------------------------------------------------------------------- */
/* Utilitaires                                                                */
/* -------------------------------------------------------------------------- */

/** Minuscules, sans accents, ponctuation remplacée par des espaces. */
export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Date du jour à Paris, au format AAAA-MM-JJ. */
export function parisToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Ajoute des jours à une date AAAA-MM-JJ. */
export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Indice forêt-météo canadien (Van Wagner, 1987)                             */
/* -------------------------------------------------------------------------- */

/** Valeurs de départ, utilisées pour amorcer la série. */
export const START = { ffmc: 85, dmc: 6, dc: 15 };

/** Longueur effective du jour pour le DMC, à 46° N, par mois (janvier = index 0). */
const LE_DMC = [6.5, 7.5, 9.0, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8.0, 7.0, 6.0];
/** Facteur de longueur du jour pour le DC, à 46° N, par mois (janvier = index 0). */
const LF_DC = [-1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5.0, 2.4, 0.4, -1.6, -1.6];

/** Code d’humidité des combustibles fins (FFMC), à partir du code de la veille et des observations de midi. */
export function ffmc(prev, temp, rh, wind, rain) {
  const H = clamp(rh, 0, 100);
  const W = Math.max(wind, 0);
  const T = temp;
  let mo = (147.2 * (101 - prev)) / (59.5 + prev);

  if (rain > 0.5) {
    const rf = rain - 0.5;
    let mr = mo + 42.5 * rf * Math.exp(-100 / (251 - mo)) * (1 - Math.exp(-6.93 / rf));
    if (mo > 150) mr += 0.0015 * (mo - 150) ** 2 * Math.sqrt(rf);
    mo = Math.min(mr, 250);
  }

  const Ed = 0.942 * H ** 0.679 + 11 * Math.exp((H - 100) / 10) + 0.18 * (21.1 - T) * (1 - Math.exp(-0.115 * H));
  const Ew = 0.618 * H ** 0.753 + 10 * Math.exp((H - 100) / 10) + 0.18 * (21.1 - T) * (1 - Math.exp(-0.115 * H));

  let m;
  if (mo > Ed) {
    const ko = 0.424 * (1 - (H / 100) ** 1.7) + 0.0694 * Math.sqrt(W) * (1 - (H / 100) ** 8);
    const kd = ko * 0.581 * Math.exp(0.0365 * T);
    m = Ed + (mo - Ed) * 10 ** -kd;
  } else if (mo < Ew) {
    const dry = (100 - H) / 100;
    const kl = 0.424 * (1 - dry ** 1.7) + 0.0694 * Math.sqrt(W) * (1 - dry ** 8);
    const kw = kl * 0.581 * Math.exp(0.0365 * T);
    m = Ew - (Ew - mo) * 10 ** -kw;
  } else {
    m = mo;
  }
  return (59.5 * (250 - m)) / (147.2 + m);
}

/** Code d’humidité des couches de fermentation (DMC). */
export function dmc(prev, temp, rh, rain, month) {
  let po = prev;
  if (rain > 1.5) {
    const re = 0.92 * rain - 1.27;
    const mo = 20 + Math.exp(5.6348 - po / 43.43);
    let b;
    if (po <= 33) b = 100 / (0.5 + 0.3 * po);
    else if (po <= 65) b = 14 - 1.3 * Math.log(po);
    else b = 6.2 * Math.log(po) - 17.2;
    const mr = mo + (1000 * re) / (48.77 + b * re);
    po = Math.max(244.72 - 43.43 * Math.log(mr - 20), 0);
  }
  const T = Math.max(temp, -1.1);
  const H = clamp(rh, 0, 100);
  const K = 1.894 * (T + 1.1) * (100 - H) * LE_DMC[month - 1] * 1e-6;
  return po + 100 * K;
}

/** Code de sécheresse (DC). */
export function dc(prev, temp, rain, month) {
  let Do = prev;
  if (rain > 2.8) {
    const rd = 0.83 * rain - 1.27;
    const Qo = 800 * Math.exp(-Do / 400);
    const Qr = Qo + 3.937 * rd;
    Do = Math.max(400 * Math.log(800 / Qr), 0);
  }
  const V = temp > -2.8 ? Math.max(0.36 * (temp + 2.8) + LF_DC[month - 1], 0) : 0;
  return Do + 0.5 * V;
}

/** Indice de propagation initiale (ISI). */
export function isi(wind, ffmcValue) {
  const m = (147.2 * (101 - ffmcValue)) / (59.5 + ffmcValue);
  const fW = Math.exp(0.05039 * Math.max(wind, 0));
  const fF = 91.9 * Math.exp(-0.1386 * m) * (1 + m ** 5.31 / 4.93e7);
  return 0.208 * fW * fF;
}

/** Indice d’accumulation (BUI), à partir du DMC et du DC. */
export function bui(P, D) {
  if (P + 0.4 * D <= 0) return 0;
  if (P <= 0.4 * D) return (0.8 * P * D) / (P + 0.4 * D);
  return P - (1 - (0.8 * D) / (P + 0.4 * D)) * (0.92 + (0.0114 * P) ** 1.7);
}

/** Indice forêt-météo (FWI), à partir de l’ISI et du BUI. */
export function fwi(isiValue, buiValue) {
  const fD = buiValue <= 80
    ? 0.626 * buiValue ** 0.809 + 2
    : 1000 / (25 + 108.64 * Math.exp(-0.023 * buiValue));
  const B = 0.1 * isiValue * fD;
  return B > 1 ? Math.exp(2.72 * (0.434 * Math.log(B)) ** 0.647) : B;
}

/** Niveau officiel 1 à 4 à partir du FWI (classes EFFIS), ou null. */
export function levelOf(value) {
  if (!isNum(value)) return null;
  if (value < 11.2) return 1;
  if (value < 21.3) return 2;
  if (value < 38) return 3;
  return 4;
}

/**
 * Calcule l’indice de chaque jour à partir de séries horaires (heure de Paris).
 * Retourne une Map « AAAA-MM-JJ » → { fwi }, pour les jours dont les observations de midi existent.
 * Une journée incomplète est ignorée, sans interrompre la série.
 */
export function dailyFwi({ time, temperature_2m, relative_humidity_2m, wind_speed_10m, precipitation }) {
  let F = START.ffmc;
  let D = START.dmc;
  let DC = START.dc;
  const out = new Map();

  for (let i = 0; i < time.length; i += 1) {
    if (!time[i].endsWith('T12:00') || i < 23) continue;
    const date = time[i].slice(0, 10);
    const month = Number(date.slice(5, 7));
    const t = temperature_2m[i];
    const h = relative_humidity_2m[i];
    const w = wind_speed_10m[i];

    let rain = 0;
    for (let k = i - 23; k <= i; k += 1) {
      const p = precipitation[k];
      if (!isNum(p)) { rain = NaN; break; }
      rain += p;
    }
    if (![t, h, w, rain].every(isNum)) continue;

    F = ffmc(F, t, h, w, rain);
    D = dmc(D, t, h, rain, month);
    DC = dc(DC, t, rain, month);
    out.set(date, { fwi: fwi(isi(w, F), bui(D, DC)) });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Lecture de la réponse et calcul par département                            */
/* -------------------------------------------------------------------------- */

/** Calcule les niveaux J+1 et J+2 d’un département à partir de sa réponse Open-Meteo. */
export function departmentForecast(entry, today) {
  if (!entry || entry.error) {
    throw new ScriptError(`Open-Meteo a refusé une localisation : ${entry?.reason ?? 'raison inconnue'}.`);
  }
  const hourly = entry.hourly;
  if (!hourly || !Array.isArray(hourly.time)) {
    throw new ScriptError('Réponse Open-Meteo inattendue : bloc « hourly » absent.');
  }
  const series = dailyFwi(hourly);
  const f1 = series.get(addDays(today, 1))?.fwi ?? null;
  const f2 = series.get(addDays(today, 2))?.fwi ?? null;
  const round = (v) => (isNum(v) ? Math.round(v * 10) / 10 : null);
  return {
    j1: levelOf(f1), j2: levelOf(f2),
    fwi1: round(f1), fwi2: round(f2),
  };
}

/* -------------------------------------------------------------------------- */
/* Appel de l'API                                                             */
/* -------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function validateUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ScriptError('OPEN_METEO_URL n’est pas une URL valide.');
  }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname); // tests locaux
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new ScriptError('OPEN_METEO_URL doit utiliser HTTPS.');
  }
  return url;
}

/** URL de requête pour un lot de localisations (latitudes et longitudes en listes). */
export function buildUrl(base, coords) {
  const url = new URL(base);
  url.searchParams.set('latitude', coords.map((c) => c[0]).join(','));
  url.searchParams.set('longitude', coords.map((c) => c[1]).join(','));
  url.searchParams.set('hourly', HOURLY_VARIABLES);
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('precipitation_unit', 'mm');
  url.searchParams.set('past_days', String(PAST_DAYS));
  url.searchParams.set('forecast_days', String(FORECAST_DAYS));
  url.searchParams.set('timezone', TIMEZONE);
  return url;
}

/** Télécharge le JSON avec délai maximal et nouvelles tentatives (429 / 5xx / réseau). */
async function getJson(url) {
  let lastProblem = 'erreur inconnue';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        lastProblem = `HTTP ${res.status}`;
        if (attempt < MAX_ATTEMPTS) await sleep(attempt * 10_000);
        continue;
      }
      const text = await res.text();
      if (res.status === 400) {
        throw new ScriptError(`Requête refusée par Open-Meteo (HTTP 400) : ${text.slice(0, 200)}`);
      }
      if (!res.ok) throw new ScriptError(`Réponse HTTP inattendue : ${res.status}.`);
      try {
        return JSON.parse(text);
      } catch {
        throw new ScriptError('Réponse Open-Meteo non JSON.');
      }
    } catch (err) {
      if (err instanceof ScriptError) throw err;
      lastProblem = err?.name === 'TimeoutError'
        ? `délai de ${TIMEOUT_MS / 1000} s dépassé`
        : `erreur réseau (${err?.cause?.code ?? err?.name ?? 'inconnue'})`;
      if (attempt < MAX_ATTEMPTS) await sleep(attempt * 5000);
    }
  }
  throw new ScriptError(`Échec après ${MAX_ATTEMPTS} tentatives : ${lastProblem}.`, 2);
}

/* -------------------------------------------------------------------------- */
/* Écriture du fichier                                                        */
/* -------------------------------------------------------------------------- */

function buildPayload({ departments, dataDate }, fileDate) {
  // L'ordre des clés est fixe : la sortie est déterministe et minifiée.
  return {
    schemaVersion: 2,
    fileDate,
    source: 'Open-Meteo.com',
    licence: LICENCE_URL,
    api: API_LABEL,
    method: METHOD_LABEL,
    dataDate,
    departments: departments.map(({ code, name, j1, j2, fwi1, fwi2 }) => ({ code, name, j1, j2, fwi1, fwi2 })),
  };
}

/** Écrit le fichier seulement si le contenu (hors date de génération) a changé. */
async function writeIfChanged(extracted) {
  const next = buildPayload(extracted, null);
  let previous = null;
  try {
    previous = JSON.parse(await readFile(OUTPUT_FILE, 'utf8'));
  } catch {
    // Fichier absent ou illisible : il sera (ré)écrit.
  }
  if (previous && JSON.stringify({ ...previous, fileDate: null }) === JSON.stringify(next)) {
    return false;
  }
  const fileDate = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const tmp = `${OUTPUT_FILE}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ ...next, fileDate })}\n`, 'utf8');
  await rename(tmp, OUTPUT_FILE);
  return true;
}

/* -------------------------------------------------------------------------- */
/* Programme principal                                                        */
/* -------------------------------------------------------------------------- */

export async function main(env = process.env) {
  const url = validateUrl((env.OPEN_METEO_URL ?? '').trim() || DEFAULT_API_URL);
  const today = parisToday();
  const departments = [];

  for (let start = 0; start < DEPARTMENTS.length; start += BATCH_SIZE) {
    const batch = DEPARTMENTS.slice(start, start + BATCH_SIZE);
    console.log(`Prévisions : ${batch[0][0]} à ${batch[batch.length - 1][0]}`);
    const json = await getJson(buildUrl(url, batch.map(([code]) => CHEF_LIEU[code])));
    const entries = Array.isArray(json) ? json : [json];
    if (entries.length !== batch.length) {
      throw new ScriptError(`Réponse inattendue : ${entries.length} localisations au lieu de ${batch.length}.`);
    }
    batch.forEach(([code, name], k) => {
      const forecast = departmentForecast(entries[k], today);
      if (forecast.j1 !== null || forecast.j2 !== null) departments.push({ code, name, ...forecast });
    });
  }

  if (departments.length === 0) {
    throw new ScriptError('Aucun département exploitable dans la réponse Open-Meteo.');
  }
  departments.sort((a, b) => ORDER.get(a.code) - ORDER.get(b.code));

  const changed = await writeIfChanged({ departments, dataDate: today });
  console.log(
    changed
      ? `Fichier mis à jour : ${departments.length} départements, données du ${today}.`
      : 'Données inchangées : fichier conservé.'
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      if (err instanceof ScriptError) {
        console.error(`::error::${err.message}`);
        process.exit(err.exitCode);
      }
      console.error(`::error::Erreur inattendue : ${err?.message ?? err}`);
      process.exit(1);
    }
  );
}
