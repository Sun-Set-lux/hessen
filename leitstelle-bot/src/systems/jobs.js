// Geplante Aufgaben (Ankündigungen, Gewinnspiele, Umfragen, Statistik-Kanäle …)
const scheduler = require('../core/scheduler');

const jobs = [];
const register = (name, ms, fn) => jobs.push({ name, ms, fn });

function start(client) {
  for (const j of jobs) scheduler.every(j.name, j.ms, () => j.fn(client), { immediate: true });
}

module.exports = { register, start };
