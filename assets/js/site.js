/* FlammeFR — comportements communs à toutes les pages : menu mobile, recherche, dates, alertes de données. */
import { el, icon, badge, getData, getDepts, searchDepts, ranked, reading, formatDateTime, isStale, initReveal, DataError } from './lib.js';

/* ------------------------------------------------------------------ */
/* Menu mobile                                                          */
/* ------------------------------------------------------------------ */
function initMenu() {
  const btn = document.getElementById('menu-btn');
  const panel = document.getElementById('mobile-nav');
  if (!btn || !panel) return;
  const set = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    panel.hidden = !open;
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { set(false); btn.focus(); } });
  window.matchMedia('(min-width: 64rem)').addEventListener('change', (e) => { if (e.matches) set(false); });
}

/* ------------------------------------------------------------------ */
/* Palette de recherche (dialogue natif + motif ARIA « combobox »)      */
/* ------------------------------------------------------------------ */
let palette = null;

function buildPalette() {
  const input = el('input', {
    class: 'palette__input', id: 'palette-input', type: 'text', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'true',
    'aria-controls': 'palette-list', 'aria-label': 'Numéro ou nom du département', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    placeholder: 'Numéro ou nom : 33, Gironde, Var…', inputmode: 'search',
  });
  const closeBtn = el('button', { type: 'button', class: 'palette__close', 'aria-label': 'Fermer la recherche', text: 'Échap' });
  const title = el('p', { class: 'eyebrow palette__title' });
  const list = el('ul', { class: 'palette__list', id: 'palette-list', role: 'listbox', 'aria-label': 'Départements' });
  const live = el('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const dlg = el(
    'dialog', { class: 'palette', 'aria-label': 'Rechercher un département' },
    el('form', { class: 'palette__bar', role: 'search' }, icon('search'), input, closeBtn),
    title, list, live,
    el('p', { class: 'palette__foot' }, el('span', { text: '↑ ↓ parcourir' }), el('span', { text: 'Entrée ouvrir' }), el('span', { text: 'Échap fermer' }))
  );
  document.body.append(dlg);

  const state = { items: [], active: -1, depts: [], data: null };

  const setActive = (i) => {
    const nodes = [...list.children];
    if (!nodes.length) return;
    state.active = (i + nodes.length) % nodes.length;
    nodes.forEach((n, k) => n.setAttribute('aria-selected', String(k === state.active)));
    input.setAttribute('aria-activedescendant', nodes[state.active].id);
    nodes[state.active].scrollIntoView({ block: 'nearest' });
  };

  const go = (d) => { location.assign(`/departement/${d.slug}/`); };

  const render = () => {
    const q = input.value.trim();
    let shown;
    if (q) {
      shown = searchDepts(state.depts, q).slice(0, 8);
      title.textContent = shown.length ? 'Résultats' : '';
    } else if (state.data) {
      const day = state.data.days.includes(1) ? 1 : state.data.days[0];
      const bySlug = new Map(state.depts.map((d) => [d.code, d]));
      shown = ranked(state.data, day).slice(0, 6).map((r) => bySlug.get(r.d.code)).filter(Boolean);
      title.textContent = 'Les plus exposés';
    } else {
      shown = state.depts.slice(0, 6);
      title.textContent = 'Départements';
    }
    state.items = shown;
    list.replaceChildren(...shown.map((d, i) => {
      const r = state.data ? reading(state.data.byCode.get(d.code), state.data.days.includes(1) ? 1 : state.data.days[0]) : { level: null };
      const li = el('li', { class: 'palette__item', id: `palette-opt-${i}`, role: 'option', 'aria-selected': 'false' },
        el('span', { class: 'palette__code', text: d.code }),
        el('span', { class: 'palette__name' }, d.name, el('small', { text: d.region })),
        ...(r.level ? [badge(r.level, 'sm')] : []));
      li.addEventListener('click', () => go(d));
      li.addEventListener('mousemove', () => { if (state.active !== i) setActive(i); });
      return li;
    }));
    if (q && !shown.length) {
      list.replaceChildren(el('li', { class: 'palette__empty', role: 'presentation', text: `Aucun département ne correspond à « ${q} ». Essayez un numéro (33) ou un nom (Gironde).` }));
      live.textContent = 'Aucun département ne correspond à votre saisie.';
      input.removeAttribute('aria-activedescendant');
      return;
    }
    live.textContent = q ? `${shown.length} résultat${shown.length > 1 ? 's' : ''}.` : '';
    if (shown.length) setActive(0);
  };

  dlg.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(state.active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(state.active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(state.items.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const d = state.items[state.active] ?? state.items[0]; if (d) go(d); }
  });
  closeBtn.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  return {
    async open() {
      if (!state.depts.length) {
        try { state.depts = await getDepts(); } catch { state.depts = []; }
        getData().then((d) => { state.data = d; if (dlg.open) render(); }).catch(() => {});
      }
      input.value = '';
      render();
      if (!dlg.open) dlg.showModal();
      input.focus();
    },
  };
}

function openSearch() {
  palette ??= buildPalette();
  palette.open();
}

function initSearch() {
  document.querySelectorAll('[data-open-search]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); openSearch(); }));
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    if ((e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      openSearch();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Données : dates, alertes                                             */
/* ------------------------------------------------------------------ */
function showBanner(text, error = false) {
  const main = document.getElementById('contenu');
  if (!main || document.querySelector('.banner')) return;
  main.before(el('div', { class: `banner${error ? ' banner--error' : ''}`, role: 'status' }, el('div', { class: 'container', text })));
}

async function initData() {
  const targets = document.querySelectorAll('[data-update]');
  try {
    const data = await getData();
    const formatted = data.fileDate ? formatDateTime(data.fileDate) : null;
    targets.forEach((t) => {
      t.replaceChildren();
      if (formatted) t.append(el('time', { datetime: data.fileDate, text: formatted }));
      else t.append('indisponible');
    });
    if (data.count === 0) showBanner('Aucune donnée n’est disponible pour le moment. Les niveaux sont recalculés chaque jour : réessayez plus tard.');
    else if (data.fileDate && isStale(data.fileDate)) showBanner('Ce calcul date de plusieurs jours : il n’est probablement plus d’actualité.');
  } catch (error) {
    targets.forEach((t) => { t.textContent = 'indisponible'; });
    showBanner(error instanceof DataError ? error.message : 'Une erreur inattendue est survenue. Rechargez la page.', true);
  }
}

/* Anciennes adresses de la forme /#33 : redirection vers la page du département. */
async function legacyHash() {
  if (location.pathname !== '/' && location.pathname !== '/index.html') return;
  const code = decodeURIComponent(location.hash.slice(1)).toUpperCase();
  if (!/^(\d{2,3}|2[AB])$/.test(code)) return;
  try {
    const depts = await getDepts();
    const found = depts.find((d) => d.code === code);
    if (found) location.replace(`/departement/${found.slug}/`);
  } catch { /* sans conséquence */ }
}

initMenu();
initSearch();
initReveal();
initData();
legacyHash();
