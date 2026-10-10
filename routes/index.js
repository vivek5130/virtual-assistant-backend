const express = require("express");
const rateLimit = require("express-rate-limit");
const { asyncHandler: h } = require("../utils/http");
const { requireAuth, requireAdmin, requireShopper } = require("../middleware/auth");
const auth = require("../controllers/authController");
const products = require("../controllers/productController");
const shop = require("../controllers/shopController");
const ops = require("../controllers/admin/opsController");
const assistant = require("../controllers/admin/assistantController");

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

//health check
router.get("/health", (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

// ---- auth ----
router.post("/auth/register", authLimiter, h(auth.register));
router.post("/auth/login", authLimiter, h(auth.login));
router.get("/auth/me", requireAuth, h(auth.me));
router.get("/auth/providers", auth.providers);
router.post("/auth/google", authLimiter, h(auth.google));

// ---- catalog ----
router.get("/store", h(products.store));
router.get("/checkout/config", h(shop.storeConfig));
router.get("/collections", h(products.collections));
router.get("/collections/:handle", h(products.collection));
router.get("/products", h(products.list));
router.get("/products/facets", h(products.facets));
router.get("/products/:idOrSlug", h(products.get));
router.get("/products/:idOrSlug/similar", h(products.similar));
router.post("/products/:idOrSlug/reviews", requireAuth, h(products.addReview));

// ---- cart / checkout / orders / wishlist ----
router.get("/cart", requireShopper, h(shop.getCart));
router.post("/cart/items", requireShopper, h(shop.addToCart));
router.patch("/cart/items/:productId", requireShopper, h(shop.setQuantity));
router.delete("/cart/items/:productId", requireShopper, h(shop.removeFromCart));
router.post("/orders", requireShopper, h(shop.checkout));
router.get("/orders", requireAuth, h(shop.myOrders));
router.get("/orders/track/:orderNumber", h(shop.track));
router.get("/wishlist", requireAuth, h(shop.getWishlist));
router.post("/wishlist", requireAuth, h(shop.addToWishlist));
router.delete("/wishlist/:productId", requireAuth, h(shop.removeFromWishlist));

// ---- AI assistant identity (HMAC for the embedded widget) ----
router.get("/assistant/identity", requireAuth, h(auth.assistantIdentity));

// ---- admin ----
const admin = express.Router();
admin.use(requireAdmin);
admin.get("/products", h(products.adminList));
admin.get("/products/:id", h(products.adminGet));
admin.post("/products", h(products.create));
admin.put("/products/:id", h(products.update));
admin.delete("/products/:id", h(products.remove));
admin.post("/collections", h(products.createCollection));
admin.put("/collections/:id", h(products.updateCollection));
admin.delete("/collections/:id", h(products.removeCollection));
admin.put("/store", h(products.updateStore));
admin.post("/assistant/session", h(assistant.session));

admin.get("/orders", h(ops.orders));
admin.patch("/orders/:orderNumber/status", h(ops.setOrderStatus));
router.use("/admin", admin);

module.exports = router;
