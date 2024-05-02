const Augur = require("augurbot"),
  sf = require('../config/snowflakes.json'),
  { GoogleSpreadsheet } = require("google-spreadsheet"),
  config = require("../config/config.json"),
  discord = require('discord.js'),
  perms = require('../utils/perms'),
  u = require("../utils/utils");
/**
 * @typedef equipableRole
 * @prop {string} id
 * @prop {string} baseRole
 * @prop {string} inherited
 * @prop {boolean} keepInherited
 * @prop {"EQUIP"|"ADD"} type
 */
/** @type {discord.Collection<string, equipableRole>} */
let roles = new u.Collection();
/** @param {discord.GuildMember} member */
function getInventory(member) {
  return roles.filter(r => r.type == 'EQUIP' && member.roles.cache.find(ro => ro.id == r.baseRole || r.inherited.includes(ro.id)));
}
/** @param {discord.GuildMember} member */
function addableRoles(member) {
  const addRoles = roles.filter(r => r.type == 'ADD');
  const have = member.roles.cache.filter(r => addRoles.find(ar => r.id == ar.id));
  const others = addRoles.filter(ar => !member.roles.cache.find(r => r.id == ar.id));
  return { have, others };
}
/** @param {discord.CommandInteraction} int */
async function equip(int) {
  const allColors = roles.filter(r => r.type == 'EQUIP').map(r => r.id);
  const available = getInventory(int.member);
  const input = int.options.getRole('role');
  if (!input) {
    await int.member.roles.remove(allColors);
    return int.reply({ content: "Color role removed!", ephemeral: true });
  }
  const role = int.guild.roles.cache.get(roles.find(a => a.type == 'EQUIP' && (a.baseRole == input.id || a.id == input.id))?.id);

  if (!role) {
    return int.reply({ content: "sorry, that's not a color role on this server. Check `/role inventory` to see what you can equip.", ephemeral: true });
  } else if (!available.has(role.id)) {
    return int.reply({ content: "sorry, you don't have that color in your inventory. Check `/role inventory` to see what you can equip.", ephemeral: true });
  } else {
    await int.member.roles.remove(allColors);
    await int.member.roles.add(role.id);
    int.reply({ content: "Color applied!", ephemeral: true });
  }
}
/** @param {discord.CommandInteraction} int */
async function inventory(int) {
  const member = int.member;
  const inv = getInventory(int.member).map(color => int.guild.roles.cache.get(color.id)).sort((a, b) => b.comparePositionTo(a));
  const embed = u.embed().setAuthor({ name: member.displayName, iconURL: member.displayAvatarURL({ size: 32 }) })
    .setTitle("Equippable Color Inventory")
    .setDescription(`Equip a color role with \`/equip Role Name\`\ne.g. \`/equip novice\`\n\n${inv.join("\n")}`);

  if (inv.length == 0) int.reply({ content: "You don't have any colors in your inventory!", ephemeral: true });
  else int.reply({ embeds: [embed], allowedMentions: { parse: [] }, ephemeral: true });
}
/** @param {discord.CommandInteraction} int */
async function addRole(int) {
  if (int.options.getBoolean('list')) {
    const userRoles = addableRoles(int.member, false);
    const embed = u.embed().setTitle("Self-Addable Roles")
      .setAuthor({ name: int.member.displayName, iconURL: int.member.displayAvatarURL() });
    if (userRoles.others.size > 0) embed.setDescription(userRoles.others.map(r => `<@&${r.id}>`).join('\n'));
    if (userRoles.have.size > 0) embed.addFields({ name: "You already have these roles:", value: userRoles.have.map(r => `<@&${r.id}>`).join('\n') });
    return int.reply({ embeds: [embed], ephemeral: true });
  }
  const role = int.options.getRole('role');
  const member = int.member;
  const addRoles = roles.filter(r => r.type == 'ADD').map(r => int.guild.roles.cache.get(r.id));
  const foundRole = addRoles.find(r => r.id == role.id);
  if (sf.adminId.includes(int.member.id)) {
    try {
      if (member.roles.cache.has(role.id)) return int.reply({ content: "You already have that role!", ephemeral: true });
      await member.roles.add(role);
      return int.reply({ content: "Role added", ephemeral: true });
    } catch (e) {
      return int.reply({ content: "I couldn't add that role.", ephemeral: true });
    }
  } else if (foundRole) {
    if (member.roles.cache.has(foundRole.id)) return int.reply({ content: "You already have that role!", ephemeral: true });
    await member.roles.add(foundRole.id);
    int.reply({ content: `I gave you the ${foundRole} role`, ephemeral: true });
  } else {
    int.reply({ content: "you didn't give me a valid role to apply.", ephemeral: true });
  }
}
/** @param {discord.CommandInteraction} int */
async function removeRole(int) {
  if (int.options.getBoolean('list')) {
    const userRoles = addableRoles(int.member, false);
    if (userRoles.have.size == 0) return int.reply({ content: "You don't have any removable roles right now. Try adding some with /role add" });
    const embed = u.embed().setTitle("Removable Roles")
      .setAuthor({ name: int.member.displayName, iconURL: int.member.displayAvatarURL() })
      .setDescription(userRoles.have.map(r => `<@&${r.id}>`).join('\n'));
    return int.reply({ embeds: [embed], ephemeral: true });
  }
  const role = int.options.getRole('role');
  const member = int.member;
  const addRoles = roles.filter(r => r.type == 'ADD').map(r => int.guild.roles.cache.get(r.id));
  const foundRole = addRoles.find(r => r.id == role.id);
  const color = roles.find(r => r.baseRole == role.id && r.type == 'EQUIP');
  if (sf.adminId.includes(int.member.id)) {
    try {
      if (!member.roles.cache.has(role.id)) return int.reply({ content: "You don't have that role!", ephemeral: true });
      await member.roles.remove([role.id, color?.id ?? null].filter(r => r != null));
      return int.reply({ content: "Role removed", ephemeral: true });
    } catch (e) {
      return int.reply({ content: "I couldn't remove that role.", ephemeral: true });
    }
  } else if (foundRole) {
    if (!member.roles.cache.has(foundRole.id)) return int.reply({ content: "You don't have that role!", ephemeral: true });
    await member.roles.remove([foundRole.id, color?.id ?? null].filter(r => r != null));
    int.reply({ content: `I took away the ${foundRole} role`, ephemeral: true });
  } else {
    int.reply({ content: "you didn't give me a valid role to remove.", ephemeral: true });
  }
}
/** @param {discord.CommandInteraction} int */
async function whohas(int) {
  const role = int.options.getRole('role');
  if (role && role.members.size > 0) int.reply({ content: `Members with the ${role.name} role:\n${role.members.map(m => m.toString()).join("\n")}\n`, ephemeral: true });
  else int.reply({ content: "I couldn't find any members with that role. :shrug:", ephemeral: true });
}
/** @param {discord.CommandInteraction} int */
async function roleID(int) {
  const role = int.options.getRole('role');
  return int.reply({ content: `\`\`\`${role.name}: ${role.id}\`\`\``, ephemeral: true });
}
/** @param {discord.CommandInteraction} int */
async function adulting(int) {
  if (!perms.isMod(int)) return int.reply({ content: "This sub-command can only be used by mods." });
  const target = int.options.getMember('user');
  const remove = int.options.getBoolean('remove');
  const hasRole = target.roles.cache.has(sf.roles.adulting);
  if (!remove && hasRole) return int.reply({ content: `${target} already has the adulting role.`, ephemeral: true });
  if (remove && !hasRole) return int.reply({ content: `${target} doesn't have the adulting role yet`, ephemeral: true });
  await target.roles[remove ? "remove" : "add"](sf.roles.adulting).catch(() => int.reply({ content: `I couldn't ${remove ? "remove the role from" : "apply the role to"} ${target}`, ephemeral: true }));
  if (!int.replied) int.reply({ content: `${target} is ${remove ? "no longer" : "now"} an adult`, ephemeral: true });
}
const Module = new Augur.Module()
.addInteractionCommand({ name: "role",
  commandId: sf.commands.slashRoles,
  process: async (int) => {
    switch (int.options.getSubcommand()) {
    case "add": return addRole(int);
    case "adulting": return adulting(int);
    case "remove": return removeRole(int);
    case "equip": return equip(int);
    case "inventory": return inventory(int);
    case "whohas": return whohas(int);
    case "id": return roleID(int);
    }
  }
})
.addEvent("guildMemberUpdate", async (oldMember, newMember) => {
  if (newMember.guild.id == sf.ldsg) {
    if (newMember.roles.cache.size > oldMember.roles.cache.size) {
      // Role added
      try {
        if ((Date.now() - newMember.joinedTimestamp) > 45000) {
          // Check equippables if they're not auto-applying on rejoin
          const newInventory = getInventory(newMember);
          const oldInventory = getInventory(oldMember);
          const diff = newInventory.filter(r => !oldInventory.has(r.id));
          if (diff.size > 0) {
            newMember.send(`You have new color-equippable ${diff.size > 1 ? "roles" : "role"} ${diff.map(r => `**${newMember.guild.roles.cache.get(r.id).name}**`).join(", ")}! You can equip the colors with the \`/role equip\` command. Check \`/role inventory\` command in #bot-lobby to see what colors you can equip.`).catch(u.noop);
          }
        }
        await Module.db.user.updateRoles(newMember);
      } catch (error) { u.errorHandler(error, "Update Roles on Role Add"); }
    } else if (newMember.roles.cache.size < oldMember.roles.cache.size) {
      // Role removed
      try {
        const newInventory = getInventory(newMember);
        const oldInventory = getInventory(oldMember);
        const diff = oldInventory.filter(r => !newInventory.has(r.id));
        if (diff.size > 0) await newMember.roles.remove(diff.map(r => r.id));
        await Module.db.user.updateRoles(newMember);
      } catch (error) { u.errorHandler(error, "Update Roles on Role Remove"); }
    }
  }
})
.setInit(async () => {
  try {
    const doc = new GoogleSpreadsheet(config.google.sheets.config);
    await doc.useServiceAccountAuth(config.google.creds);
    await doc.loadInfo();
    const channels = await doc.sheetsByTitle["Roles"].getRows();
    roles = new u.Collection(channels.map(r => [r['Color Role ID'], { id: r['Color Role ID'], baseRole: r['Base Role ID'], inherited: r['Parent Roles']?.split(', ') ?? [], keepInherited: Boolean(r['Keep Other Roles']), type: r['Type'] }])).filter(r => r.id != "");
  } catch (e) { u.errorHandler(e, "Load Color & Equip Roles"); }
});

module.exports = Module;