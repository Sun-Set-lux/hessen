const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const theme = require('../../core/theme');
const settings = require('../../core/settings');
const perms = require('../../core/permissions');
const texts = require('../../core/texts');
const util = require('../../core/util');
const logger = require('../../core/logger');
const { all } = require('../../core/database');
const statusPanel = require('../../systems/statusPanel');

const { E } = theme;
const groupChoices = Object.entries(perms.GROUPS).map(([value, name]) => ({ name, value }));

const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Bot-Konfiguration (Administration)')
  .addSubcommand((s) => s.setName('anzeigen').setDescription('Zeigt die aktuelle Konfiguration'))
  .addSubcommand((s) => s.setName('berechtigung').setDescription('Ordnet einer Berechtigungsgruppe eine Rolle zu oder entfernt sie')
    .addStringOption((o) => o.setName('gruppe').setDescription('Berechtigungsgruppe').setRequired(true).addChoices(...groupChoices))
    .addRoleOption((o) => o.setName('rolle').setDescription('Discord-Rolle').setRequired(true))
    .addStringOption((o) => o.setName('aktion').setDescription('Hinzufügen oder entfernen').setRequired(true).addChoices({ name: 'Hinzufügen', value: 'add' }, { name: 'Entfernen', value: 'remove' })))
  .addSubcommand((s) => s.setName('befehl').setDescription('Legt fest, wer einen Befehl nutzen darf (Befehls-Ausnahmen)')
    .addStringOption((o) => o.setName('befehl').setDescription('Befehl, z. B. erlc.ban').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('modus').setDescription('Neue Regel').setRequired(true).addChoices(...Object.entries(perms.MODES).map(([value, name]) => ({ name, value })))))
  .addSubcommand((s) => s.setName('befehle').setDescription('Zeigt alle Befehle mit ihren Berechtigungen'))
  .addSubcommand((s) => s.setName('erlc').setDescription('ER:LC-Einstellungen')
    .addIntegerOption((o) => o.setName('intervall').setDescription('Aktualisierung in Sekunden (30–600)').setMinValue(30).setMaxValue(600))
    .addBooleanOption((o) => o.setName('code_oeffentlich').setDescription('Servercode im Statuspanel öffentlich anzeigen?'))
    .addStringOption((o) => o.setName('beitrittslink').setDescription('Eigener Beitrittslink für den Button (leer = „-“ zum Entfernen)').setMaxLength(300)))
  .addSubcommand((s) => s.setName('session').setDescription('Session-Einstellungen')
    .addIntegerOption((o) => o.setName('mindestspieler').setDescription('Standard-Mindestspielerzahl').setMinValue(0).setMaxValue(100))
    .addIntegerOption((o) => o.setName('voll_ab').setDescription('Ab wie viel % gilt der Server als „fast voll“?').setMinValue(50).setMaxValue(100)))
  .addSubcommand((s) => s.setName('vorlage').setDescription('Bearbeitet eine deutsche Textvorlage')
    .addStringOption((o) => o.setName('vorlage').setDescription('Welche Vorlage?').setRequired(true).setAutocomplete(true)))
  .addSubcommand((s) => s.setName('allgemein').setDescription('Name und Logo des Bots in Embeds')
    .addStringOption((o) => o.setName('name').setDescription('Anzeigename in der Fußzeile').setMaxLength(40))
    .addStringOption((o) => o.setName('logo').setDescription('Logo-URL (https://…, „-“ zum Entfernen)').setMaxLength(400)))
  .addSubcommand((s) => s.setName('verifizierung').setDescription('Einstellungen der Verifizierung')
    .addIntegerOption((o) => o.setName('mindestalter').setDescription('Mindestalter des Discord-Accounts in Tagen (0 = aus)').setMinValue(0).setMaxValue(365))
    .addBooleanOption((o) => o.setName('captcha').setDescription('Rechenaufgabe als Bot-Schutz verwenden?')))
  .addSubcommand((s) => s.setName('moderation').setDescription('Einstellungen der Moderation')
    .addBooleanOption((o) => o.setName('grund_pflicht').setDescription('Grund bei Moderationsaktionen verpflichtend?'))
    .addBooleanOption((o) => o.setName('dm').setDescription('Betroffene per Privatnachricht informieren?')))
  .addSubcommand((s) => s.setName('bewerbungen').setDescription('Einstellungen der Bewerbungen')
    .addIntegerOption((o) => o.setName('wartezeit').setDescription('Wartezeit nach Ablehnung in Tagen').setMinValue(0).setMaxValue(90)))
  .addSubcommand((s) => s.setName('community').setDescription('Willkommen, Abschied und Level-System')
    .addBooleanOption((o) => o.setName('willkommen').setDescription('Willkommensnachrichten aktiv?'))
    .addBooleanOption((o) => o.setName('abschied').setDescription('Abschiedsnachrichten aktiv?'))
    .addBooleanOption((o) => o.setName('level').setDescription('Level-System aktiv?'))
    .addBooleanOption((o) => o.setName('level_meldung').setDescription('Level-Aufstiege ankündigen?')));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const g = interaction.guildId;
  const o = interaction.options;
  const done = (text, fields) => {
    logger.discord(g, 'log', theme.base(g, 'neutral').setDescription(`${E.tools} **Konfiguration geändert** von <@${interaction.user.id}>\n${text}`), { event: 'config.change', userId: interaction.user.id, details: fields });
    return theme.replySuccess(interaction, text);
  };

  switch (sub) {
    case 'anzeigen': return theme.reply(interaction, { embeds: overview(interaction.guild) });

    case 'berechtigung': {
      const grp = o.getString('gruppe'); const role = o.getRole('rolle');
      if (o.getString('aktion') === 'add') { perms.addRole(g, grp, role.id); return done(`<@&${role.id}> gehört jetzt zur Gruppe **${perms.GROUPS[grp]}**.`); }
      return perms.removeRole(g, grp, role.id) ? done(`<@&${role.id}> wurde aus **${perms.GROUPS[grp]}** entfernt.`) : theme.replyError(interaction, 'Diese Rolle war der Gruppe nicht zugeordnet.');
    }

    case 'befehl': {
      const key = o.getString('befehl').trim().replace(/^\//, '').replace(/\s+/g, '.');
      const known = perms.registry.has(key) || [...perms.registry.keys()].some((k) => k.startsWith(`${key}.`));
      if (!known) return theme.replyError(interaction, 'Diesen Befehl gibt es nicht. Nutze die Vorschläge in der Auswahl.');
      if (['config', 'resetconfig', 'setup'].includes(key.split('.')[0])) return theme.replyError(interaction, 'Konfigurationsbefehle bleiben immer der Administration vorbehalten.');
      perms.setRule(g, key, o.getString('modus'));
      return done(`Regel für \`/${key.replace(/\./g, ' ')}\`: **${perms.MODES[o.getString('modus')]}**`);
    }

    case 'befehle': {
      const groupsByKey = [...perms.registry.entries()];
      const lines = groupsByKey.map(([k, v]) => {
        const mode = perms.ruleFor(g, k);
        const who = mode === 'standard' ? v.groups.map((x) => (x === 'everyone' ? 'Alle' : perms.GROUPS[x] || x)).join(', ') : `**${perms.MODES[mode]}**`;
        return `\`/${k.replace(/\./g, ' ')}\` – ${who}`;
      });
      const embeds = util.chunk(lines, 30).slice(0, 10).map((c, i) => theme.base(g, 'primary', `Seite ${i + 1}`).setTitle(i ? null : `${E.shield} Befehlsberechtigungen`).setDescription(c.join('\n')));
      return theme.reply(interaction, { embeds: embeds.slice(0, 10) });
    }

    case 'erlc': {
      const changes = [];
      if (o.getInteger('intervall') !== null) { settings.set(g, 'erlc.refreshSeconds', o.getInteger('intervall')); statusPanel.start(interaction.client); changes.push(`Aktualisierung alle **${o.getInteger('intervall')} s**`); }
      if (o.getBoolean('code_oeffentlich') !== null) { settings.set(g, 'erlc.showCode', o.getBoolean('code_oeffentlich')); changes.push(`Servercode öffentlich: **${o.getBoolean('code_oeffentlich') ? 'Ja' : 'Nein'}**`); }
      const link = o.getString('beitrittslink');
      if (link !== null) {
        if (link === '-') { settings.set(g, 'erlc.joinLink', null); changes.push('Beitrittslink entfernt (Button zeigt den Code)'); }
        else if (!util.isUrl(link)) return theme.replyError(interaction, 'Der Beitrittslink muss mit https:// beginnen.');
        else { settings.set(g, 'erlc.joinLink', link); changes.push(`Beitrittslink: ${link}`); }
      }
      return changes.length ? done(changes.join('\n')) : theme.replyError(interaction, 'Bitte mindestens eine Option angeben.');
    }

    case 'session': {
      const changes = [];
      if (o.getInteger('mindestspieler') !== null) { settings.set(g, 'session.minPlayers', o.getInteger('mindestspieler')); changes.push(`Standard-Mindestspieler: **${o.getInteger('mindestspieler')}**`); }
      if (o.getInteger('voll_ab') !== null) { settings.set(g, 'session.fullThreshold', o.getInteger('voll_ab')); changes.push(`„Fast voll“ ab **${o.getInteger('voll_ab')} %**`); }
      return changes.length ? done(changes.join('\n') + '\n-# Texte, Regeln und Anforderungen: `/session customize`') : theme.replyError(interaction, 'Bitte mindestens eine Option angeben. Texte bearbeitest du mit `/session customize`.');
    }

    case 'vorlage': {
      const key = o.getString('vorlage');
      const t = texts.TEMPLATES[key];
      if (!t) return theme.replyError(interaction, 'Diese Vorlage gibt es nicht.');
      const modal = new ModalBuilder().setCustomId(`cfg:tpl:${key}`).setTitle(util.truncate(t.label, 45)).addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('text').setLabel(util.truncate(`Platzhalter: ${t.vars || 'keine'}`, 45)).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1800)
          .setValue(texts.get(g, key)).setPlaceholder('Leer lassen = Standardtext wiederherstellen'),
      ));
      return interaction.showModal(modal);
    }

    case 'allgemein': {
      const changes = [];
      if (o.getString('name')) { settings.set(g, 'brand.name', o.getString('name')); changes.push(`Name: **${util.clean(o.getString('name'))}**`); }
      const logo = o.getString('logo');
      if (logo !== null) {
        if (logo === '-') { settings.set(g, 'brand.icon', null); changes.push('Logo entfernt'); }
        else if (!util.isUrl(logo)) return theme.replyError(interaction, 'Die Logo-URL muss mit https:// beginnen.');
        else { settings.set(g, 'brand.icon', logo); changes.push('Logo aktualisiert'); }
      }
      return changes.length ? done(changes.join('\n')) : theme.replyError(interaction, 'Bitte mindestens eine Option angeben.');
    }

    case 'verifizierung':
    case 'moderation':
    case 'bewerbungen':
    case 'community': {
      const map = {
        mindestalter: ['verify.minAccountDays', 'Mindestalter (Tage)'], captcha: ['verify.captcha', 'Rechenaufgabe'],
        grund_pflicht: ['mod.requireReason', 'Grund verpflichtend'], dm: ['mod.dmUsers', 'Privatnachricht an Betroffene'],
        wartezeit: ['applications.cooldownDays', 'Wartezeit nach Ablehnung (Tage)'],
        willkommen: ['welcome.enabled', 'Willkommensnachrichten'], abschied: ['goodbye.enabled', 'Abschiedsnachrichten'],
        level: ['level.enabled', 'Level-System'], level_meldung: ['level.announce', 'Level-Aufstiege ankündigen'],
      };
      const changes = [];
      for (const opt of interaction.options.data[0].options || []) {
        const [key, label] = map[opt.name];
        settings.set(g, key, opt.value);
        changes.push(`${label}: **${typeof opt.value === 'boolean' ? (opt.value ? 'Ja' : 'Nein') : opt.value}**`);
      }
      return changes.length ? done(changes.join('\n')) : theme.replyError(interaction, 'Bitte mindestens eine Option angeben.');
    }
    default: return theme.replyError(interaction, 'Unbekannter Unterbefehl.');
  }
}

