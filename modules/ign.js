const Augur = require("augurbot");
const u = require("../utils/utils");
const discord = require('discord.js');
const config = require('../config/config.json');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const sf = require("../config/snowflakes.json");
/** @type {discord.Collection<string, ign>} */
let IGNs = new u.Collection();
const findIGN = (system) => IGNs.find(i => i.system == system || i.aliases.includes(system));
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
  const mapped = systems.map(s => findIGN(s)).filter(s => s != null);
  if (mapped.length == 0) return null;
  for (const category of categories) {
    const sys = mapped.filter(s => s.category == category)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((system, i) => {
        if (i > 24) return;
        let name = igns.find(ign => ign.system == system.system)?.ign;
        console.log(name);
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
  system = system?.toLowerCase().split(' ');
  const igns = await Module.db.ign.find(user.id, system);
  const embed = createIgnEmbed(user, Array.isArray(igns) ? igns : [igns], system ?? igns.map(i => i.system));

  if (embed) {
    interaction.reply({ embeds: [embed] });
  } else {
    interaction.reply({ content: `It looks like ${user.displayName} hasn't saved this information with \`/ign add\` yet.`, ephemeral: true });
  }

}
/** @param {discord.CommandInteraction} interaction */
async function slashIgnSet(interaction) {
  let system = interaction.options.getString("system").toLowerCase();
  let ign = interaction.options.getString("ign").toLowerCase();
  const findSystem = findIGN(system);
  if (findSystem) system = findSystem.system;
  if (!findSystem) return interaction.reply({ content: `\`${system}\` isn't a recognized system.`, ephemeral: true });
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
  const findSystem = findIGN(system);
  if (findSystem) {
    system = findSystem.system;
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
  const findSystem = findIGN(system);
  if (!findSystem) return interaction.reply({ content: `\`${system}\` isn't a valid system.`, ephemeral: true });
  system = findSystem?.system;
  const users = await Module.db.ign.getList(system);
  if (users.length == 0) return interaction.reply({ content: `No members have saved an IGN for ${findSystem.name} yet.` });
  const guild = interaction.guild;
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

  interaction.reply({ content: `__**The following members have saved an IGN for ${findSystem.name}:**__\n` + listChunks[0].join("\n") });
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
    }
  }
})
.setInit(async () => {
  const doc = new GoogleSpreadsheet(config.google.sheets.config);
  try {
    await doc.useServiceAccountAuth(config.google.creds);
    await doc.loadInfo();
    const aliases = await doc.sheetsByTitle["IGN Aliases"].getRows();
    IGNs = new u.Collection(aliases.map(x => [x["System"], { system: x["System"], name: x["Name"], aliases: x["Aliases"].split(','), category: x["Category"] ?? "Game Platforms", link: x["Link"] }]));
  } catch (e) { u.errorHandler(e, "Load IGN Aliases"); }
});

module.exports = Module;
