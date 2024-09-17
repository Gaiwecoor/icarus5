const Discord = require("discord.js");

const Ign = require("../models/Ign.model");

module.exports = {
  /**
   * @typedef ign
   * @prop {string} discordId The ID of the user
   * @prop {string} system The system of the IGN
   * @prop {string} ign The saved value of the IGN
   */

  /**
   * Delete an IGN
   * @function delete
   * @param {string|Discord.User|Discord.GuildMember} discordId Which user's IGN to delete
   * @param {string} system Which system IGN to delete
   * @returns {Promise<ign>}
   */
  delete: function(discordId, system) {
    if (discordId.id) discordId = discordId.id;
    return Ign.findOneAndRemove({ discordId, system }).exec();
  },
  /**
   * Find an IGN
   * @function find
   * @param {string|Discord.User|Discord.GuildMember} discordId Which user's IGN to find
   * @param {(string)} system Which system IGN to find
   * @returns {Promise<Array<ign>|ign>}
   */
  find: function(discordId, system) {
    if (discordId.id) discordId = discordId.id;
    if (Array.isArray(system)) return Ign.find({ discordId, system: { $in: system } }).exec();
    else if (Array.isArray(discordId)) return Ign.find({ discordId: { $in: discordId }, system }).exec();
    else if (system) return Ign.findOne({ discordId, system }).exec();
    else return Ign.find({ discordId }).exec();
  },
  /**
   * Find a list of users
   * @param {string} ign The IGN to find
   * @param {string} system Which system IGN to find
   * @returns {Promise<Array<ign>>}
   */
  findUsername: function(ign, system) {
    return Ign.find({ ign: { $regex: new RegExp(`^${ign}$`, 'i') }, system }).exec();
  },
  /**
   * Find a list of IGNs for a given system
   * @function getList
   * @param {string} system Which system list to fetch
   * @returns {Promise<Array<ign>>}
   */
  getList: function(system) {
    return Ign.find({ system }).exec();
  },
  /**
   * Save a user's IGN
   * @function save
   * @param {string|Discord.User|Discord.GuildMember} discordId Which user's IGN to save
   * @param {string} system Which system IGN to save
   * @param {string} ign The IGN to save
   * @returns {Promise<ign>}
   */
  save: function(discordId, system, ign) {
    if (discordId.id) discordId = discordId.id;
    return Ign.findOneAndUpdate(
      { discordId, system },
      { $set: { ign } },
      { upsert: true, new: true }
    ).exec();
  }
};
