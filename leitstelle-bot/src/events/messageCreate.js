// Nachrichten: Modmail-Weiterleitung und Level-System
const { Events } = require('discord.js');
const theme = require('../core/theme');
const mm = require('../systems/modmailManager');
const pending = require('../systems/pending');
const util = require('../core/util');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot) return;

    // Privatnachricht an den Bot → Modmail
    if (!message.guildId) {
      const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
      if (!guild) return;
      if (await mm.onUserDM(message, guild)) return;
      const member = await guild.members.fetch(message.author.id).catch(() => null);
      if (!member) return message.reply({ embeds: [theme.error(guild.id, 'Du musst Mitglied unseres Discord-Servers sein, um das Team zu kontaktieren.')] }).catch(() => {});
      if (!settings().get(guild.id, 'channels.modmailCategory')) return message.reply({ embeds: [theme.error(guild.id, 'Modmail ist derzeit nicht eingerichtet.')] }).catch(() => {});
      if (!util.lock(`mm-dmprompt:${message.author.id}`, 5000)) return;
      const token = pending.put({ content: message.content, attachments: [...message.attachments.values()].map((a) => a.url) });
      return message.reply({
        embeds: [theme.info(guild.id, 'Hallo! Möchtest du eine Unterhaltung mit unserem Team starten? Wähle dazu eine Kategorie aus. Deine Nachricht wird anschließend übernommen.', '📩 Support kontaktieren')],
        components: [mm.categoryMenu(`mm:dmcat:${token}`)],
      }).catch(() => {});
    }

    if (message.guildId !== process.env.GUILD_ID) return;

    // Nachricht im Modmail-Kanal → an den Nutzer
    const conv = mm.byChannel(message.channelId);
    if (conv) return mm.onStaffMessage(message, conv);

    // Level-System
    require('../systems/levels').onMessage(message).catch(() => {});
  },
};

const settings = () => require('../core/settings');
