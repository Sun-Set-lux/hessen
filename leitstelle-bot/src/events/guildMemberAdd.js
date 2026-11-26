// Neues Mitglied: Willkommensnachricht, automatische Rolle, Log
const { Events } = require('discord.js');
const settings = require('../core/settings');
const texts = require('../core/texts');
const theme = require('../core/theme');
const util = require('../core/util');
const logger = require('../core/logger');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const g = member.guild.id;
    if (g !== process.env.GUILD_ID) return;
    const autoRole = settings.role(g, 'autoRole');
    if (autoRole && !member.user.bot) await member.roles.add(autoRole, 'Automatische Beitrittsrolle').catch(() => {});

    const chId = settings.channel(g, 'welcome');
    if (chId && settings.get(g, 'welcome.enabled') && !member.user.bot) {
      const ch = await member.client.channels.fetch(chId).catch(() => null);
      const vars = { user: `<@${member.id}>`, name: member.user.username, server: member.guild.name, anzahl: member.guild.memberCount };
      await ch?.send({
        content: `<@${member.id}>`,
        embeds: [theme.base(g, 'primary').setTitle(`👋 Willkommen, ${member.user.username}!`).setDescription(texts.render(g, 'welcome', vars)).setThumbnail(member.user.displayAvatarURL())],
        allowedMentions: { users: [member.id] },
      }).catch(() => {});
    }
    const young = Date.now() - member.user.createdTimestamp < 7 * 864e5;
    await logger.discord(g, 'log', theme.base(g, young ? 'warning' : 'success').setTitle('📥 Mitglied beigetreten')
      .setDescription(`<@${member.id}> (${util.clean(member.user.tag)})\n**ID:** \`${member.id}\`\n**Account erstellt:** ${util.ts(member.user.createdTimestamp, 'R')}${young ? '\n⚠️ Sehr junger Account' : ''}`)
      .setThumbnail(member.user.displayAvatarURL()), { event: 'member.join', targetId: member.id });
  },
};
