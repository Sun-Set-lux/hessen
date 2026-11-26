// Selbsttest: lädt alle Module, prüft Befehle, Datenbank und Komponenten (ohne Discord-Verbindung)
process.env.DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'test';
process.env.GUILD_ID = process.env.GUILD_ID || '1';
const fs = require('fs');
const path = require('path');
const handler = require('../src/core/handler');
const perms = require('../src/core/permissions');

const fake = {};
handler.load(fake);
let problems = 0;
const bad = (m) => { problems++; console.error('❌', m); };
const body = handler.commands.map((c) => c.data.toJSON());
if (body.length > 100) bad(`Zu viele Befehle: ${body.length}`);
for (const cmd of body) {
  const subs = cmd.options || [];
  if (subs.length > 25) bad(`/${cmd.name}: mehr als 25 Optionen/Unterbefehle`);
  const walk = (opts, p) => {
    for (const o of opts || []) {
      if (!o.description || o.description.length > 100) bad(`${p} ${o.name}: Beschreibung ungültig`);
      if (o.choices && o.choices.length > 25) bad(`${p} ${o.name}: mehr als 25 Auswahlmöglichkeiten`);
      if (!/^[-_\p{L}\p{N}]{1,32}$/u.test(o.name) || o.name !== o.name.toLowerCase()) bad(`${p} ${o.name}: ungültiger Name`);
      walk(o.options, `${p} ${o.name}`);
    }
  };
  walk(cmd.options, `/${cmd.name}`);
  const size = JSON.stringify(cmd).length;
  if (size > 8000) bad(`/${cmd.name}: Befehl zu groß (${size} Zeichen)`);
}
// Alle Systeme laden
for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', 'systems'))) require(path.join(__dirname, '..', 'src', 'systems', f));
for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', 'events'))) {
  const ev = require(path.join(__dirname, '..', 'src', 'events', f));
  if (!ev.name || typeof ev.execute !== 'function') bad(`Ereignis ${f} ungültig`);
}
// Komponenten-Präfixe in Befehlen müssen einen Handler haben
const src = [];
const walkDir = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walkDir(path.join(d, e.name)) : e.name.endsWith('.js') && src.push(path.join(d, e.name))));
walkDir(path.join(__dirname, '..', 'src'));
const prefixes = new Set();
for (const f of src) for (const m of fs.readFileSync(f, 'utf8').matchAll(/setCustomId\(\s*[`'"]([a-z]+):/g)) prefixes.add(m[1]);
for (const p of prefixes) if (!handler.components.has(p)) bad(`Kein Handler für Komponenten-Präfix "${p}"`);
console.log(`Befehle: ${body.length} | Berechtigungsschlüssel: ${perms.registry.size} | Komponenten: ${handler.components.size} | Präfixe genutzt: ${[...prefixes].join(', ')}`);
if (problems) { console.error(`${problems} Problem(e) gefunden.`); process.exit(1); }
console.log('✅ Selbsttest bestanden.');
