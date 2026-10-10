const mongoose = require("mongoose");
const env = require("./env");

module.exports = async function connectDB() {
  // dbName applies when the URI has no database path (e.g. Atlas SRV strings).
  await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });
  console.log("MongoDB connected");
};
