// Cart, checkout, orders and wishlist for shoppers (user or guest).
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");
const cartService = require("../services/cartService");
const platformSync = require("../services/platformSync");
const orderService = require("../services/orderService");
const { getSettings } = require("../services/storeService");
const { HttpError } = require("../utils/http");

const actorOf = (req) => ({ userId: req.user?._id, guestId: req.user ? null : req.guestId });

exports.storeConfig = async (req, res) => {
  const s = await getSettings(req.merchantId);
  res.json({ currency: s.currency, freeShippingOver: s.freeShippingOver, shippingFee: s.shippingFee, paymentMethods: s.paymentMethods });
};

exports.getCart = async (req, res) => res.json({ cart: await cartService.getCart(req.merchantId, actorOf(req)) });

exports.addToCart = async (req, res) => {
  const { productId, variantId, quantity = 1 } = req.body || {};
  res.json(await cartService.addItem(req.merchantId, actorOf(req), productId, Number(quantity), { variantId }));
};

exports.setQuantity = async (req, res) => {
  res.json(await cartService.addItem(req.merchantId, actorOf(req), req.params.productId, Number(req.body?.quantity), { replace: true, variantId: req.body?.variantId }));
};

exports.removeFromCart = async (req, res) => {
  res.json(await cartService.removeItem(req.merchantId, actorOf(req), req.params.productId, req.query.variantId));
};

exports.checkout = async (req, res) => {
  const body = req.body || {};
  const order = await orderService.checkout(req.merchantId, actorOf(req), {
    email: req.user?.email || body.email,
    shippingAddress: body.shippingAddress,
    paymentMethod: body.paymentMethod,
  });
  // Stock and order status changed: refresh the AI platform's view.
  platformSync.syncOrders([order]);
  platformSync.syncProducts(order.items.map((i) => i.product));
  res.status(201).json({ order: order.toPublic() });
};

exports.myOrders = async (req, res) => {
  const orders = await orderService.listForUser(req.merchantId, req.user._id);
  res.json({ orders: orders.map((o) => o.toPublic()) });
};

exports.track = async (req, res) => {
  const order = await orderService.track(req.merchantId, actorOf(req), req.params.orderNumber, req.query.email);
  res.json({ order: order.toPublic() });
};

exports.getWishlist = async (req, res) => {
  const user = await User.findById(req.user._id).populate("wishlist");
  res.json({ products: user.wishlist.map((p) => p.toCard()) });
};

exports.addToWishlist = async (req, res) => {
  const { productId } = req.body || {};
  if (!mongoose.isValidObjectId(productId) || !(await Product.exists({ _id: productId, merchantId: req.merchantId }))) {
    throw new HttpError(404, "Product not found");
  }
  await User.updateOne({ _id: req.user._id }, { $addToSet: { wishlist: productId } });
  res.json({ added: productId });
};

exports.removeFromWishlist = async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { wishlist: req.params.productId } });
  res.json({ removed: req.params.productId });
};
