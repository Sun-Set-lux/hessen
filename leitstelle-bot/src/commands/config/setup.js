const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');
const perms = require('../../core/permissions');

const data = new SlashCommandBuilder().setName('setup').setDescription('Interaktive Einrichtung des Bots');

function setupPayload(guild) {
  const g = guild.id;
  const set = Object.keys(settings.CHANNEL_TYPES).filter((k) => settings.get(g, `channels.${k}`)).length;
  const groups = Object.keys(perms.GROUPS).filter((k) => perms.rolesOf(g, k).length).length;
  const embed = theme.base(g, 'primary').setTitle('🛠️ Einrichtung')
    .setDescription([
      'Willkommen bei der Einrichtung! Hier legst du alles direkt in Discord fest.',
      '',
      `**1. Kanäle** – ${set}/${Object.keys(settings.CHANNEL_TYPES).length} eingestellt`,
      `**2. Rollen** – Session-Ping, Verifizierung, Im-Dienst …`,
      `**3. Berechtigungen** – ${groups}/${Object.keys(perms.GROUPS).length} Gruppen mit Rollen`,
      `**4. ER:LC** – API-Schlüssel ${process.env.ERLC_API_KEY ? 'hinterlegt ✅' : 'fehlt ❌ (in der .env eintragen)'}`,
      '',
      'Mit **Kanäle automatisch erstellen** legt der Bot alle fehlenden Kanäle mit passenden Rechten an.',
      'Danach: `/modmail setup`, `/verifizierung panel`, `/bewerbung panel` und `/warteschlange panel` in den gewünschten Kanälen.',
    ].join('\n'));
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cfg:pickchannel').setPlaceholder('1. Kanal festlegen …')
        .addOptions(Object.entries(settings.CHANNEL_TYPES).map(([value, label]) => ({ label, value, description: settings.get(g, `channels.${value}`) ? 'Eingestellt' : 'Noch nicht eingestellt' })))),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cfg:pickrole').setPlaceholder('2. Rolle festlegen …')
        .addOptions(Object.entries(settings.ROLE_TYPES).map(([value, label]) => ({ label, value, description: settings.role(g, value) ? 'Eingestellt' : 'Noch nicht eingestellt' })))),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cfg:pickgroup').setPlaceholder('3. Berechtigungsgruppe festlegen …')
        .addOptions(Object.entries(perms.GROUPS).map(([value, label]) => ({ label, value, description: `${perms.rolesOf(g, value).length} Rolle(n)` })))),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg:autocreate').setStyle(ButtonStyle.Primary).setLabel('Kanäle automatisch erstellen').setEmoji('⚡'),
        new ButtonBuilder().setCustomId('cfg:overview').setStyle(ButtonStyle.Secondary).setLabel('Konfiguration anzeigen').setEmoji('📋'),
      ),
    ],
  };
}

async function execute(interaction) {
  return theme.reply(interaction, setupPayload(interaction.guild));
}

module.exports = { data, perms: { '*': ['admin'] }, execute, setupPayload };
