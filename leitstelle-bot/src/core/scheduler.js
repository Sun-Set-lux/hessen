// Wiederkehrende Aufgaben mit Fehlerschutz und ohne Überlappung
const { log } = require('./logger');

const tasks = new Map();

function every(name, ms, fn, { immediate = false } = {}) {
  stop(name);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await fn(); } catch (err) { log.error(`Aufgabe "${name}" fehlgeschlagen:`, err); } finally { running = false; }
  };
  const handle = setInterval(tick, ms);
  tasks.set(name, handle);
  if (immediate) setTimeout(tick, 2000);
}

function stop(name) {
  const h = tasks.get(name);
  if (h) clearInterval(h);
  tasks.delete(name);
}

module.exports = { every, stop };
