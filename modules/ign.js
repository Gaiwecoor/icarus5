const Augur = require("augurbot");
const u = require("../utils/utils");
const discord = require('discord.js');
const config = require('../config/config.json');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const sf = require("../config/snowflakes.json");

/** @type {discord.Collection<string, ign>} */
let IGNs = new u.Collection();
let aliases = new u.Collection();

const findSystem = (system) => IGNs.get(system?.toLowerCase()) || IGNs.get(aliases.get(system?.toLowerCase()));
const categories = [
  "Game Platforms",
  "Streaming",
  "Social",
  "Personal"
];

/**
 * @typedef ign
 * @prop {string} system
 * @prop {string[]} aliases
 * @prop {string} name
 * @prop {string} category
 * @prop {string} link
 */

/**
 * Creates and formats the embed for the IGN system.
 * @param {discord.GuildMember} user The member that we're displaying the command for.
 * @param {string[]} systems A mapping of system: username/ign
 * @returns {discord.MessageEmbed} the embed to send
 */
function createIgnEmbed(user, igns, systems) {
  const embed = u.embed().setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL });
  if (systems.length == 0) return null;
  if (systems.length > 1) { embed.setTitle('IGNs for ' + u.escapeText(user.displayName)); }
  const hasLink = /(http(s?):\/\/)?(\w+\.)+\w+\//ig;
  const mapped = systems.map(s => findSystem(s)).filter(s => s != null);
  if (mapped.length == 0) return null;
  for (const category of categories) {
    const sys = mapped.filter(s => s.category == category)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((system, i) => {
        if (i > 24) return null;
        let name = igns.find(ign => ign.system == system.system)?.ign;
        if (!name) return null;
        if (name.length > 100) name = name.substr(0, 100) + " ...";
        if (system.link && !hasLink.test(name)) name = `[${name}](${system.link.replace(/{ign}/ig, encodeURIComponent(name))})`;
        embed.addField(`${system.name}`, `${name}`, true);
      });
    sys;
  }
  return embed.fields.length > 0 ? embed : null;
}

/** @param {discord.CommandInteraction} interaction */
async function slashIgnView(interaction) {
  const user = interaction.options.getMember("target", false) || interaction.member;
  let system = interaction.options.getString("system", false);
  if (findSystem(system)) system = findSystem(system).system;
  const igns = await Module.db.ign.find(user.id, system);

  const embed = createIgnEmbed(user, Array.isArray(igns) ? igns : [igns].filter(i => i != null), system ? [system] : igns.map(i => i.system));

  if (embed) {
    interaction.reply({ embeds: [embed] });
  } else {
    interaction.reply({ content: `It looks like ${user.displayName} hasn't saved this information with \`/ign add\` yet.`, ephemeral: true });
  }
}

/** @param {discord.CommandInteraction} interaction */
async function slashIgnSet(interaction) {
  let system = interaction.options.getString("system").toLowerCase();
  let ign = interaction.options.getString("ign");
  const foundSystem = findSystem(system);
  if (foundSystem) system = foundSystem.system;
  if (!foundSystem) return interaction.reply({ content: `\`${system}\` isn't a recognized system.`, ephemeral: true });
  if (system == "birthday") {
    try {
      const bd = new Date(ign);
      if (bd == 'Invalid Date') {
        return interaction.reply({ content: "I couldn't understand that date. Please use Month Day format (e.g. Apr 1 or 4/1).", ephemeral: true });
      } else {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
        ign = `${months[bd.getMonth()]} ${bd.getDate()}`;
      }
    } catch (e) {
      return interaction.reply({ content: "I couldn't understand that date. Please use Month Day format (e.g. Apr 1 or 4/1).", ephemeral: true });
    }
  }
  const finalIgn = await Module.db.ign.save(interaction.user.id, system, ign);
  const embed = createIgnEmbed(interaction.member, [finalIgn], [system]);
  interaction.reply({ embeds: [embed], ephemeral: true });
}

/** @param {discord.CommandInteraction} interaction */
async function slashIgnRemove(interaction) {
  let system = interaction.options.getString("system").toLowerCase();
  const foundSystem = findSystem(system);
  if (foundSystem) {
    system = foundSystem.system;
    const ign = await Module.db.ign.delete(interaction.user.id, system);
    if (ign) return interaction.reply({ content: `Removed your IGN \`${ign.ign}\` for ${ign.system}.`, ephemeral: true });
    return interaction.reply({ content: `It doesn't look like you had an IGN saved for ${system}. Regardless, it's gone now.`, ephemeral: true });
  } else {
    interaction.reply({ content: "I didn't recognize the system you entered.", ephemeral: true });
  }
}

