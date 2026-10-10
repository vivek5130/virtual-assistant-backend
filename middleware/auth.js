const jwt = require("jsonwebtoken");
const env = require("../config/env");
const User = require("../models/User");
const { HttpError } = require("../utils/http");

const GUEST_ID = /^[a-zA-Z0-9-]{8,64}$/;

// Attaches req.user (if a valid bearer token is sent) and req.guestId (from
// X-Guest-Id) so carts and chats work for signed-out shoppers too.
async function identify(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) {
      const payload = jwt.verify(header.slice(7), env.jwtSecret);
      req.user = await User.findById(payload.sub).select("-passwordHash");
    }
  } catch {
    req.user = null;
  }
  const guest = req.headers["x-guest-id"];
  req.guestId = typeof guest === "string" && GUEST_ID.test(guest) ? guest : null;
  req.merchantId = env.merchantId;
  next();
}

function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, "Sign in required"));
  next();
}

function requireAdmin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, "Sign in required"));
  if (req.user.role !== "admin") return next(new HttpError(403, "Admin only"));
  next();
}

// Shopper identity for carts/chats: signed-in user wins over guest id.
function requireShopper(req, _res, next) {
  if (!req.user && !req.guestId) return next(new HttpError(400, "X-Guest-Id header or sign-in required"));
  next();
}

function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

module.exports = { identify, requireAuth, requireAdmin, requireShopper, signToken };
