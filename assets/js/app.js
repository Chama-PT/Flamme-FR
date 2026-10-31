/* FlammeFR — interface. JavaScript natif, sans dépendance.
 * Toutes les données affichées sont insérées via textContent (jamais innerHTML). */
(() => {
  'use strict';

  const DATA_URL = './data/fwi.json';
  const STALE_AFTER_DAYS = 4;
  const MAX_SUGGESTIONS = 8;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const LEVELS = {
    1: { label: 'Faible', hint: 'Conditions peu favorables aux départs de feu de végétation.' },
    2: { label: 'Modéré', hint: 'Prudence : un départ de feu reste possible. Respectez les consignes locales.' },
    3: { label: 'Élevé', hint: 'Conditions favorables aux incendies. Évitez tout usage du feu en forêt ou à proximité.' },
    4: { label: 'Très élevé', hint: 'Risque maximal. Renseignez-vous auprès de la préfecture sur d’éventuelles restrictions d’accès aux massifs.' },
  };

  const $ = (id) => document.getElementById(id);
  const dom = {
    form: $('search-form'),
    input: $('search'),
    submit: $('search-form').querySelector('button[type="submit"]'),
    list: $('suggestions'),
    live: $('suggestion-status'),
    status: $('status'),
    result: $('result'),
    lastUpdate: $('last-update'),
    footerUpdate: $('footer-update'),
    summary: $('synthese'),
    summaryBody: $('summary-body'),
    allBody: $('all-body'),
  };

  const state = { index: [], suggestions: [], active: -1, loadFailed: false };

  /* ------------------------------------------------------------------ */
  /* Utilitaires                                                         */
  /* ------------------------------------------------------------------ */

  /** Minuscules, sans accents, ponctuation remplacée par des espaces. */
  const fold = (value) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  function el(tag, props = {}, ...children) {
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

  function icon(level) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#icon-${LEVELS[level] ? level : 0}`);
    svg.append(use);
    return svg;
  }

  /** Pastille « icône + niveau + libellé » ; la couleur ne porte jamais seule l’information. */
  function badge(level, size = '') {
    const known = Boolean(LEVELS[level]);
    const text = known ? `${level} — ${LEVELS[level].label}` : 'Non disponible';
    return el(
      'span',
      { class: `badge badge--${known ? level : 0}${size ? ` badge--${size}` : ''}` },
      icon(level),
      text
    );
  }

  /** « 28 octobre 2026 à 17 h 32 », en heure de Paris. */
  function formatDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('day')} ${get('month')} ${get('year')} à ${get('hour')} h ${get('minute')}`;
  }

  /* ------------------------------------------------------------------ */
  /* Chargement et validation des données                                */
  /* ------------------------------------------------------------------ */

  class DataError extends Error {}

  const isLevel = (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 4);

  async function loadData() {
    let response;
    try {
      response = await fetch(DATA_URL, { cache: 'no-cache' });
    } catch {
      throw new DataError(
        navigator.onLine === false
          ? 'Vous semblez hors connexion. Vérifiez votre connexion internet, puis rechargez la page.'
          : 'Les données sont momentanément injoignables. Réessayez dans quelques instants.'
      );
    }
    if (!response.ok) {
      throw new DataError(`Le fichier de données est indisponible (erreur ${response.status}). Réessayez plus tard.`);
    }
    let json;
    try {
      json = await response.json();
    } catch {
      throw new DataError('Le fichier de données est corrompu. Réessayez plus tard.');
    }
    if (!json || typeof json !== 'object' || !Array.isArray(json.departments)) {
      throw new DataError('Le fichier de données n’a pas le format attendu.');
    }
    const departments = json.departments.filter(
      (d) => d && typeof d.code === 'string' && typeof d.name === 'string' && isLevel(d.j1 ?? null) && isLevel(d.j2 ?? null)
    );
    return { fileDate: typeof json.fileDate === 'string' ? json.fileDate : null, departments };
  }

  /* ------------------------------------------------------------------ */
  /* Recherche                                                           */
  /* ------------------------------------------------------------------ */

  function buildIndex(departments) {
    return departments.map((d, order) => {
      const nameKey = fold(d.name);
      return { ...d, j1: d.j1 ?? null, j2: d.j2 ?? null, order, nameKey, words: nameKey.split(' ') };
    });
  }

  /** Retourne les départements correspondant à la saisie, triés par pertinence. */
  function search(raw) {
    const q = fold(raw)
      .replace(/^(departement|dept|dep|numero|num|no|n)\s+(?=\S)/, '')
      .replace(/^(departement|dept|dep)(?=\d)/, '');
    if (!q) return [];

    if (/^(\d{1,3}|2 ?[ab])$/.test(q)) {
      const code = q.replace(/\s/g, '').toUpperCase();
      const digits = code.replace(/^0+/, '');
      const exact = digits.padStart(2, '0');
      const scored = [];
      for (const d of state.index) {
        const isExact = d.code === exact || (digits === '20' && (d.code === '2A' || d.code === '2B'));
        if (isExact || (digits && d.code.startsWith(digits)) || d.code === code) {
          scored.push({ d, score: isExact || d.code === code ? 0 : 1 });
        }
      }
      return scored.sort((a, b) => a.score - b.score || a.d.order - b.d.order).map((s) => s.d);
    }

    const tokens = q.split(' ');
    const scored = [];
    for (const d of state.index) {
      let score = null;
      if (d.nameKey.startsWith(q)) score = 0;
      else if (tokens.every((t) => d.words.some((w) => w.startsWith(t)))) score = 1;
      else if (d.nameKey.includes(q)) score = 2;
      if (score !== null) scored.push({ d, score });
    }
    return scored.sort((a, b) => a.score - b.score || a.d.order - b.d.order).map((s) => s.d);
  }

  /* ------------------------------------------------------------------ */
  /* Suggestions (motif ARIA « combobox » avec liste)                     */
  /* ------------------------------------------------------------------ */

  function openList(open) {
    dom.list.hidden = !open;
    dom.input.setAttribute('aria-expanded', String(open));
    if (!open) {
      dom.input.removeAttribute('aria-activedescendant');
      state.active = -1;
    }
  }

  function setActive(index) {
    const items = dom.list.children;
    if (!items.length) return;
    state.active = (index + items.length) % items.length;
    [...items].forEach((li, i) => li.setAttribute('aria-selected', String(i === state.active)));
    const current = items[state.active];
    dom.input.setAttribute('aria-activedescendant', current.id);
    current.scrollIntoView({ block: 'nearest' });
  }

  function renderSuggestions() {
    const query = dom.input.value;
    state.suggestions = query.trim() ? search(query).slice(0, MAX_SUGGESTIONS) : [];
    dom.list.replaceChildren(
      ...state.suggestions.map((d, i) => {
        const li = el(
          'li',
          { id: `suggestion-${i}`, role: 'option', 'aria-selected': 'false' },
          el('span', { class: 'code', text: d.code }),
          el('span', { text: d.name })
        );
        // mousedown plutôt que click : évite la perte de focus avant la sélection.
        li.addEventListener('mousedown', (event) => {
          event.preventDefault();
          choose(d);
        });
        return li;
      })
    );
    const count = state.suggestions.length;
    openList(count > 0);
    if (count > 0) setActive(0);
    dom.live.textContent = !query.trim()
      ? ''
      : count > 0
        ? `${count} suggestion${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}.`
        : 'Aucun département ne correspond à votre saisie.';
  }

  /* ------------------------------------------------------------------ */
  /* Affichage des résultats                                              */
  /* ------------------------------------------------------------------ */

  function forecastCard(title, level, value) {
    return el(
      'section',
      { class: 'forecast' },
      el('div', { class: 'forecast__head' }, el('h4', { text: title })),
      el(
        'div',
        { class: 'forecast__body' },
        badge(level, 'lg'),
        ...(Number.isFinite(value) ? [el('p', { class: 'forecast__fwi', text: `Indice FWI : ${value.toFixed(1).replace('.', ',')}` })] : []),
        el('p', { class: 'forecast__hint', text: LEVELS[level]?.hint ?? 'Aucune prévision publiée pour cette échéance.' })
      )
    );
  }

  function showDepartment(d) {
    dom.result.replaceChildren(
      el(
        'article',
        { class: 'result' },
        el('h3', { class: 'result__title' }, el('span', { text: d.name }), el('span', { class: 'result__code', text: `(département ${d.code})` })),
        el('div', { class: 'result__grid' }, forecastCard('Demain (J+1)', d.j1, d.fwi1), forecastCard('Après-demain (J+2)', d.j2, d.fwi2))
      )
    );
    try {
      history.replaceState(null, '', `#${d.code}`);
    } catch {
      /* Navigation restreinte (ex. fichier local) : sans conséquence. */
    }
  }

  function showMessage(text) {
    dom.result.replaceChildren(el('p', { class: 'notice', text }));
  }

  function choose(d) {
    dom.input.value = `${d.code} — ${d.name}`;
    openList(false);
    dom.live.textContent = '';
    showDepartment(d);
  }

  function submitSearch() {
    const query = dom.input.value.trim();
    if (!query) {
      showMessage('Saisissez un numéro ou un nom de département pour afficher son niveau de risque.');
      return;
    }
    const matches = state.suggestions.length ? state.suggestions : search(query);
    const picked = state.active >= 0 ? state.suggestions[state.active] : matches[0];
    if (picked) choose(picked);
    else showMessage(`Aucun département ne correspond à « ${query} ». Essayez un numéro (33) ou un nom (Gironde).`);
  }

  function renderOverview() {
    const counts = { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] };
    for (const d of state.index) {
      if (counts[d.j1]) counts[d.j1][0] += 1;
      if (counts[d.j2]) counts[d.j2][1] += 1;
    }
    dom.summaryBody.replaceChildren(
      ...[1, 2, 3, 4].map((n) =>
        el(
          'tr',
          {},
          el('th', { scope: 'row' }, badge(n, 'sm')),
          el('td', { class: 'num', text: String(counts[n][0]) }),
          el('td', { class: 'num', text: String(counts[n][1]) })
        )
      )
    );
    dom.allBody.replaceChildren(
      ...state.index.map((d) =>
        el(
          'tr',
          {},
          el('th', { scope: 'row', text: `${d.code} — ${d.name}` }),
          el('td', {}, badge(d.j1, 'sm')),
          el('td', {}, badge(d.j2, 'sm'))
        )
      )
    );
    dom.summary.hidden = false;
  }

  /* ------------------------------------------------------------------ */
  /* Messages d'état et dates                                             */
  /* ------------------------------------------------------------------ */

  function showStatus(text, isError = false) {
    dom.status.textContent = text;
    dom.status.className = `notice${isError ? ' notice--error' : ''}`;
    dom.status.hidden = false;
  }

  function renderDates(fileDate) {
    const formatted = fileDate ? formatDateTime(fileDate) : null;
    dom.lastUpdate.textContent = formatted ? `Dernier calcul : ${formatted}` : 'Dernier calcul : indisponible';
    dom.footerUpdate.textContent = '';
    dom.footerUpdate.append('Dernier calcul : ');
    if (formatted) dom.footerUpdate.append(el('time', { datetime: fileDate, text: formatted }));
    else dom.footerUpdate.append('indisponible');
    dom.footerUpdate.append('.');
  }

  function isStale(fileDate) {
    const age = Date.now() - new Date(fileDate).getTime();
    return Number.isFinite(age) && age > STALE_AFTER_DAYS * 86_400_000;
  }

  function showFromHash() {
    const code = decodeURIComponent(location.hash.slice(1)).toUpperCase();
    const found = code && state.index.find((d) => d.code === code);
    if (found) {
      dom.input.value = `${found.code} — ${found.name}`;
      showDepartment(found);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Initialisation                                                       */
  /* ------------------------------------------------------------------ */

  function bindEvents() {
    dom.input.addEventListener('input', renderSuggestions);
    dom.input.addEventListener('blur', () => openList(false));
    dom.input.addEventListener('keydown', (event) => {
      const open = !dom.list.hidden;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (!open) renderSuggestions();
          else setActive(state.active + 1);
          break;
        case 'ArrowUp':
          if (open) { event.preventDefault(); setActive(state.active - 1); }
          break;
        case 'Home':
          if (open) { event.preventDefault(); setActive(0); }
          break;
        case 'End':
          if (open) { event.preventDefault(); setActive(state.suggestions.length - 1); }
          break;
        case 'Escape':
          if (open) { event.preventDefault(); openList(false); }
          else dom.input.value = '';
          break;
        default:
      }
    });
    dom.form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitSearch();
    });
    window.addEventListener('hashchange', showFromHash);
    window.addEventListener('online', () => state.loadFailed && location.reload());
  }

  async function init() {
    bindEvents();
    try {
      const { fileDate, departments } = await loadData();
      state.index = buildIndex(departments);
      renderDates(fileDate);

      if (state.index.length === 0) {
        showStatus(
          'Aucune donnée n’est disponible pour le moment. Les niveaux sont recalculés chaque jour : réessayez plus tard.'
        );
        return;
      }
      dom.input.disabled = false;
      dom.submit.disabled = false;
      renderOverview();
      showFromHash();
      if (fileDate && isStale(fileDate)) {
        showStatus(
          'Ce calcul date de plusieurs jours : il n’est probablement plus d’actualité.'
        );
      }
    } catch (error) {
      state.loadFailed = true;
      renderDates(null);
      showStatus(error instanceof DataError ? error.message : 'Une erreur inattendue est survenue. Rechargez la page.', true);
    }
  }

  init();
})();
