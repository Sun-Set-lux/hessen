// Kurzlebige Zwischenspeicher für Bestätigungen und mehrstufige Eingaben (15 Minuten)
const crypto = require('crypto');

const store = new Map();
const TTL = 15 * 60 * 1000;

function put(value) {
  const token = crypto.randomBytes(6).toString('hex');
  store.set(token, { value, exp: Date.now() + TTL });
  if (store.size > 2000) for (const [k, v] of store) if (v.exp < Date.now()) store.delete(k);
  return token;
}

function get(token) {
  const e = store.get(token);
  if (!e || e.exp < Date.now()) { store.delete(token); return null; }
  return e.value;
}

function take(token) {
  const v = get(token);
  store.delete(token);
  return v;
}

module.exports = { put, get, take };
