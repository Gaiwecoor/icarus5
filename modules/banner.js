// This module deals with setting server banners for the holidays.

const u = require("../utils/utils"),
  sf = require("../config/snowflakes.json"),
  config = require("../config/config.json"),
  Augur = require("augurbot"),
  { GoogleSpreadsheet } = require("google-spreadsheet");

let banners = new u.Collection();

const Module = new Augur.Module()
.setInit(async () => {
  const doc = new GoogleSpreadsheet(config.google.sheets.config);
  try {
    await doc.useServiceAccountAuth(config.google.creds);
    await doc.loadInfo();
    const getBanners = await doc.sheetsByTitle["Banners"].getRows();
    banners = new u.Collection(getBanners.map(x => [x["Date"], x["URL"]]));
  } catch (e) { u.errorHandler(e, "Load Banners"); }
})
.setClockwork(() => {
  setInterval(() => {
    const date = new Date();
    const stringDate = `${date.getMonth() + 1}/${date.getDate()}`;
    const banner = banners.get(stringDate);
    if (banner) {
      const ldsg = Module.client.guilds.cache.get(sf.ldsg);
      ldsg.setBanner(banner);
    }
  }, 1000 * 60 * 60 * 24);
});

module.exports = Module;
