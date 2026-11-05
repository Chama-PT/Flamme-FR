#!/usr/bin/env node
/**
 * Outil facultatif (déjà exécuté, les pages générées sont dans le dépôt) : écrit les pages HTML statiques.
 * Vous n'avez pas besoin de le lancer pour déployer ni pour la mise à jour quotidienne des données,
 * qui ne touche que data/fwi.json. Il sert seulement si vous modifiez le gabarit des pages.
 *
 * Usage : node tools/generate-pages.mjs          (depuis la racine du dépôt)
 *         SITE_URL=https://exemple.fr/ node tools/generate-pages.mjs
 * Entrées : tools/out/depts.json (noms, régions, préfectures), tools/out/map.json (fond de carte, voisinage).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS, THRESHOLDS } from '../assets/js/lib.js';
import { ADVICE, adviceFor, FACTORS } from '../assets/js/content.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.SITE_URL ?? 'https://flammefr.vercel.app/').replace(/\/?$/, '/');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const write = (p, content) => { const f = resolve(ROOT, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, content, 'utf8'); };

const depts = read('tools/out/depts.json');
const map = read('tools/out/map.json');
const ORDER_KEY = (c) => (c === '2A' ? 19.1 : c === '2B' ? 19.2 : Number(c));
depts.sort((a, b) => ORDER_KEY(a.code) - ORDER_KEY(b.code));
const byCode = new Map(depts.map((d) => [d.code, d]));
const url = (d) => `/departement/${d.slug}/`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fr = (n) => String(n).replace('.', ',');

/* ------------------------------------------------------------------ */
/* Éléments communs                                                     */
/* ------------------------------------------------------------------ */
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";
const CSP_HEADER = `${CSP}; frame-ancestors 'none'`;
const OG_ALT = 'FlammeFR : risque d’incendie de forêt par département en France métropolitaine';

const SPRITE = readFileSync(resolve(ROOT, 'tools/sprite.html'), 'utf8').trim();

const ic = (name, cls = '') => `<svg class="icon${cls ? ` ${cls}` : ''}" aria-hidden="true" focusable="false"><use href="#icon-${name}"/></svg>`;

const NAV = [
  { href: '/', label: 'Accueil', id: 'home' },
  { href: '/#carte', label: 'Carte', id: 'carte' },
  { href: '/#departements', label: 'Départements', id: 'depts' },
  { href: '/methodologie/', label: 'Méthodologie', id: 'methodologie' },
  { href: '/a-propos/', label: 'À propos', id: 'apropos' },
];

