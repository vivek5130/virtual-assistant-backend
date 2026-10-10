require("dotenv").config({ quiet: true });

const required = ["MONGO_URI", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required env vars: ${missing.join(", ")} (see .env.example)`);
}

module.exports = {
  port: Number(process.env.PORT || 7008),
  mongoUri: process.env.MONGO_URI,
  mongoDbName: process.env.MONGO_DB_NAME || "shopsmart",
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:7007")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
  merchantId: process.env.MERCHANT_ID || "shopsmart",
  // Public URL of this storefront (product links sent to the AI platform).
  storePublicUrl: (process.env.STORE_PUBLIC_URL || "http://localhost:7007").replace(/\/$/, ""),
  // AI assistant platform (this store is one of its merchants).
  platform: {
    url: (process.env.PLATFORM_API_URL || "").replace(/\/$/, ""),
    apiKey: process.env.PLATFORM_API_KEY || "",
    identitySecret: process.env.PLATFORM_IDENTITY_SECRET || "",
  },
  // OAuth client ID from Google Cloud Console (Web application). Empty disables Google sign-in.
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
};
