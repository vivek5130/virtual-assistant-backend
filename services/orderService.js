const crypto = require("crypto");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Product = require("../models/Product");
const store = require("../config/store");
const cartService = require("./cartService");
const { getSettings } = require("./storeService");
const { HttpError } = require("../utils/http");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newOrderNumber = () => "SS-" + Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("");

// Reserve variant stock atomically; "continue" policy variants may go negative.
async function reserve(productId, variantId, qty) {
  const guard = { _id: productId, variants: { $elemMatch: { _id: variantId, $or: [{ inventoryQuantity: { $gte: qty } }, { inventoryPolicy: "continue" }] } } };
  const res = await Product.updateOne(guard, { $inc: { "variants.$.inventoryQuantity": -qty } });
  return res.modifiedCount === 1;
}

async function refreshDenormalised(productIds) {
  for (const id of new Set(productIds.map(String))) {
    const product = await Product.findById(id);
    if (product) await product.save(); // pre-validate recomputes totals/availability
  }
}

async function checkout(merchantId, actor, { email, shippingAddress, paymentMethod }) {
  const settings = await getSettings(merchantId);
  if (!settings.paymentMethods.some((m) => m.id === paymentMethod)) throw new HttpError(400, "Unsupported payment method");
  const required = ["name", "phone", "line1", "city", "state", "postalCode"];
  const missing = required.filter((k) => !String(shippingAddress?.[k] || "").trim());
  if (missing.length) throw new HttpError(400, `Missing address fields: ${missing.join(", ")}`);
  if (!/^\S+@\S+\.\S+$/.test(String(email || ""))) throw new HttpError(400, "Valid email required");

  const owner = actor.userId ? { user: actor.userId } : { guestId: actor.guestId };
  const cart = await Cart.findOne({ merchantId, ...owner }).populate("items.product");
  const lines = (cart?.items || [])
    .map((i) => ({ line: i, product: i.product, variant: i.product?.variants?.id(i.variant) }))
    .filter((l) => l.product && l.variant);
  if (!lines.length) throw new HttpError(400, "Your cart is empty");

  const reserved = [];
  for (const { line, product, variant } of lines) {
    if (!(await reserve(product._id, variant._id, line.quantity))) {
      await Promise.all(reserved.map((r) => Product.updateOne({ _id: r.product, "variants._id": r.variant }, { $inc: { "variants.$.inventoryQuantity": r.qty } })));
      throw new HttpError(409, `${product.title} (${variant.title}) no longer has enough stock`);
    }
    reserved.push({ product: product._id, variant: variant._id, qty: line.quantity });
  }

  const totals = await cartService.serialize(cart, merchantId);
  const order = await Order.create({
    merchantId,
    orderNumber: newOrderNumber(),
    ...owner,
    email,
    items: lines.map(({ line, product, variant }) => ({
      product: product._id,
      variant: variant._id,
      variantTitle: variant.title,
      sku: variant.sku,
      weightGrams: product.variantView(variant).weightGrams,
      name: product.title,
      image: variant.imageUrl || product.images[0]?.url,
      price: variant.price,
      quantity: line.quantity,
    })),
    subtotal: totals.subtotal,
    shipping: totals.shipping,
    total: totals.total,
    currency: settings.currency,
    shippingAddress,
    paymentMethod,
    paymentStatus: paymentMethod === "cod" ? "pending" : "paid",
    timeline: [{ status: "placed", note: "Order received" }],
  });
  await cartService.clear(merchantId, actor);
  await refreshDenormalised(reserved.map((r) => r.product));
  return order;
}

// Tracking: owners see their orders; anyone else must match the checkout email.
async function track(merchantId, actor, orderNumber, email) {
  const order = await Order.findOne({ merchantId, orderNumber: String(orderNumber || "").toUpperCase().trim() });
  const ownsIt =
    order &&
    ((actor.userId && String(order.user) === String(actor.userId)) ||
      (actor.guestId && order.guestId === actor.guestId) ||
      (email && order.email === String(email).toLowerCase().trim()));
  if (!ownsIt) throw new HttpError(404, "No order found with that number for this shopper. Guests: include the checkout email.");
  return order;
}

async function listForUser(merchantId, userId, limit = 20) {
  return Order.find({ merchantId, user: userId }).sort({ createdAt: -1 }).limit(Math.min(limit, 50));
}

async function setStatus(merchantId, orderNumber, status, note) {
  if (!store.orderStatuses.includes(status)) throw new HttpError(400, "Invalid status");
  const order = await Order.findOne({ merchantId, orderNumber });
  if (!order) throw new HttpError(404, "Order not found");
  order.status = status;
  order.timeline.push({ status, note: note || "" });
  if (status === "delivered" && order.paymentMethod === "cod") order.paymentStatus = "paid";
  await order.save();
  return order;
}

module.exports = { checkout, track, listForUser, setStatus };
