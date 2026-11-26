// Buttons des ER:LC-Moduls (Statuspanel, Bestätigungen)
const { MessageFlags } = require('discord.js');
const theme = require('../core/theme');
const perms = require('../core/permissions');
const erlc = require('../systems/erlcManager');
const views = require('../systems/erlcViews');
const pending = require('../systems/pending');

async function handle(interaction, action, args) {
  const g = interaction.guildId;

  if (action === 'panelplayers') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try { return interaction.editReply({ embeds: [views.playersEmbed(g, await erlc.server(['Players'], 30000))] }); } catch (err) { return interaction.editReply({ embeds: [views.errorEmbed(g, err)] }); }
  }

  if (action === 'panelcode') {
    if (!views.showCode(g) && !perms.isStaff(interaction.member)) return theme.replyError(interaction, 'Der Servercode ist derzeit nicht öffentlich.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const d = await erlc.server([], 60000);
      return interaction.editReply({ embeds: [theme.info(g, `Servercode: **\`${d.JoinKey}\`**\nIn ER:LC: **Server** → **Privaten Server beitreten** → Code eingeben.`, `${theme.E.code} Servercode`)] });
    } catch (err) { return interaction.editReply({ embeds: [views.errorEmbed(g, err)] }); }
  }

  if (action === 'confirm' || action === 'cancel') {
    const data = pending.get(args[0]);
    if (!data) return interaction.update({ embeds: [theme.error(g, 'Diese Bestätigung ist abgelaufen. Bitte den Befehl erneut ausführen.')], components: [] });
    if (data.user !== interaction.user.id) return theme.replyError(interaction, 'Nur die Person, die den Befehl ausgeführt hat, kann ihn bestätigen.');
    pending.take(args[0]);
    if (action === 'cancel') return interaction.update({ embeds: [theme.info(g, 'Vorgang abgebrochen.')], components: [] });
    // Berechtigung erneut prüfen (Rollen könnten sich geändert haben)
    const key = data.cmd.startsWith(':ban ') ? 'erlc.ban' : 'erlc.befehl';
    const check = perms.check(interaction.member, key);
    if (!check.ok) return interaction.update({ embeds: [theme.error(g, check.reason)], components: [] });
    await interaction.update({ embeds: [theme.info(g, `${theme.E.queue} Befehl wird an den ER:LC-Server gesendet …`)], components: [] });
    return views.runCommand(interaction, data.cmd, data.text);
  }
}

module.exports = { prefix: 'erlc', handle };
