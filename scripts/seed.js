// Seed the demo store: settings, collections, Shopify-style catalog and users,
// then sync it to the AI assistant platform.
//
//   npm run seed            idempotent: only creates what's missing
//   npm run seed -- --reset wipes catalog, collections and carts first
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const env = require("../config/env");
const connectDB = require("../config/db");
const Product = require("../models/Product");
const Collection = require("../models/Collection");
const StoreSettings = require("../models/StoreSettings");
const Cart = require("../models/Cart");
const User = require("../models/User");
const { toDocument } = require("../services/productAdmin");
const platformSync = require("../services/platformSync");

const catalog = require("../seed/catalog.json");
const store = require("../seed/store.json");

// Dev logins — hardcoded on request; change before going live.
const SEED_USERS = [
  { name: "Vivek", username: "vivek", email: "vivek@shopsmart.local", password: "vivek5926", role: "admin" },
  { name: "Demo Shopper", username: "demo", email: "demo@shopsmart.local", password: "demo12345", role: "customer" },
];

async function main() {
  await connectDB();
  const merchantId = env.merchantId;

  if (process.argv.includes("--reset")) {
    await Promise.all([
      Product.deleteMany({ merchantId }),
      Collection.deleteMany({ merchantId }),
      Cart.deleteMany({ merchantId }),
    ]);
    console.log("Reset catalog, collections and carts");
  }
  // Pre-variant products (old schema) can't be sold any more.
  const legacy = await Product.deleteMany({ merchantId, handle: { $exists: false } });
  if (legacy.deletedCount) {
    await Cart.updateMany({ merchantId }, { $set: { items: [] } });
    console.log(`Removed ${legacy.deletedCount} legacy products and emptied carts`);
  }

  await StoreSettings.updateOne({ merchantId }, { $setOnInsert: { merchantId, ...store } }, { upsert: true });

  for (const c of catalog.collections) {
    await Collection.updateOne({ merchantId, handle: c.handle }, { $setOnInsert: { merchantId, ...c } }, { upsert: true });
  }

  // Drops indexes from older schemas (e.g. the pre-variant `slug` index).
  await Promise.all([Product.syncIndexes(), Collection.syncIndexes(), User.syncIndexes(), Cart.syncIndexes()]);
  let created = 0;
  for (const input of catalog.products) {
    const doc = await toDocument(merchantId, input);
    if (await Product.exists({ merchantId, handle: doc.handle })) continue;
    await Product.create(doc);
    created += 1;
  }
  const variants = await Product.aggregate([{ $match: { merchantId } }, { $project: { n: { $size: "$variants" } } }, { $group: { _id: null, n: { $sum: "$n" } } }]);
  console.log(`Catalog: ${await Product.countDocuments({ merchantId })} products (${created} new), ${variants[0]?.n || 0} variants, ${await Collection.countDocuments({ merchantId })} collections`);

  for (const u of SEED_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    await User.updateOne(
      { merchantId, email: u.email },
      { $set: { name: u.name, username: u.username, role: u.role, passwordHash }, $setOnInsert: { merchantId, email: u.email } },
      { upsert: true }
    );
    console.log(`User ${u.username} (${u.role}) ready`);
  }

  // Push everything to the AI assistant platform (no-op if not linked).
  await platformSync.fullSync();

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
