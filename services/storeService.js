const StoreSettings = require("../models/StoreSettings");
const defaults = require("../config/store");

// Store-level settings live in Mongo (editable in admin). config/store.js is
// only the fallback for a merchant that hasn't been seeded yet.
async function getSettings(merchantId) {
  const doc = await StoreSettings.findOne({ merchantId });
  if (doc) return doc;
  return new StoreSettings({ merchantId, ...defaults });
}

module.exports = { getSettings };