function head({ title, description, path, robots = 'index, follow, max-image-preview:large', jsonld = null, scripts = [] }) {
  const canonical = `${SITE}${path.replace(/^\//, '')}`;
  const image = `${SITE}assets/img/og-image.png`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="dark">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="${robots}">
${robots.startsWith('noindex') ? '' : `  <link rel="canonical" href="${canonical}">
  <link rel="alternate" hreflang="fr-FR" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="FlammeFR">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(OG_ALT)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${image}">
`}  <meta name="theme-color" content="#0B0A08">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/assets/img/icon-192.png" type="image/png" sizes="192x192">
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="preload" href="/assets/fonts/InstrumentSerif-Regular.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
${jsonld ? `  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n` : ''}  <link rel="stylesheet" href="/assets/css/styles.css">
  <script type="module" src="/assets/js/site.js"></script>
${scripts.map((s) => `  <script type="module" src="/assets/js/${s}"></script>`).join('\n')}
</head>`;
}

function header(active) {
  const link = (n, mobile) => `<li><a href="${n.href}"${n.id === active ? ' aria-current="page"' : ''}>${esc(n.label)}${mobile ? ic('arrow') : ''}</a></li>`;
  return `  ${SPRITE}
  <a class="skip-link" href="#contenu">Aller au contenu</a>
  <header class="site-header">
    <div class="container site-header__inner">
      <a class="brand" href="/" aria-label="FlammeFR, accueil"><svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 64 64"><use href="#icon-flame"/></svg><span>Flamme<em>FR</em></span></a>
      <nav class="nav" aria-label="Navigation principale">${NAV.map((n) => `<a href="${n.href}"${n.id === active ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('')}</nav>
      <button type="button" class="search-trigger" data-open-search aria-haspopup="dialog" aria-label="Rechercher un département">${ic('search')}<span class="search-trigger__label">Rechercher un département</span><kbd aria-hidden="true">/</kbd></button>
      <a class="btn btn--primary btn--sm header-cta" href="/#carte">Voir la carte nationale ${ic('arrow', 'icon--arrow')}</a>
      <button type="button" class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="mobile-nav" aria-label="Ouvrir le menu">${ic('menu')}</button>
    </div>
    <div class="mobile-nav" id="mobile-nav" hidden>
      <div class="container">
        <ul>${NAV.map((n) => link(n, true)).join('')}</ul>
        <a class="btn btn--primary" href="/#carte">Voir la carte nationale ${ic('arrow', 'icon--arrow')}</a>
      </div>
    </div>
  </header>`;
}

const SUD = ['gironde-33', 'landes-40', 'herault-34', 'gard-30', 'var-83', 'bouches-du-rhone-13', 'alpes-maritimes-06', 'corse-du-sud-2a'];

function footer() {
  const sud = SUD.map((s) => depts.find((d) => d.slug === s)).filter(Boolean);
  return `  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="brand" href="/" aria-label="FlammeFR, accueil"><svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 64 64"><use href="#icon-flame"/></svg><span>Flamme<em>FR</em></span></a>
          <p>Le risque d’incendie de forêt en France métropolitaine, département par département, calculé chaque jour à partir de prévisions météo.</p>
        </div>
        <nav aria-labelledby="f-nav"><h2 id="f-nav">Navigation</h2><ul>${NAV.map((n) => `<li><a href="${n.href}">${esc(n.label === 'Carte' ? 'Carte nationale' : n.label)}</a></li>`).join('')}</ul></nav>
        <nav aria-labelledby="f-sud"><h2 id="f-sud">Sud de la France</h2><ul>${sud.map((d) => `<li><a href="${url(d)}">${esc(d.name)} (${d.code})</a></li>`).join('')}</ul></nav>
        <div><h2>Sources</h2><ul>
          <li><a href="https://open-meteo.com/" rel="noopener noreferrer" target="_blank">Open-Meteo.com<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a></li>
          <li><a href="https://effis.jrc.ec.europa.eu/" rel="noopener noreferrer" target="_blank">EFFIS<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a></li>
          <li><a href="https://vigilance.meteofrance.fr/" rel="noopener noreferrer" target="_blank">Vigilance Météo-France<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a></li>
          <li><a href="/data/fwi.json">Données au format JSON</a></li>
        </ul></div>
        <div><h2>Mentions</h2><ul>
          <li><a href="https://creativecommons.org/licenses/by/4.0/deed.fr" rel="noopener noreferrer" target="_blank">Licence CC BY 4.0<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a></li>
          <li><a href="/a-propos/">Indépendance et vie privée</a></li>
          <li><a href="/methodologie/">Limites de la méthode</a></li>
          <li><a href="https://github.com/Chama-PT/Flamme-FR/" rel="noopener noreferrer" target="_blank">Code source sur GitHub<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a></li>
        </ul></div>
      </div>
      <div class="footer-bottom">
        <p><strong>Données météo : Open-Meteo.com.</strong> Prévisions utilisées pour calculer l’indice FWI, sous <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" rel="noopener noreferrer" target="_blank">licence CC BY 4.0<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>. Le niveau de risque est un calcul de FlammeFR, non un bulletin officiel.</p>
        <p>Dernier calcul : <span data-update>indisponible</span>. Site indépendant, non affilié à Open-Meteo ni à Météo-France. En cas d’urgence : 18 ou 112.</p>
        <p>Contours des départements : IGN (Admin Express), version simplifiée par Grégoire David, sous Licence ouverte. Polices Instrument Serif et Geist, sous licence SIL Open Font.</p>
      </div>
    </div>
  </footer>`;
}

const page = (headHtml, active, body) => `${headHtml}
<body>
${header(active)}
${body}
${footer()}
</body>
</html>
`;

const dayDescription = 'niveau prévu pour demain et après-demain, calculé chaque jour à partir de prévisions météo (indice FWI canadien)';

/* ------------------------------------------------------------------ */
/* Accueil                                                              */
/* ------------------------------------------------------------------ */
const HOME_TITLE = 'Risque incendie de forêt par département | FlammeFR';
const HOME_DESC = 'Risque d’incendie de forêt par département en France métropolitaine : niveau prévu pour demain et après-demain, calculé chaque jour à partir de prévisions météo.';

const FAQ = [
  ['Que signifie le niveau affiché ?', ['FlammeFR affiche, pour chaque département, un niveau de risque d’incendie de forêt pour les prochains jours. Ce niveau repose sur l’indice forêt-météo canadien (FWI), calculé à partir des prévisions météorologiques au chef-lieu du département.']],
  ['Comment lire les quatre niveaux de risque ?', ['L’échelle comporte quatre niveaux : 1 (Faible, FWI inférieur à 11,2), 2 (Modéré, de 11,2 à 21,3), 3 (Élevé, de 21,3 à 38) et 4 (Très élevé, 38 et plus). Plus le niveau est haut, plus les conditions favorisent le départ et la propagation d’un feu de végétation.']],
  ['D’où viennent les données et comment sont-elles calculées ?', ['Les prévisions météorologiques viennent d’<a href="https://open-meteo.com/" rel="noopener noreferrer" target="_blank">Open-Meteo.com<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>, sous licence CC BY 4.0. Chaque jour, FlammeFR en tire l’indice FWI de chaque département. Ce niveau est un calcul du site : il ne s’agit ni d’un bulletin officiel de Météo-France ni d’une consigne des autorités. Aucune donnée personnelle n’est collectée.', 'Le détail du calcul est décrit sur la page <a href="/methodologie/">Méthodologie</a>.']],
  ['À quelle fréquence les données sont-elles mises à jour ?', ['Le calcul est refait chaque jour, tôt le matin (heure de Paris), toute l’année. La date et l’heure du dernier calcul sont affichées en haut de la page d’accueil et dans le pied de page. Si ce calcul date de plusieurs jours, le site vous le signale.']],
  ['Le site fonctionne-t-il toute l’année ?', ['Oui. Le calcul est refait chaque jour, en toute saison. Hors été, les niveaux sont souvent bas, mais un épisode chaud, sec et venteux peut les faire monter à tout moment de l’année.']],
  ['Que faire quand le risque est élevé ou très élevé ?', ['Évitez tout feu, barbecue ou point chaud en forêt et à proximité de la végétation sèche, ne jetez jamais de mégot, et ne stationnez pas sur l’herbe sèche. Renseignez-vous sur les arrêtés de votre préfecture, qui peuvent limiter l’accès aux massifs. En cas de départ de feu, appelez le 18 ou le 112.', 'Pour la vigilance météorologique officielle, consultez <a href="https://vigilance.meteofrance.fr/" rel="noopener noreferrer" target="_blank">vigilance.meteofrance.fr<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>.']],
  ['Pourquoi un seul point de calcul par département ?', ['Le calcul est fait au chef-lieu de chaque département. Un massif éloigné du chef-lieu, ou un département contrasté (par exemple un littoral et un relief), peut donc avoir un niveau réel différent de celui affiché.']],
  ['FlammeFR remplace-t-il les arrêtés préfectoraux ?', ['Non. FlammeFR est un outil d’information. Seuls les arrêtés des préfectures et les consignes des autorités et des sapeurs-pompiers font foi pour les restrictions d’accès aux massifs ou d’usage du feu.']],
];

function homePage() {
  const regions = [...new Set(depts.map((d) => d.region))].sort((a, b) => a.localeCompare(b, 'fr'));
  const mapPaths = depts.map((d) => `<a class="dept" data-code="${d.code}" href="${url(d)}" tabindex="0" aria-label="${esc(d.name)} (${d.code})"><path class="shape" d="${map.depts[d.code].d}"/></a>`).join('\n          ');
  const levelLi = (l) => `<li data-l="${l}">${ic(l)}<span><strong>${l} — ${LEVELS[l].label}</strong><small>${LEVELS[l].range}</small></span><b data-count>—</b></li>`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE}#website`, url: SITE, name: 'FlammeFR', inLanguage: 'fr-FR', description: 'Risque d’incendie de forêt par département en France métropolitaine, calculé à partir de prévisions météo (indice FWI).' },
      {
        '@type': 'Dataset', '@id': `${SITE}#dataset`, url: SITE, inLanguage: 'fr-FR',
        name: 'Niveaux de risque d’incendie de forêt par département',
        description: 'Niveaux de danger d’incendie de forêt (1 Faible à 4 Très élevé), calculés à partir de l’indice forêt-météo (FWI) au chef-lieu de chaque département de France métropolitaine, pour les prochains jours.',
        license: 'https://creativecommons.org/licenses/by/4.0/', citation: 'Open-Meteo.com, prévisions météo (licence CC BY 4.0), https://open-meteo.com/', isBasedOn: 'https://open-meteo.com/',
        spatialCoverage: 'France métropolitaine', creator: { '@type': 'Organization', name: 'FlammeFR', url: SITE },
        distribution: { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}data/fwi.json` },
      },
    ],
  };

  const body = `  <main id="contenu">
    <section class="hero" id="hero" aria-labelledby="titre-principal" data-calm="false">
      <div class="hero__bg" aria-hidden="true">
        <div class="hero__glow"></div>
        <div class="hero__map"><svg viewBox="0 0 ${map.width} ${map.height}" focusable="false"><g id="hero-map-g"></g></svg></div>
        <div class="embers">${'<i></i>'.repeat(12)}</div>
      </div>
      <div class="container">
        <div class="hero__grid">
          <div class="hero__copy">
            <p class="eyebrow eyebrow--ember">Risque d’incendie de forêt · France métropolitaine</p>
            <h1 id="titre-principal" class="display">Comprendre le risque d’incendie, <em>département par département.</em></h1>
            <p class="lead">Niveau de risque, indice forêt-météo (FWI) et prévisions pour les prochains jours dans les 96 départements de France métropolitaine. Recalculé chaque jour, toute l’année, à partir de prévisions météo.</p>
            <div class="hero__actions">
              <a class="btn btn--primary" href="#carte">Explorer la carte ${ic('arrow', 'icon--arrow')}</a>
              <button type="button" class="btn btn--ghost" data-open-search aria-haspopup="dialog">${ic('search')} Rechercher mon département</button>
            </div>
          </div>
          <aside class="nat" aria-labelledby="nat-title">
            <div class="nat__top"><h2 class="eyebrow" id="nat-title">Vigilance nationale</h2><span class="eyebrow" id="nat-day"></span></div>
            <div class="nat__ring" id="nat-ring">
              <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><circle class="track" cx="100" cy="100" r="88"/>${[1, 2, 3, 4].map((l) => `<circle class="seg" data-l="${l}" cx="100" cy="100" r="88"/>`).join('')}</svg>
              <div class="nat__center" id="nat-center" data-l="0" aria-live="polite"><span class="nat__word" id="nat-word"><span class="skeleton sk-word"></span></span><span class="nat__sub" id="nat-sub">Chargement</span></div>
            </div>
            <ul class="nat__rows" id="nat-rows">${[1, 2, 3, 4].map((l) => `<li class="nat__row" data-l="${l}">${ic(l)}<span>${l} — ${LEVELS[l].label}</span><b>—</b></li>`).join('')}</ul>
            <p class="nat__foot" id="nat-foot"><span class="skeleton sk-line"></span></p>
          </aside>
        </div>
        <dl class="meta-strip">
          <div><dt>Dernière mise à jour</dt><dd id="m-update"><span class="skeleton sk-line"></span></dd></div>
          <div><dt>Source des prévisions</dt><dd>Open-Meteo.com</dd></div>
          <div><dt>Départements suivis</dt><dd id="m-count"><span class="skeleton sk-line"></span></dd></div>
          <div><dt>Niveau national</dt><dd id="m-level"><span class="skeleton sk-line"></span></dd></div>
        </dl>
      </div>
    </section>

    <section class="section" id="carte" aria-labelledby="t-carte">
      <div class="container">
        <div class="section__head reveal">
          <p class="eyebrow eyebrow--ember">Carte nationale</p>
          <h2 class="display" id="t-carte">La France, <em>département par département</em></h2>
          <p class="lead">Survolez un département pour lire son niveau, son indice FWI et sa tendance, puis ouvrez sa fiche. Les onglets changent d’échéance.</p>
        </div>
        <div class="map-tools">
          <div id="day-tabs" class="tabs skeleton sk-tabs"></div>
          <div class="view-switch" id="view-switch" role="group" aria-label="Mode d’affichage">
            <button type="button" data-view="map" aria-pressed="true">${ic('map')} Carte</button>
            <button type="button" data-view="list" aria-pressed="false">${ic('list')} Liste</button>
          </div>
        </div>
        <p class="sr-only" id="day-live" role="status" aria-live="polite"></p>
        <div class="map-view">
          <div class="map-layout">
            <div class="map-stage" id="map-stage" data-zoomed="false">
              <div class="map-wrap">
                <svg class="france-map" id="france-map" viewBox="0 0 ${map.width} ${map.height}" role="group" aria-label="Carte des départements de France métropolitaine, colorée selon le niveau de risque. Chaque département est un lien vers sa fiche.">
                  <defs><pattern id="hatch-4" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#E5352B"/><rect width="2" height="7" fill="#0B0A08" fill-opacity="0.4"/></pattern></defs>
                  <g id="map-glow" class="map-glow"></g>
                  <g class="map-layer" id="map-layer">
          ${mapPaths}
                  </g>
                  <g id="map-hatch" class="map-hatch"></g>
                  <path id="map-hl" class="map-hl" d=""/>
                </svg>
              </div>
              <div class="tip" id="tip" aria-hidden="true" data-l="0">
                <div class="tip__head"><span class="tip__name"></span><span class="tip__code"></span></div>
                <div class="tip__badge"></div>
                <p class="eyebrow">Indice FWI</p>
                <p class="tip__fwi num"></p>
                <div class="tip__row"><span>Tendance</span><b class="tip__trend"></b></div>
                <div class="tip__row"><span>Région</span><b class="tip__region"></b></div>
              </div>
            </div>
            <div class="side">
              <div class="card">
                <h3 class="eyebrow">Légende · niveaux de risque</h3>
                <ol class="legend" id="legend">${[1, 2, 3, 4].map(levelLi).join('')}</ol>
                <p class="fine-print">Nombre de départements par niveau, pour l’échéance affichée. Les hachures signalent le niveau 4. Au clavier, parcourez la carte avec la touche Tab.</p>
              </div>
              <div class="card sel" id="sel" data-l="0" aria-live="polite"><p class="eyebrow">Département sélectionné</p><p class="sel__hint">Chargement de la carte…</p></div>
            </div>
          </div>
        </div>
        <div class="list-view" id="list-view" hidden>
          <div class="list-tools"><label class="sr-only" for="list-filter">Filtrer les départements</label><input class="field" id="list-filter" type="search" placeholder="Filtrer par nom, numéro ou région" autocomplete="off"></div>
          <div class="table-scroll">
            <table class="data-table" id="list-table">
              <caption class="sr-only" id="list-caption"></caption>
              <thead><tr>
                <th scope="col"><button type="button" data-sort="code">N°</button> · <button type="button" data-sort="name">Département</button></th>
                <th scope="col"><button type="button" data-sort="level">Niveau</button></th>
                <th scope="col" class="n"><button type="button" data-sort="fwi">Indice FWI</button></th>
                <th scope="col">Évolution J+1 / J+2</th>
              </tr></thead>
              <tbody id="list-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="vigilance" aria-labelledby="t-vig">
      <div class="container">
        <div class="section__head reveal">
          <p class="eyebrow eyebrow--ember">Départements sous vigilance</p>
          <h2 class="display" id="t-vig">Les territoires <em>les plus exposés</em></h2>
        </div>
        <p class="bento-state" id="bento-state" hidden></p>
        <div class="bento" id="bento">
          <div class="skeleton sk-card bcard--hero"></div><div class="skeleton sk-card bcard--wide"></div><div class="skeleton sk-card bcard--wide"></div>
          <div class="skeleton sk-card bcard--std"></div><div class="skeleton sk-card bcard--std"></div><div class="skeleton sk-card bcard--std"></div>
        </div>
        <p class="bento-more reveal"><a class="btn btn--ghost" href="#departements">Voir les 96 départements ${ic('arrow', 'icon--arrow')}</a></p>
      </div>
    </section>

    <section class="section" id="lire" aria-labelledby="t-lire">
      <div class="container">
        <div class="section__head reveal">
          <p class="eyebrow eyebrow--ember">Comment lire le risque ?</p>
          <h2 class="display" id="t-lire">Cinq éléments, <em>un seul indice</em></h2>
          <p class="lead">Le site transforme la météo du moment et l’état de sécheresse en un indice, le FWI. Plus il est élevé, plus un feu démarre et se propage facilement.</p>
        </div>
        <ol class="flow reveal">
          <li><p class="eyebrow">${ic('thermo')} Étape 1</p><h3>La météo à midi</h3><p>Température, humidité de l’air, vent et pluie des dernières 24 heures, prévus au chef-lieu de chaque département.</p></li>
          <li><p class="eyebrow">${ic('drop')} Étape 2</p><h3>La sécheresse accumulée</h3><p>Trois codes (FFMC, DMC et DC) suivent l’humidité des feuilles mortes, de l’humus et du sol profond. Ils tiennent compte des 30 derniers jours.</p></li>
          <li><p class="eyebrow">${ic('wind')} Étape 3</p><h3>Propagation et combustible</h3><p>Deux indices en tirent la vitesse à laquelle un feu se propage (ISI) et la quantité de combustible disponible (BUI).</p></li>
          <li><p class="eyebrow">${ic('gauge')} Étape 4</p><h3>L’indice FWI</h3><p>Les deux se combinent en un chiffre, le FWI, classé en quatre niveaux : de Faible à Très élevé.</p></li>
        </ol>
        <div class="scale reveal">
          <div class="scale__bar" role="img" aria-label="Échelle du FWI : niveau 1 jusqu’à 11,2 ; niveau 2 de 11,2 à 21,3 ; niveau 3 de 21,3 à 38 ; niveau 4 à partir de 38.">${[['1', '0'], ['2', '11,2'], ['3', '21,3'], ['4', '38']].map(([l, v]) => `<span class="scale__seg" data-l="${l}">${v}${l === '4' ? ' et +' : ''}</span>`).join('')}</div>
          <ul class="scale__labels">${[1, 2, 3, 4].map((l) => `<li data-l="${l}"><strong>${l} — ${LEVELS[l].label}</strong>${LEVELS[l].hint}</li>`).join('')}</ul>
        </div>
        <div class="factors">${FACTORS.map((f, i) => `
          <article class="factor reveal"><div class="factor__icon">${ic(f.icon)}</div><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p><p class="mono">${esc(f.tag)}</p></article>`).join('')}
        </div>
      </div>
    </section>

    <section class="section" id="faq" aria-labelledby="t-faq">
      <div class="container faq-grid">
        <div class="section__head reveal">
          <p class="eyebrow eyebrow--ember">FAQ et méthodologie</p>
          <h2 class="display" id="t-faq">Questions <em>fréquentes</em></h2>
          <p class="lead">Origine des données, fréquence de mise à jour, signification des niveaux et bons réflexes. Le détail du calcul est sur la page <a href="/methodologie/">Méthodologie</a>.</p>
        </div>
        <div class="faq reveal">
          ${FAQ.map(([q, a]) => `<details name="faq"><summary>${esc(q)}${ic('plus')}</summary><div class="faq__a">${a.map((p) => `<p>${p}</p>`).join('')}</div></details>`).join('\n          ')}
        </div>
      </div>
    </section>

    <section class="section" id="departements" aria-labelledby="t-depts">
      <div class="container">
        <div class="section__head reveal">
          <p class="eyebrow eyebrow--ember">Index</p>
          <h2 class="display" id="t-depts">Les 96 départements, <em>par région</em></h2>
          <p class="lead">Chaque département a sa fiche : niveau, indice FWI, conditions et conseils de vigilance.</p>
        </div>
        <div class="regions">
          ${regions.map((r) => `<div class="region reveal"><h3>${esc(r)}</h3><ul>${depts.filter((d) => d.region === r).map((d) => `<li><a href="${url(d)}" data-code="${d.code}"><span class="code">${d.code}</span>${esc(d.name)}<span class="dot" aria-hidden="true"></span></a></li>`).join('')}</ul></div>`).join('\n          ')}
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="titre-avertissement">
      <div class="container">
        <aside class="safety reveal" role="note">
          <div>
            <p class="eyebrow eyebrow--ember">Information et sécurité</p>
            <h2 id="titre-avertissement">En cas d’urgence, appelez le 18 ou le 112.</h2>
            <p>FlammeFR est un outil d’information. Il ne remplace ni les consignes des autorités (préfectures, mairies, sapeurs-pompiers) ni les arrêtés locaux de restriction d’accès aux massifs ou d’usage du feu. Le 18 joint les sapeurs-pompiers ; le 112 est le numéro d’urgence européen.</p>
          </div>
          <div class="safety__calls"><b>18</b><span>Sapeurs-pompiers</span><b>112</b><span>Urgence européenne</span></div>
        </aside>
      </div>
    </section>

    <section class="section" aria-labelledby="titre-sources">
      <div class="container">
        <h2 class="h-sm" id="titre-sources">Sources et méthode</h2>
        <ul class="sources">
          <li>Prévisions météo : <a href="https://open-meteo.com/" rel="noopener noreferrer" target="_blank">Open-Meteo.com<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>, sous licence CC BY 4.0.</li>
          <li>Indice forêt-météo (FWI) : Van Wagner, C.E. (1987), <em>Development and structure of the Canadian Forest Fire Weather Index System</em>, Forestry Technical Report 35, Canadian Forestry Service.</li>
          <li>Classes de niveau : système européen d’information sur les feux de forêt, <a href="https://effis.jrc.ec.europa.eu/" rel="noopener noreferrer" target="_blank">EFFIS<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>.</li>
        </ul>
      </div>
    </section>
    <noscript><div class="container"><p class="notice notice--error">Ce site a besoin de JavaScript pour afficher les niveaux de risque. Activez-le dans votre navigateur, puis rechargez la page. Les fiches de chaque département restent accessibles depuis l’index ci-dessus.</p></div></noscript>
  </main>`;
  return page(head({ title: HOME_TITLE, description: HOME_DESC, path: '/', jsonld, scripts: ['home.js'] }), 'home', body);
}

/* ------------------------------------------------------------------ */
/* Pages département                                                    */
/* ------------------------------------------------------------------ */
function deptPage(d) {
  const info = map.depts[d.code];
  const title = `Risque d’incendie de forêt : ${d.name} (${d.code}) | FlammeFR`;
  const description = `Risque d’incendie de forêt, ${d.name} (${d.code}) : ${dayDescription}.`;
  const neighbors = info.neighbors.map((c) => byCode.get(c)).filter(Boolean);
  const sameRegion = depts.filter((x) => x.region === d.region && x.code !== d.code);
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `${SITE}departement/${d.slug}/#page`, url: `${SITE}departement/${d.slug}/`, name: title, description, inLanguage: 'fr-FR', isPartOf: { '@id': `${SITE}#website` } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE },
        { '@type': 'ListItem', position: 2, name: `${d.name} (${d.code})`, item: `${SITE}departement/${d.slug}/` },
      ] },
    ],
  };
  const adviceItems = (l) => adviceFor(l, d.prefecture).map((t) => `<li>${esc(t)}</li>`).join('');
  const body = `  <main id="contenu">
    <div class="container">
      <nav class="crumbs" aria-label="Fil d’Ariane"><ol><li><a href="/">Accueil</a></li><li aria-current="page">${esc(d.name)} (${d.code})</li></ol></nav>
      <div id="dept-root" data-code="${d.code}" data-pref="${esc(d.prefecture)}">
        <header class="dhead">
          <h1 id="titre-principal"><span class="dhead__kicker">Risque d’incendie de forêt&nbsp;:</span>${esc(d.name)} <span class="dhead__code"><span class="sr-only">(</span>${d.code}<span class="sr-only">)</span></span></h1>
          <div class="dhead__meta"><span>${ic('pin')} ${esc(d.region)}</span><span>${ic('building')} Préfecture : ${esc(d.prefecture)}</span><span id="dept-badge"></span></div>
          <p class="lead">Département ${esc(d.name)} (${d.code}), région ${esc(d.region)}, préfecture : ${esc(d.prefecture)}. Niveau de risque d’incendie de forêt prévu pour les prochains jours, calculé à partir de prévisions météo (indice FWI).</p>
        </header>

        <section class="now" aria-labelledby="t-now">
          <h2 class="sr-only" id="t-now">Niveau de risque par échéance</h2>
          <div id="dtabs" class="tabs skeleton sk-tabs"></div>
          <div class="now__panel skeleton sk-now" id="now-panel" data-l="0" aria-live="polite"></div>
          <p class="fine-print">Dernier calcul : <span data-update>indisponible</span>. Niveaux recalculés chaque jour, toute l’année, au chef-lieu (${esc(d.prefecture)}).</p>
        </section>

        <div class="stack section">
          <section class="card chart-card" id="chart-card" aria-labelledby="t-chart">
            <div><p class="eyebrow">Évolution de l’indice</p><h2 id="t-chart">Indice FWI par échéance</h2></div>
            <figure class="chart"><div id="chart"><span class="skeleton sk-chart"></span></div><figcaption class="fine-print">Les bandes colorées correspondent aux quatre niveaux. Seuils : ${THRESHOLDS.map(fr).join(' ; ')}.</figcaption></figure>
            <table class="sr-only" id="chart-table"></table>
          </section>

          <section class="card" id="conditions" aria-labelledby="cond-title" hidden>
            <p class="eyebrow">Météo et sécheresse</p>
            <h2 id="cond-title">Conditions</h2>
            <div class="cond" id="cond-grid"></div>
            <p class="fine-print">Valeurs calculées à midi (heure de Paris), au chef-lieu, à partir des prévisions Open-Meteo.</p>
          </section>

          <div class="two-col">
            <section class="card card--lv" id="meaning" data-l="0" aria-labelledby="t-meaning">
              <h2 id="t-meaning">Ce que cela signifie</h2>
              <div class="prose" id="meaning-body"><p>${LEVELS[3].hint} Le niveau exact et l’indice FWI de ${esc(d.name)} s’affichent dès que les données sont chargées.</p></div>
            </section>
            <section class="card card--lv" id="advice" data-l="0" aria-labelledby="advice-title">
              <h2 id="advice-title">Que faire en cas de risque élevé ?</h2>
              <ul class="advice" id="advice-list">${adviceItems(3)}</ul>
              <details class="levels-fold" id="levels-fold"><summary>Conseils pour chaque niveau</summary>
                <dl>${[1, 2, 3, 4].map((l) => `<div data-level="${l}"><dt><span class="badge badge--sm" data-l="${l}">${ic(l)}<span>${l} — ${LEVELS[l].label}</span></span></dt><dd><ul class="advice">${adviceItems(l)}</ul></dd></div>`).join('')}</dl>
              </details>
            </section>
          </div>

          <section aria-labelledby="t-nb">
            <h2 class="h-sm" id="t-nb">Départements limitrophes</h2>
            <div class="neighbors">${neighbors.map((n) => `<a href="${url(n)}" data-code="${n.code}"><span class="code">${n.code}</span><span class="name">${esc(n.name)}</span><span class="slot"></span></a>`).join('')}</div>
          </section>

          ${sameRegion.length ? `<section aria-labelledby="t-region">
            <h2 class="h-sm" id="t-region">Autres départements : ${esc(d.region)}</h2>
            <div class="chips">${sameRegion.map((n) => `<a href="${url(n)}">${esc(n.name)} (${n.code})</a>`).join('')}<a href="/#departements">Tous les départements</a></div>
          </section>` : ''}

          <aside class="card" role="note" aria-labelledby="titre-avertissement">
            <h2 id="titre-avertissement">Information et sécurité</h2>
            <p class="prose">FlammeFR est un outil d’information. Il ne remplace ni les consignes des autorités (préfectures, mairies, sapeurs-pompiers) ni les arrêtés locaux. <strong>En cas d’urgence, appelez le 18 ou le 112.</strong></p>
          </aside>
        </div>
      </div>
    </div>
  </main>`;
  return page(head({ title, description, path: url(d), jsonld, scripts: ['dept.js'] }), 'depts', body);
}

