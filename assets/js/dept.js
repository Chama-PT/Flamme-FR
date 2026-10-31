/* FlammeFR — pages départements : affiche le niveau du jour (J+1, J+2) depuis data/fwi.json. */
(() => {
  'use strict';

  const DATA_URL = '../../data/fwi.json';
  const STALE_AFTER_DAYS = 4;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const LEVELS = {
    1: { label: 'Faible', hint: 'Conditions peu favorables aux départs de feu de végétation.' },
    2: { label: 'Modéré', hint: 'Prudence : un départ de feu reste possible. Respectez les consignes locales.' },
    3: { label: 'Élevé', hint: 'Conditions favorables aux incendies. Évitez tout usage du feu en forêt ou à proximité.' },
    4: { label: 'Très élevé', hint: 'Risque maximal. Renseignez-vous auprès de la préfecture sur d’éventuelles restrictions d’accès aux massifs.' },
  };

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
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#icon-${LEVELS[level] ? level : 0}`);
    svg.append(use);
    return svg;
  }

  function badge(level, size) {
    const known = Boolean(LEVELS[level]);
    const text = known ? `${level} — ${LEVELS[level].label}` : 'Non disponible';
    return el('span', { class: `badge badge--${known ? level : 0}${size ? ` badge--${size}` : ''}` }, icon(level), text);
  }

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

  function formatDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  }

  /** Code du département d’après l’adresse : …/gironde-33/ → 33, …/corse-du-sud-2a/ → 2A. */
  function codeFromPath() {
    const slug = location.pathname.replace(/\/+$/, '').split('/').pop() || '';
    const match = slug.match(/-(\d{2}|2[ab])$/i);
    return match ? match[1].toUpperCase() : null;
  }

  function setNotice(notice, text) {
    notice.textContent = text;
    notice.hidden = false;
  }

  async function init() {
    const notice = document.querySelector('main section.panel p.notice');
    const code = codeFromPath();
    if (!notice || !code) return;

    let json;
    try {
      const response = await fetch(new URL(DATA_URL, location.href), { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      json = await response.json();
    } catch {
      setNotice(notice, 'Les niveaux n’ont pas pu être chargés. Rechargez la page dans quelques instants.');
      return;
    }

    const department = Array.isArray(json.departments) ? json.departments.find((d) => d.code === code) : null;
    if (!department) {
      setNotice(notice, 'Aucune donnée n’est disponible pour le moment. Les niveaux sont recalculés chaque jour : réessayez plus tard.');
      return;
    }

    const children = [
      el(
        'div',
        { class: 'result__grid' },
        forecastCard('Demain (J+1)', department.j1, department.fwi1),
        forecastCard('Après-demain (J+2)', department.j2, department.fwi2)
      ),
    ];

    const formatted = json.fileDate ? formatDateTime(json.fileDate) : null;
    if (formatted) {
      children.push(el('p', { class: 'help' }, 'Dernier calcul : ', el('time', { datetime: json.fileDate, text: formatted })));
    }
    const age = json.fileDate ? Date.now() - new Date(json.fileDate).getTime() : NaN;
    if (Number.isFinite(age) && age > STALE_AFTER_DAYS * 86_400_000) {
      children.push(el('p', { class: 'notice notice--error', role: 'status', text: 'Ce calcul date de plusieurs jours : il n’est probablement plus d’actualité.' }));
    }

    const zone = el('div', { class: 'result-zone', 'aria-live': 'polite' }, ...children);
    notice.replaceWith(zone);
  }

  init();
})();
