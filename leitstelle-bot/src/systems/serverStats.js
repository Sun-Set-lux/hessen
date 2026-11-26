// Server-Statistik-Kanäle (Sprachkanäle mit Live-Zahlen, alle 10 Minuten)
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const settings = require('../core/settings');
const jobs = require('./jobs');
const statusPanel = require('./statusPanel');

const TYPES = {
  members: { label: (n) => `👥 Mitglieder: ${n}` },
  humans: { label: (n) => `🙋 Menschen: ${n}` },
  erlc: { label: (n) => `🎮 ER:LC: ${n}` },
};

async function values(guild) {
  const snap = statusPanel.snapshot();
  return {
    members: guild.memberCount,
    humans: guild.members.cache.filter((m) => !m.user.bot).size || guild.memberCount,
    erlc: snap?.ok ? `${snap.data.CurrentPlayers}/${snap.data.MaxPlayers}` : snap?.error?.offline ? 'Offline' : '–',
  };
}

async function update(client) {
  const g = process.env.GUILD_ID;
  const map = settings.get(g, 'stats.channels') || {};
  if (!Object.keys(map).length) return;
  const guild = await client.guilds.fetch(g).catch(() => null);
  if (!guild) return;
  const v = await values(guild);
  for (const [type, id] of Object.entries(map)) {
    const ch = guild.channels.cache.get(id);
    const name = TYPES[type]?.label(v[type]);
    if (ch && name && ch.name !== name) await ch.setName(name).catch(() => {});
  }
}

async function setup(guild) {
  const g = guild.id;
  const map = settings.get(g, 'stats.channels') || {};
  const v = await values(guild);
  const cat = await guild.channels.create({ name: '📊 Server-Statistik', type: ChannelType.GuildCategory, position: 0 });
  for (const type of Object.keys(TYPES)) {
    if (map[type] && guild.channels.cache.get(map[type])) continue;
    const ch = await guild.channels.create({ name: TYPES[type].label(v[type]), type: ChannelType.GuildVoice, parent: cat.id,
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }] });
    map[type] = ch.id;
  }
  settings.set(g, 'stats.channels', map);
  return map;
}

jobs.register('stats-channels', 10 * 60 * 1000, update);

module.exports = { setup, update, values };