/* ------------------------------------------------------------------ */
/* Méthodologie et à propos                                             */
/* ------------------------------------------------------------------ */
function methodPage() {
  const title = 'Méthodologie : comment est calculé le risque d’incendie | FlammeFR';
  const description = 'Indice forêt-météo (FWI), données Open-Meteo, niveaux de risque et limites de la méthode utilisée par FlammeFR pour estimer le risque d’incendie de forêt par département.';
  const body = `  <main id="contenu">
    <div class="container">
      <nav class="crumbs" aria-label="Fil d’Ariane"><ol><li><a href="/">Accueil</a></li><li aria-current="page">Méthodologie</li></ol></nav>
      <div class="page-head">
        <p class="eyebrow eyebrow--ember">Méthodologie</p>
        <h1 class="display">Comment est calculé <em>le risque</em></h1>
        <p class="lead">FlammeFR ne reprend pas un bulletin officiel : le site calcule lui-même un indice reconnu, à partir de prévisions météo publiques. Voici les étapes, les seuils et les limites.</p>
      </div>
      <div class="stack section">
        <div class="prose">
          <h2>Le principe</h2>
          <p>Pour chaque département de France métropolitaine, FlammeFR calcule l’<strong>indice forêt-météo canadien (FWI)</strong>, selon les équations de Van Wagner (1987). Le calcul est refait chaque jour, toute l’année, au chef-lieu du département.</p>
          <h2>Les données d’entrée</h2>
          <ul>
            <li><strong>Température, humidité relative, vent à 10 m et pluie</strong>, en valeurs horaires, fournis par Open-Meteo.com pour le chef-lieu de chaque département.</li>
            <li><strong>Heure de calcul : 12 h, heure de Paris.</strong> La pluie est cumulée sur les 24 heures précédentes.</li>
            <li><strong>Amorçage :</strong> la série est calculée sur les 30 derniers jours, puis sur aujourd’hui, demain et après-demain. Les périodes sèches ou humides récentes sont ainsi prises en compte.</li>
          </ul>
          <h2>Du calcul au niveau</h2>
          <ul>
            <li><strong>FFMC</strong> : humidité des combustibles fins (feuilles et brindilles mortes). Elle réagit en quelques heures.</li>
            <li><strong>DMC</strong> : humidité de la couche d’humus, qui évolue sur quelques jours à quelques semaines.</li>
            <li><strong>DC</strong> : sécheresse des couches profondes, qui évolue sur plusieurs semaines.</li>
            <li><strong>ISI</strong> (vitesse de propagation) combine le FFMC et le vent. <strong>BUI</strong> (quantité de combustible disponible) combine le DMC et le DC.</li>
            <li><strong>FWI</strong> combine l’ISI et le BUI. Plus il est élevé, plus un feu démarre et se propage facilement.</li>
          </ul>
        </div>
        <div>
          <h2 class="h-sm">Les quatre niveaux</h2>
          <div class="table-scroll"><table class="lvtable">
            <thead><tr><th scope="col">Niveau</th><th scope="col">Indice FWI</th><th scope="col">Signification</th></tr></thead>
            <tbody>${[1, 2, 3, 4].map((l) => `<tr data-l="${l}"><td><span class="badge" data-l="${l}">${ic(l)}<span>${l} — ${LEVELS[l].label}</span></span></td><td class="mono">${LEVELS[l].range.replace('FWI ', '')}</td><td>${esc(LEVELS[l].hint)}</td></tr>`).join('')}</tbody>
          </table></div>
          <p class="fine-print">Les niveaux suivent les classes du FWI utilisées par le système européen d’information sur les feux de forêt (EFFIS). Ils concernent uniquement la France métropolitaine.</p>
        </div>
        <div class="prose">
          <h2>Limites à connaître</h2>
          <ul>
            <li><strong>Ce n’est pas une prévision officielle.</strong> Les niveaux ne proviennent pas de la Météo des forêts de Météo-France : ils sont calculés par le site.</li>
            <li><strong>Un point par département.</strong> Le calcul est fait au chef-lieu. Un massif éloigné du chef-lieu, ou un département contrasté (par exemple un littoral et un relief), peut avoir un niveau réel différent.</li>
            <li><strong>Un outil d’information.</strong> Seuls les arrêtés des préfectures et les consignes des autorités et des sapeurs-pompiers font foi. En cas d’urgence : 18 ou 112.</li>
          </ul>
          <h2>Sources et licences</h2>
          <ul>
            <li>Prévisions météo : <a href="https://open-meteo.com/" rel="noopener noreferrer" target="_blank">Open-Meteo.com<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>, sous <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" rel="noopener noreferrer" target="_blank">licence CC BY 4.0<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>.</li>
            <li>Van Wagner, C.E. (1987), <em>Development and structure of the Canadian Forest Fire Weather Index System</em>, Forestry Technical Report 35, Canadian Forestry Service.</li>
            <li>Classes de niveau : <a href="https://effis.jrc.ec.europa.eu/" rel="noopener noreferrer" target="_blank">EFFIS<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>.</li>
            <li>Les niveaux publiés sont téléchargeables au format JSON : <a href="/data/fwi.json">/data/fwi.json</a>.</li>
          </ul>
          <p>Retrouvez les niveaux du jour sur <a href="/#carte">la carte nationale</a>.</p>
        </div>
      </div>
    </div>
  </main>`;
  return page(head({ title, description, path: '/methodologie/' }), 'methodologie', body);
}

