// Buttons/Formulare: Vorschläge, Umfragen, Gewinnspiele, Rollen-Panels, Infopanels, Textbausteine
const { MessageFlags } = require('discord.js');
const theme = require('../core/theme');
const perms = require('../core/permissions');
const util = require('../core/util');
const { one, run, now } = require('../core/database');
const cm = require('../systems/community');

async function handle(interaction, action, args) {
  const g = interaction.guildId;
  const prefix = interaction.customId.split(':')[0];

  if (prefix === 'sugg') {
    const s = one('SELECT * FROM suggestions WHERE id = ?', Number(args[0]));
    if (!s) return theme.replyError(interaction, 'Dieser Vorschlag existiert nicht mehr.');
    const vote = action === 'up' ? 1 : -1;
    const ex = one('SELECT vote FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?', s.id, interaction.user.id);
    if (ex?.vote === vote) run('DELETE FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?', s.id, interaction.user.id);
    else run('INSERT OR REPLACE INTO suggestion_votes (suggestion_id, user_id, vote) VALUES (?,?,?)', s.id, interaction.user.id, vote);
    const author = await interaction.client.users.fetch(s.user_id).catch(() => null);
    return interaction.update(cm.suggestionPayload(g, s, author));
  }

  if (prefix === 'poll') {
    const p = one('SELECT * FROM polls WHERE id = ?', Number(args[0]));
    if (!p || p.ended) return theme.replyError(interaction, 'Diese Umfrage ist beendet.');
    if (action === 'end') {
      if (p.author_id !== interaction.user.id && !perms.inGroup(interaction.member, 'moderation')) return theme.replyError(interaction, 'Nur die Person, die die Umfrage erstellt hat, oder das Team kann sie beenden.');
      run('UPDATE polls SET ended = 1, ends_at = ? WHERE id = ?', now(), p.id);
      return interaction.update(cm.pollPayload(g, one('SELECT * FROM polls WHERE id = ?', p.id)));
    }
    const idx = Number(args[1]);
    const has = one('SELECT 1 FROM poll_votes WHERE poll_id = ? AND user_id = ? AND option_index = ?', p.id, interaction.user.id, idx);
    if (has) run('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ? AND option_index = ?', p.id, interaction.user.id, idx);
    else {
      if (!p.multi) run('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?', p.id, interaction.user.id);
      run('INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?,?,?)', p.id, interaction.user.id, idx);
    }
    await interaction.update(cm.pollPayload(g, p));
    return interaction.followUp({ embeds: [theme.success(g, has ? 'Deine Stimme wurde zurückgezogen.' : `Du hast für **${JSON.parse(p.options)[idx]}** gestimmt.`)], flags: MessageFlags.Ephemeral });
  }

  if (prefix === 'gw') {
    const gw = one('SELECT * FROM giveaways WHERE id = ?', Number(args[0]));
    if (!gw || gw.ended) return theme.replyError(interaction, 'Dieses Gewinnspiel ist beendet.');
    if (gw.required_role && !interaction.member.roles.cache.has(gw.required_role)) return theme.replyError(interaction, `Für die Teilnahme benötigst du die Rolle <@&${gw.required_role}>.`);
    const has = one('SELECT 1 FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?', gw.id, interaction.user.id);
    if (has) run('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?', gw.id, interaction.user.id);
    else run('INSERT INTO giveaway_entries (giveaway_id, user_id) VALUES (?,?)', gw.id, interaction.user.id);
    await interaction.update(cm.giveawayPayload(g, gw));
    return interaction.followUp({ embeds: [theme.success(g, has ? 'Du nimmst nicht mehr teil.' : 'Du nimmst am Gewinnspiel teil. Viel Glück! 🍀')], flags: MessageFlags.Ephemeral });
  }

  if (prefix === 'rr') {
    const [panelId, roleId] = args;
    const entry = one('SELECT * FROM role_panel_roles WHERE panel_id = ? AND role_id = ?', Number(panelId), roleId);
    if (!entry) return theme.replyError(interaction, 'Diese Rolle ist nicht mehr verfügbar.');
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role || role.position >= interaction.guild.members.me.roles.highest.position) return theme.replyError(interaction, 'Ich kann diese Rolle nicht vergeben. Bitte informiere das Team.');
    const has = interaction.member.roles.cache.has(roleId);
    try { if (has) await interaction.member.roles.remove(roleId, 'Rollen-Panel'); else await interaction.member.roles.add(roleId, 'Rollen-Panel'); } catch { return theme.replyError(interaction, 'Die Rolle konnte nicht geändert werden.'); }
    return theme.replySuccess(interaction, has ? `Die Rolle <@&${roleId}> wurde entfernt.` : `Du hast jetzt die Rolle <@&${roleId}>.`);
  }

  if (prefix === 'info') {
    if (!perms.inGroup(interaction.member, 'management')) return theme.replyError(interaction, 'Dafür fehlt dir die Berechtigung.');
    const title = interaction.fields.getTextInputValue('titel').trim();
    const content = interaction.fields.getTextInputValue('inhalt').trim();
    const image = interaction.fields.getTextInputValue('bild').trim() || null;
    if (image && !util.isUrl(image)) return theme.replyError(interaction, 'Die Bild-URL muss mit https:// beginnen.');
    if (args[0] === 'new') {
      const id = run('INSERT INTO info_panels (guild_id, title, content, image_url, channel_id, created_at) VALUES (?,?,?,?,?,?)', g, title, content, image, interaction.channelId, now()).lastInsertRowid;
      const msg = await interaction.channel.send(cm.infoPanelPayload(g, one('SELECT * FROM info_panels WHERE id = ?', id))).catch(() => null);
      if (!msg) { run('DELETE FROM info_panels WHERE id = ?', id); return theme.replyError(interaction, 'Ich kann in diesem Kanal nicht schreiben.'); }
      run('UPDATE info_panels SET message_id = ? WHERE id = ?', msg.id, id);
      return theme.replySuccess(interaction, `Infopanel #${id} wurde erstellt.`);
    }
    const p = one('SELECT * FROM info_panels WHERE id = ?', Number(args[0]));
    if (!p) return theme.replyError(interaction, 'Dieses Panel gibt es nicht mehr.');
    run('UPDATE info_panels SET title = ?, content = ?, image_url = ? WHERE id = ?', title, content, image, p.id);
    try { const ch = await interaction.client.channels.fetch(p.channel_id); await (await ch.messages.fetch(p.message_id)).edit(cm.infoPanelPayload(g, one('SELECT * FROM info_panels WHERE id = ?', p.id))); } catch { return theme.replyError(interaction, 'Gespeichert, aber die Nachricht wurde nicht gefunden.'); }
    return theme.replySuccess(interaction, 'Das Infopanel wurde aktualisiert.');
  }

  if (prefix === 'tag') {
    if (!perms.inGroup(interaction.member, 'management')) return theme.replyError(interaction, 'Dafür fehlt dir die Berechtigung.');
    run(`INSERT INTO custom_commands (guild_id, name, content, author_id, created_at) VALUES (?,?,?,?,?)
         ON CONFLICT(guild_id, name) DO UPDATE SET content = excluded.content`, g, args[0], interaction.fields.getTextInputValue('text'), interaction.user.id, now());
    return theme.replySuccess(interaction, `Textbaustein \`${args[0]}\` gespeichert. Nutzen mit \`/textbaustein senden name:${args[0]}\`.`);
  }
}

module.exports = { prefix: ['sugg', 'poll', 'gw', 'rr', 'info', 'tag'], handle };
