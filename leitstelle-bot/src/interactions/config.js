// Einrichtung und Konfiguration (Menüs, Formulare, Bestätigungen)
const { ActionRowBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const theme = require('../core/theme');
const settings = require('../core/settings');
const perms = require('../core/permissions');
const texts = require('../core/texts');
const logger = require('../core/logger');

const AUTO = {
  public: { name: '🚨 ER:LC', channels: { session: 'sessions', status: 'server-status', queue: 'warteschlange' } },
  logs: { name: '📁 Bot-Logs', channels: { log: 'bot-log', sessionLog: 'session-log', erlcLog: 'erlc-log', modmailLog: 'modmail-log', applicationLog: 'bewerbungs-log', modLog: 'moderations-log', staffLog: 'team-log', departmentLog: 'abteilungs-log', verificationLog: 'verifizierungs-log' } },
  team: { name: '📩 Modmail', category: 'modmailCategory', channels: { application: 'bewerbungen-auswertung' } },
};

async function handle(interaction, action, args) {
  const g = interaction.guildId;
  if (!perms.isAdmin(interaction.member)) return theme.replyError(interaction, 'Nur die Administration kann die Einrichtung ändern.');

  switch (action) {
    case 'tpl': {
      const key = args.join(':');
      const value = interaction.fields.getTextInputValue('text').trim();
      if (value) texts.set(g, key, value); else texts.reset(g, key);
      return theme.replySuccess(interaction, value ? `Die Vorlage **${texts.TEMPLATES[key]?.label}** wurde gespeichert.` : 'Der Standardtext wurde wiederhergestellt.');
    }
    case 'reset': {
      settings.reset(g, args[0]);
      if (['alles', 'erlc'].includes(args[0])) require('../systems/statusPanel').start(interaction.client);
      logger.discord(g, 'log', theme.base(g, 'warning').setDescription(`♻️ Konfiguration zurückgesetzt: **${args[0]}** (durch <@${interaction.user.id}>)`), { event: 'config.reset', userId: interaction.user.id });
      return interaction.update({ embeds: [theme.success(g, 'Die Konfiguration wurde zurückgesetzt.')], components: [] });
    }
    case 'cancel': return interaction.update({ embeds: [theme.info(g, 'Abgebrochen.')], components: [] });
    case 'overview': return theme.reply(interaction, { embeds: require('../commands/config/config').overview(interaction.guild) });

    case 'pickchannel': {
      const type = interaction.values[0];
      const menu = new ChannelSelectMenuBuilder().setCustomId(`cfg:setchannel:${type}`).setPlaceholder(settings.CHANNEL_TYPES[type])
        .setChannelTypes(type === 'modmailCategory' ? [ChannelType.GuildCategory] : [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
      return theme.reply(interaction, { embeds: [theme.info(g, `Wähle den Kanal für **${settings.CHANNEL_TYPES[type]}**.`)], components: [new ActionRowBuilder().addComponents(menu)] });
    }
    case 'setchannel': {
      const type = args[0];
      settings.set(g, `channels.${type}`, interaction.values[0]);
      if (type === 'status') require('../systems/statusPanel').tick(interaction.client).catch(() => {});
      return interaction.update({ embeds: [theme.success(g, `**${settings.CHANNEL_TYPES[type]}** ist jetzt <#${interaction.values[0]}>.`)], components: [] });
    }
    case 'pickrole': {
      const type = interaction.values[0];
      return theme.reply(interaction, { embeds: [theme.info(g, `Wähle die Rolle für **${settings.ROLE_TYPES[type]}**.`)], components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`cfg:setrole:${type}`).setPlaceholder(settings.ROLE_TYPES[type]))] });
    }
    case 'setrole': {
      const role = interaction.roles.first();
      if (role.managed) return interaction.update({ embeds: [theme.error(g, 'Diese Rolle wird von einer Integration verwaltet und kann nicht genutzt werden.')], components: [] });
      settings.set(g, `roles.${args[0]}`, role.id);
      return interaction.update({ embeds: [theme.success(g, `**${settings.ROLE_TYPES[args[0]]}** ist jetzt <@&${role.id}>.`)], components: [] });
    }
    case 'pickgroup': {
      const grp = interaction.values[0];
      const menu = new RoleSelectMenuBuilder().setCustomId(`cfg:setgroup:${grp}`).setPlaceholder(`Rollen für ${perms.GROUPS[grp]}`).setMinValues(0).setMaxValues(10)
        .setDefaultRoles(perms.rolesOf(g, grp).slice(0, 10));
      return theme.reply(interaction, { embeds: [theme.info(g, `Wähle alle Rollen, die zur Gruppe **${perms.GROUPS[grp]}** gehören. Nicht ausgewählte Rollen werden entfernt.`)], components: [new ActionRowBuilder().addComponents(menu)] });
    }
    case 'setgroup': {
      const grp = args[0];
      for (const r of perms.rolesOf(g, grp)) perms.removeRole(g, grp, r);
      for (const r of interaction.values) perms.addRole(g, grp, r);
      logger.discord(g, 'log', theme.base(g, 'neutral').setDescription(`🛡️ Gruppe **${perms.GROUPS[grp]}**: ${interaction.values.map((r) => `<@&${r}>`).join(' ') || 'keine Rollen'} (durch <@${interaction.user.id}>)`), { event: 'config.permissions', userId: interaction.user.id });
      return interaction.update({ embeds: [theme.success(g, `**${perms.GROUPS[grp]}**: ${interaction.values.map((r) => `<@&${r}>`).join(' ') || 'keine Rollen'}`)], components: [] });
    }
    case 'autocreate': {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const guild = interaction.guild;
      if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.editReply({ embeds: [theme.error(g, 'Mir fehlt die Berechtigung **Kanäle verwalten**.')] });
      const staffRoles = [...new Set(['admin', 'management', 'moderation', 'support', 'server'].flatMap((x) => perms.rolesOf(g, x)))];
      const me = guild.members.me.id;
      const privateOverwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: me, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels] },
        ...staffRoles.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] })),
      ];
      const readOnly = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] },
        { id: me, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
      ];
      const created = [];
      try {
        for (const [key, block] of Object.entries(AUTO)) {
          const missing = Object.keys(block.channels).filter((t) => !settings.get(g, `channels.${t}`));
          const needCategory = block.category && !settings.get(g, `channels.${block.category}`);
          if (!missing.length && !needCategory) continue;
          const cat = await guild.channels.create({ name: block.name, type: ChannelType.GuildCategory, permissionOverwrites: key === 'public' ? undefined : privateOverwrites });
          if (needCategory) { settings.set(g, `channels.${block.category}`, cat.id); created.push(`${settings.CHANNEL_TYPES[block.category]}: ${cat.name}`); }
          for (const t of missing) {
            const ch = await guild.channels.create({ name: block.channels[t], type: ChannelType.GuildText, parent: cat.id, permissionOverwrites: key === 'public' ? readOnly : privateOverwrites });
            settings.set(g, `channels.${t}`, ch.id);
            created.push(`${settings.CHANNEL_TYPES[t]}: ${ch}`);
          }
        }
      } catch (err) {
        return interaction.editReply({ embeds: [theme.error(g, `Beim Erstellen ist ein Fehler aufgetreten: ${err.message}${created.length ? `\nBereits erstellt:\n${created.join('\n')}` : ''}`)] });
      }
      require('../systems/statusPanel').tick(interaction.client).catch(() => {});
      return interaction.editReply({ embeds: [theme.success(g, created.length ? `Folgende Kanäle wurden erstellt:\n${created.join('\n')}\n\n-# Tipp: Lege zuerst die Berechtigungsgruppen fest, dann sehen Teamrollen die privaten Kanäle automatisch.` : 'Alle Kanäle sind bereits eingestellt – es wurde nichts erstellt.')] });
    }
    default: return null;
  }
}

module.exports = { prefix: 'cfg', handle };