function aboutPage() {
  const title = 'À propos de FlammeFR | FlammeFR';
  const description = 'FlammeFR est un site indépendant qui publie le niveau de risque d’incendie de forêt de chaque département de France métropolitaine. Données, licences et vie privée.';
  const body = `  <main id="contenu">
    <div class="container">
      <nav class="crumbs" aria-label="Fil d’Ariane"><ol><li><a href="/">Accueil</a></li><li aria-current="page">À propos</li></ol></nav>
      <div class="page-head">
        <p class="eyebrow eyebrow--ember">À propos</p>
        <h1 class="display">Un site <em>indépendant</em>, au service de la vigilance</h1>
        <p class="lead">FlammeFR publie, chaque jour, le niveau de risque d’incendie de forêt de chaque département de France métropolitaine.</p>
      </div>
      <div class="stack section">
        <div class="prose">
          <h2>Ce que fait le site</h2>
          <p>Il calcule l’indice forêt-météo (FWI) à partir de prévisions météo et le traduit en quatre niveaux, de Faible à Très élevé, pour les prochains jours. Il est disponible toute l’année. Le détail du calcul est sur la page <a href="/methodologie/">Méthodologie</a>.</p>
          <h2>Ce que le site n’est pas</h2>
          <p>FlammeFR n’est ni un bulletin officiel, ni un service de Météo-France, ni une consigne des autorités. Il ne remplace pas les arrêtés des préfectures. Il est indépendant et n’est affilié ni à Open-Meteo ni à Météo-France. <strong>En cas d’urgence, appelez le 18 ou le 112.</strong></p>
          <h2>Données et licences</h2>
          <ul>
            <li>Les prévisions météo viennent d’<a href="https://open-meteo.com/" rel="noopener noreferrer" target="_blank">Open-Meteo.com<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>, sous <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" rel="noopener noreferrer" target="_blank">licence CC BY 4.0<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>.</li>
            <li>Les contours des départements viennent de l’IGN (Admin Express), dans une version simplifiée par Grégoire David, sous Licence ouverte.</li>
            <li>Le code du site est distribué sous licence MIT. Cette licence ne s’applique pas aux données d’Open-Meteo.</li>
            <li>Polices Instrument Serif et Geist, sous licence SIL Open Font.</li>
          </ul>
          <h2>Vie privée</h2>
          <p>Aucune donnée personnelle n’est collectée par le site. Les données météo sont chargées depuis le site lui-même : votre navigateur n’appelle aucun service tiers.</p>
          <h2>Code source</h2>
          <p>Le code est public : <a href="https://github.com/Chama-PT/Flamme-FR/" rel="noopener noreferrer" target="_blank">Code source sur GitHub<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>.</p>
        </div>
      </div>
    </div>
  </main>`;
  return page(head({ title, description, path: '/a-propos/' }), 'apropos', body);
}

