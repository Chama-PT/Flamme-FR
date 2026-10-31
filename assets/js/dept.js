/* FlammeFR — pages départements : signale des prévisions périmées (hors saison). */
(() => {
  'use strict';
  const time = document.querySelector('time[data-fresh]');
  const note = document.getElementById('stale-note');
  if (!time || !note) return;
  const age = Date.now() - new Date(time.dateTime).getTime();
  if (Number.isFinite(age) && age > 4 * 86_400_000) note.hidden = false;
})();
