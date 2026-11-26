// Rollen- und Nicknameänderungen protokollieren
const { Events } = require('discord.js');
const theme = require('../core/theme');
const util = require('../core/util');
const logger = require('../core/logger');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(before, after) {
    if (after.guild.id !== process.env.GUILD_ID || before.partial) return;
    const added = after.roles.cache.filter((r) => !before.roles.cache.has(r.id));
    const removed = before.roles.cache.filter((r) => !after.roles.cache.has(r.id));
    const lines = [];
    if (added.size) lines.push(`➕ ${added.map((r) => `<@&${r.id}>`).join(' ')}`);
    if (removed.size) lines.push(`➖ ${removed.map((r) => `<@&${r.id}>`).join(' ')}`);
    if (before.nickname !== after.nickname) lines.push(`📝 Nickname: ${util.clean(before.nickname || '–')} → ${util.clean(after.nickname || '–')}`);
    if (!lines.length) return;
    await logger.discord(after.guild.id, 'log', theme.base(after.guild.id, 'neutral').setTitle('👤 Mitglied aktualisiert').setDescription(`<@${after.id}>\n${lines.join('\n')}`), { audit: false });
  },
};