/** @param {discord.CommandInteraction} interaction */
async function slashIgnWhoplays(interaction) {
  const PAGESIZE = 60; // Entries per message for this module.
  let system = interaction.options.getString("system").toLowerCase();
  const foundSystem = findSystem(system);
  if (!foundSystem) return interaction.reply({ content: `\`${system}\` isn't a valid system.`, ephemeral: true });
  system = foundSystem?.system;
  const users = await Module.db.ign.getList(system);
  if (users.length == 0) return interaction.reply({ content: `No members have saved an IGN for ${foundSystem.name} yet.`, ephemeral: true });
  const guild = interaction.guild;
  const embed = u.embed().setTitle(`The following members have saved an IGN for ${foundSystem.name}`);
  const wePlay = users.map(user => guild.members.cache.get(user.discordId))
    .filter(usr => usr != null)
    .sort((a, b) => {
      if (system != "birthday") {
        return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
      } else {
        const aDate = new Date(a.ign);
        const bDate = new Date(b.ign);
        return aDate - bDate;
      }
    })
    .map(user => {
      const ign = users.find(usr => usr.discordId == user.id).ign;
      return `· **${u.escapeText(user.displayName)}**: ${(ign.startsWith("http") ? "<" + u.escapeText(ign) + ">" : u.escapeText(ign))}`;
    });

  const listChunks = [];
  for (let i = 0; i < wePlay.length; i += PAGESIZE) {
    listChunks.push(wePlay.slice(i, i + PAGESIZE));
  }
  embed.setDescription(listChunks[0].join('\n'));
  interaction.reply({ embeds: [embed] });
  if (listChunks.length > 1) {
    listChunks.slice(1).forEach(chunk => {
      interaction.followUp({ content: chunk.join("\n") });
    });
  }
}

/** @param {discord.CommandInteraction} interaction */
async function slashIgnWhois(interaction) {
  const PAGESIZE = 60; // Entries per message for this module.
  let system = interaction.options.getString("system").toLowerCase();
  let username = interaction.options.getString('ign');
  const foundSystem = findSystem(system);
  if (!foundSystem) return interaction.reply({ content: `\`${system}\` isn't a valid system.`, ephemeral: true });
  system = foundSystem?.system;
  if (system == 'birthday') {
    const bd = new Date(username);
    if (bd == 'Invalid Date') return interaction.reply({ content: "I couldn't understand that date. Please use Month Day format (e.g. April 1 or 4/1)", ephemeral: true });
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
    username = `${months[bd.getMonth()]} ${bd.getDate()}`;
  }
  const users = await Module.db.ign.findUsername(username, system);
  if (users.length == 0) return interaction.reply({ content: `No members have the IGN ${username} for ${foundSystem.name}.`, ephemeral: true });
  const guild = interaction.guild;
  const embed = u.embed().setTitle(`The following members have the IGN ${username} for ${foundSystem.name}`);
  const wePlay = users.map(user => guild.members.cache.get(user.discordId))
    .filter(usr => usr != null)
    .sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));

  const listChunks = [];
  for (let i = 0; i < wePlay.length; i += PAGESIZE) {
    listChunks.push(wePlay.slice(i, i + PAGESIZE));
  }
  embed.setDescription(listChunks[0].join('\n'));
  interaction.reply({ embeds: [embed] });
  if (listChunks.length > 1) {
    listChunks.slice(1).forEach(chunk => {
      interaction.followUp({ content: chunk.join("\n") });
    });
  }
}

const Module = new Augur.Module()
.addInteractionCommand({
  name: "ign",
  guildId: sf.ldsg,
  commandId: sf.commands.slashIgn,
  process: async (interaction) => {
    switch (interaction.options.getSubcommand(true)) {
    case "view": return slashIgnView(interaction);
    case "set": return slashIgnSet(interaction);
    case "remove": return slashIgnRemove(interaction);
    case "whoplays": return slashIgnWhoplays(interaction);
    case "whois": return slashIgnWhois(interaction);
    }
  }
})
.setInit(async () => {
  const doc = new GoogleSpreadsheet(config.google.sheets.config);
  try {
    await doc.useServiceAccountAuth(config.google.creds);
    await doc.loadInfo();
    const sheet = await doc.sheetsByTitle["IGN"].getRows();
    const aliasSheet = await doc.sheetsByTitle["IGN Aliases"].getRows();
    aliases = new u.Collection(aliasSheet.map(x => [x["Alias"]?.toLowerCase(), x["System"]?.toLowerCase()])).concat(new u.Collection(sheet.map(x => [x["Name"]?.toLowerCase(), x["System"]?.toLowerCase()])));
    IGNs = new u.Collection(sheet.map(x => [x["System"]?.toLowerCase(), { system: x["System"]?.toLowerCase(), name: x["Name"], category: x["Category"] || "Game Platforms", link: x["Link"] }]));
  } catch (e) { u.errorHandler(e, "Load IGN Systems"); }
})
.addEvent('interactionCreate', async interaction => {
  if (interaction.type == "APPLICATION_COMMAND_AUTOCOMPLETE" && interaction.commandId == sf.commands.slashIgn) {
    const focusedValue = interaction.options.getFocused()?.toLowerCase();
    const filtered = IGNs.filter(choice => choice.name.toLowerCase().startsWith(focusedValue)).first(25);
    await interaction.respond(filtered.map(choice => ({ name: choice.name, value: choice.name })));
  }
});

module.exports = Module;
