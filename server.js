const env = require("./config/env");
const connectDB = require("./config/db");
const app = require("./app");
const platformSync = require("./services/platformSync");

connectDB()
  .then(() => {
    app.listen(env.port, () => console.log(`ShopSmart store backend listening on :${env.port}`));
    platformSync.fullSync(); // background; logs and continues on failure
  })
  .catch((err) => {
    console.error("Startup failed:", err.message);
    process.exit(1);
  });
