const mongoose = require("mongoose");
const env = require("./env");

// One connection per process. Serverless hosts (Vercel) load app.js directly and
// never run server.js, so requests call this lazily; the promise is cached.
let connecting;
module.exports = function connectDB() {
  if (!connecting) {
    // dbName applies when the URI has no database path (e.g. Atlas SRV strings).
    connecting = mongoose
      .connect(env.mongoUri, { dbName: env.mongoDbName, serverSelectionTimeoutMS: 8000 })
      .then(() => console.log("MongoDB connected"))
      .catch((err) => {
        connecting = undefined; // retry on the next request
        throw err;
      });
  }
  return connecting;
};
