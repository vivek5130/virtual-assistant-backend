const express = require("express");
const cors = require("cors");
const { identify } = require("./middleware/auth");
const connectDB = require("./config/db");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "backend" }));

app.use(
  "/api",
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Guest-Id"],
  }),
  (_req, _res, next) => connectDB().then(() => next(), next),
  identify,
  require("./routes")
);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use(require("./middleware/errorHandler"));

module.exports = app;
