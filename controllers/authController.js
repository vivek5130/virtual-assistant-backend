const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const platformSync = require("../services/platformSync");
const { OAuth2Client } = require("google-auth-library");
const env = require("../config/env");
const User = require("../models/User");
const { signToken } = require("../middleware/auth");
const { mergeGuestCart } = require("../services/cartService");
const { HttpError } = require("../utils/http");

exports.register = async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || "")) throw new HttpError(400, "Name and valid email required");
  if (!password || password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
  const exists = await User.exists({ merchantId: req.merchantId, email: email.toLowerCase() });
  if (exists) throw new HttpError(409, "An account with that email already exists");

  const user = await User.create({
    merchantId: req.merchantId,
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "customer",
  });
  await mergeGuestCart(req.merchantId, req.guestId, user._id);
  platformSync.syncCustomer(user);
  res.status(201).json({ token: signToken(user), user: user.toPublic() });
};

// `identifier` may be an email or a username (e.g. the seeded admin "vivek").
exports.login = async (req, res) => {
  const { identifier, email, password } = req.body || {};
  const id = String(identifier || email || "").toLowerCase().trim();
  const user = await User.findOne({ merchantId: req.merchantId, $or: [{ email: id }, { username: id }] });
  if (!user || !user.passwordHash || !(await bcrypt.compare(String(password || ""), user.passwordHash))) {
    throw new HttpError(401, "Invalid username/email or password");
  }
  await mergeGuestCart(req.merchantId, req.guestId, user._id);
  res.json({ token: signToken(user), user: user.toPublic() });
};

exports.me = async (req, res) => {
  res.json({ user: req.user.toPublic() });
};

// ---- Google sign-in (Google Identity Services ID token) ----
const googleClient = new OAuth2Client();

exports.providers = (_req, res) => {
  res.json({ google: env.googleClientId ? { clientId: env.googleClientId } : null });
};

/**
 * The browser obtains a Google ID token (JWT) and posts it here. We verify
 * its signature, audience and expiry against Google's keys, then sign in the
 * matching account — linking by verified email, or creating a customer.
 * Admin rights are never granted by Google sign-in; an existing admin
 * account keeps its role when it is linked.
 */
exports.google = async (req, res) => {
  if (!env.googleClientId) throw new HttpError(503, "Google sign-in is not configured");
  const credential = String(req.body?.credential || "");
  if (!credential) throw new HttpError(400, "Missing Google credential");

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, "Google sign-in could not be verified. Please try again.");
  }
  if (!payload?.sub || !payload.email) throw new HttpError(401, "Google account has no email");
  if (!payload.email_verified) throw new HttpError(401, "Your Google email address isn't verified");

  const email = payload.email.toLowerCase();
  let user = await User.findOne({ merchantId: req.merchantId, googleId: payload.sub });
  if (!user) {
    user = await User.findOne({ merchantId: req.merchantId, email });
    if (user) {
      user.googleId = payload.sub; // link Google to the existing (verified-email) account
      if (!user.avatarUrl && payload.picture) user.avatarUrl = payload.picture;
      await user.save();
    } else {
      user = await User.create({
        merchantId: req.merchantId,
        name: payload.name || email.split("@")[0],
        email,
        googleId: payload.sub,
        avatarUrl: payload.picture,
        role: "customer",
      });
    }
  }
  await mergeGuestCart(req.merchantId, req.guestId, user._id);
  res.json({ token: signToken(user), user: user.toPublic() });
};

/**
 * Identity for the embedded AI assistant (identity verification). Our server
 * signs the shopper's id with the secret shared with the platform, so the
 * assistant can trust who they are and look up their orders.
 */
exports.assistantIdentity = async (req, res) => {
  const secret = env.platform.identitySecret;
  if (!secret) throw new HttpError(503, "Assistant identity verification isn't configured");
  const userId = String(req.user._id);
  res.json({
    userId,
    email: req.user.email,
    name: req.user.name,
    hash: crypto.createHmac("sha256", secret).update(userId).digest("hex"),
  });
};
