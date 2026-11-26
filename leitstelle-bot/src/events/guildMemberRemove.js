// Mitglied verlassen: Abschiedsnachricht, Aufräumen, Log
const { Events } = require('discord.js');
const settings = require('../core/settings');
const texts = require('../core/texts');
const theme = require('../core/theme');
const util = require('../core/util');
const logger = require('../core/logger');
const { run, now } = require('../core/database');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const g = member.guild.id;
    if (g !== process.env.GUILD_ID) return;
    // Warteschlange und offene Dienste bereinigen
    run('DELETE FROM queue_entries WHERE guild_id = ? AND user_id = ?', g, member.id);
    run('UPDATE staff_duty SET ended_at = ? WHERE guild_id = ? AND user_id = ? AND ended_at IS NULL', now(), g, member.id);

    const chId = settings.channel(g, 'goodbye');
    if (chId && settings.get(g, 'goodbye.enabled') && !member.user.bot) {
      const ch = await member.client.channels.fetch(chId).catch(() => null);
      const vars = { user: `<@${member.id}>`, name: member.user.username, server: member.guild.name, anzahl: member.guild.memberCount };
      await ch?.send({ embeds: [theme.base(g, 'neutral').setDescription(texts.render(g, 'goodbye', vars))], allowedMentions: { parse: [] } }).catch(() => {});
    }
    await logger.discord(g, 'log', theme.base(g, 'danger').setTitle('📤 Mitglied verlassen')
      .setDescription(`<@${member.id}> (${util.clean(member.user.tag)})\n**ID:** \`${member.id}\`\n**Beigetreten:** ${member.joinedTimestamp ? util.ts(member.joinedTimestamp, 'R') : 'unbekannt'}\n**Rollen:** ${member.roles?.cache?.filter((r) => r.id !== g).map((r) => r.name).join(', ') || '–'}`), { event: 'member.leave', targetId: member.id });
  },
};