function overview(guild) {
  const g = guild.id;
  const ch = Object.entries(settings.CHANNEL_TYPES).map(([k, n]) => `${n}: ${settings.get(g, `channels.${k}`) ? `<#${settings.get(g, `channels.${k}`)}>` : '–'}`);
  const roles = Object.entries(settings.ROLE_TYPES).map(([k, n]) => `${n}: ${settings.role(g, k) ? `<@&${settings.role(g, k)}>` : '–'}`);
  const groups = Object.entries(perms.GROUPS).map(([k, n]) => `${n}: ${perms.rolesOf(g, k).map((r) => `<@&${r}>`).join(' ') || (k === 'admin' ? 'Discord-Administratoren' : '–')}`);
  const rules = all('SELECT key, mode FROM command_rules WHERE guild_id = ?', g);
  return [
    theme.base(g, 'primary').setTitle(`${E.tools} Konfiguration`).addFields(
      { name: 'Kanäle', value: ch.join('\n').slice(0, 1024) },
      { name: 'Rollen', value: roles.join('\n').slice(0, 1024) },
      { name: 'Berechtigungsgruppen', value: groups.join('\n').slice(0, 1024) },
    ),
    theme.base(g, 'primary').addFields(
      { name: 'ER:LC', value: `API-Schlüssel: ${process.env.ERLC_API_KEY ? 'hinterlegt ✅' : 'fehlt ❌'}\nAktualisierung: alle ${settings.get(g, 'erlc.refreshSeconds')} s\nServercode öffentlich: ${settings.get(g, 'erlc.showCode') ? 'Ja' : 'Nein'}\nBeitrittslink: ${settings.get(g, 'erlc.joinLink') || '–'}`, inline: true },
      { name: 'Sessions', value: `Mindestspieler: ${settings.get(g, 'session.minPlayers')}\n„Fast voll“ ab: ${settings.get(g, 'session.fullThreshold')} %`, inline: true },
      { name: 'Sonstiges', value: `Verifizierung: ${settings.get(g, 'verify.minAccountDays')} Tage Mindestalter, Captcha ${settings.get(g, 'verify.captcha') ? 'an' : 'aus'}\nModeration: Grund ${settings.get(g, 'mod.requireReason') ? 'Pflicht' : 'optional'}, DM ${settings.get(g, 'mod.dmUsers') ? 'an' : 'aus'}\nBewerbungs-Wartezeit: ${settings.get(g, 'applications.cooldownDays')} Tage\nLevel: ${settings.get(g, 'level.enabled') ? 'an' : 'aus'}` },
      { name: 'Befehls-Ausnahmen', value: rules.length ? rules.map((r) => `\`/${r.key.replace(/\./g, ' ')}\` → ${perms.MODES[r.mode]}`).join('\n').slice(0, 1024) : 'Keine' },
    ),
  ];
}

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const q = focused.value.toLowerCase();
  if (focused.name === 'befehl') {
    const keys = new Set();
    for (const k of perms.registry.keys()) { keys.add(k.split('.')[0]); keys.add(k); }
    return interaction.respond([...keys].filter((k) => k.includes(q) && !['config', 'setup', 'resetconfig'].includes(k.split('.')[0])).slice(0, 25).map((k) => ({ name: `/${k.replace(/\./g, ' ')}${k.includes('.') ? '' : ' (alle Unterbefehle)'}`, value: k })));
  }
  if (focused.name === 'vorlage') {
    return interaction.respond(Object.entries(texts.TEMPLATES).filter(([k, t]) => k.includes(q) || t.label.toLowerCase().includes(q)).slice(0, 25).map(([k, t]) => ({ name: t.label, value: k })));
  }
  return interaction.respond([]);
}

module.exports = { data, perms: { '*': ['admin'] }, execute, autocomplete, overview };
