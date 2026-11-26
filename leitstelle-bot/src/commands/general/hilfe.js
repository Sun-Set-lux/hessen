const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const theme = require('../../core/theme');
const perms = require('../../core/permissions');

const CATEGORIES = {
  erlc: { label: 'ER:LC', emoji: '🖥️', cmds: ['erlc'] },
  session: { label: 'Sessions & Hosting', emoji: '🚨', cmds: ['session', 'host', 'warteschlange'] },
  dept: { label: 'Abteilungen', emoji: '🏛️', cmds: ['department'] },
  support: { label: 'Modmail & Bewerbungen', emoji: '📩', cmds: ['modmail', 'bewerbung'] },
  mod: { label: 'Moderation', emoji: '🛡️', cmds: ['ban', 'kick', 'timeout', 'untimeout', 'warn', 'warnings', 'clear', 'lock', 'unlock', 'slowmode', 'modlogs'] },
  staff: { label: 'Team', emoji: '👥', cmds: ['staff'] },
  community: { label: 'Community', emoji: '🎉', cmds: ['announce', 'verifizierung', 'vorschlag', 'umfrage', 'giveaway', 'rollenpanel', 'infopanel', 'textbaustein', 'level', 'serverstats'] },
  config: { label: 'Konfiguration', emoji: '⚙️', cmds: ['setup', 'config', 'setchannel', 'setrole', 'setcolor', 'setlogchannel', 'resetconfig'] },
};

const data = new SlashCommandBuilder().setName('hilfe').setDescription('Zeigt alle Befehle und was du nutzen darfst');

function overview(g) {
  return theme.base(g, 'primary').setTitle('📖 Hilfe')
    .setDescription('Wähle unten einen Bereich aus. Befehle, die du nutzen darfst, sind mit ✅ markiert.\n\n' + Object.values(CATEGORIES).map((c) => `${c.emoji} **${c.label}** – ${c.cmds.map((x) => `\`/${x}\``).join(' ')}`).join('\n'));
}

function categoryEmbed(interaction, key) {
  const cat = CATEGORIES[key];
  const lines = [];
  for (const name of cat.cmds) {
    const cmd = interaction.client.commands.get(name);
    if (!cmd) continue;
    const json = cmd.data.toJSON();
    const subs = (json.options || []).filter((o) => o.type === 1);
    if (!subs.length) lines.push(`${perms.check(interaction.member, name).ok ? '✅' : '🔒'} \`/${name}\` – ${json.description}`);
    for (const s of subs) lines.push(`${perms.check(interaction.member, `${name}.${s.name}`).ok ? '✅' : '🔒'} \`/${name} ${s.name}\` – ${s.description}`);
  }
  return theme.base(interaction.guildId, 'primary').setTitle(`${cat.emoji} ${cat.label}`).setDescription(lines.join('\n').slice(0, 4000));
}

const menu = () => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help:cat').setPlaceholder('Bereich auswählen …')
  .addOptions(Object.entries(CATEGORIES).map(([value, c]) => ({ label: c.label, value, emoji: c.emoji }))));

async function execute(interaction) {
  return theme.reply(interaction, { embeds: [overview(interaction.guildId)], components: [menu()] });
}

module.exports = { data, perms: { '*': ['everyone'] }, execute, categoryEmbed, menu, CATEGORIES };