function notFoundPage() {
  const body = `  <main id="contenu">
    <div class="container nf">
      <p class="num" aria-hidden="true">404</p>
      <h1 class="display">Page <em>introuvable</em></h1>
      <p class="lead">Cette page n’existe pas ou a été déplacée.</p>
      <a class="btn btn--primary" href="/">Retourner à l’accueil de FlammeFR ${ic('arrow', 'icon--arrow')}</a>
    </div>
  </main>`;
  return page(head({ title: 'Page introuvable | FlammeFR', description: 'Cette page n’existe pas ou a été déplacée.', path: '/404.html', robots: 'noindex' }), '', body);
}

/* ------------------------------------------------------------------ */
/* Écriture                                                             */
/* ------------------------------------------------------------------ */
write('index.html', homePage());
for (const d of depts) write(`departement/${d.slug}/index.html`, deptPage(d));
write('methodologie/index.html', methodPage());
write('a-propos/index.html', aboutPage());
write('404.html', notFoundPage());

write('assets/data/departements.json', `${JSON.stringify(depts.map(({ code, name, slug, region, prefecture }) => ({ code, name, slug, region, prefecture })))}\n`);

const urls = [SITE, ...depts.map((d) => `${SITE}departement/${d.slug}/`), `${SITE}methodologie/`, `${SITE}a-propos/`];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
write('manifest.webmanifest', `${JSON.stringify({
  name: 'FlammeFR — Risque d’incendie de forêt', short_name: 'FlammeFR', lang: 'fr-FR', start_url: '/', scope: '/', display: 'standalone',
  background_color: '#0B0A08', theme_color: '#0B0A08',
  icons: [
    { src: '/assets/img/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/assets/img/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/assets/img/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2)}\n`);
write('vercel.json', `${JSON.stringify({
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: null, buildCommand: null, installCommand: null, outputDirectory: '.', trailingSlash: true,
  headers: [
    { source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: CSP_HEADER },
    ] },
    { source: '/assets/fonts/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/sitemap.xml', headers: [{ key: 'Content-Type', value: 'application/xml; charset=utf-8' }] },
    { source: '/robots.txt', headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }] },
  ],
}, null, 2)}\n`);
console.log(`Pages générées : accueil, ${depts.length} départements, méthodologie, à propos, 404 (site : ${SITE}).`);
