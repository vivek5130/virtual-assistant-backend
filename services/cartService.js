const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const { getSettings } = require("./storeService");
const { HttpError } = require("../utils/http");

const ownerOf = ({ userId, guestId }) => {
  if (userId) return { user: userId };
  if (guestId) return { guestId };
  throw new HttpError(400, "No shopper identity");
};

async function getCartDoc(merchantId, actor) {
  const owner = ownerOf(actor);
  return Cart.findOneAndUpdate(
    { merchantId, ...owner },
    { $setOnInsert: { merchantId, ...owner, items: [] } },
    { upsert: true, new: true }
  ).populate("items.product");
}

function canSell(variant, quantity) {
  return variant.inventoryPolicy === "continue" || variant.inventoryQuantity >= quantity;
}

async function serialize(cart, merchantId) {
  const settings = await getSettings(merchantId || cart.merchantId);
  const items = [];
  for (const line of cart.items) {
    const product = line.product;
    const variant = product?.variants?.id(line.variant);
    if (!product || !variant) continue; // product or variant deleted since
    items.push({
      lineId: `${product._id}:${variant._id}`,
      product: product.toCard(),
      variant: product.variantView(variant),
      quantity: line.quantity,
      unitPrice: variant.price,
      lineTotal: variant.price * line.quantity,
    });
  }
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const shipping = subtotal === 0 || subtotal >= settings.freeShippingOver ? 0 : settings.shippingFee;
  return {
    items,
    count: items.reduce((n, i) => n + i.quantity, 0),
    subtotal,
    shipping,
    total: subtotal + shipping,
    weightGrams: items.reduce((g, i) => g + i.variant.weightGrams * i.quantity, 0),
    currency: settings.currency,
    freeShippingOver: settings.freeShippingOver,
  };
}

async function getCart(merchantId, actor) {
  return serialize(await getCartDoc(merchantId, actor), merchantId);
}

// Resolve which variant to add. Single-variant products need no choice; for
// multi-variant products the caller must pick one (the error lists them so
// the AI assistant can ask the shopper or choose).
function resolveVariant(product, variantId) {
  if (variantId && !mongoose.isValidObjectId(variantId)) throw new HttpError(400, "Invalid variant id");
  const variant = product.findVariant(variantId);
  if (variant) return variant;
  if (variantId) throw new HttpError(404, "That variant doesn't exist for this product");
  const choices = product.variants
    .map((v) => `${v.title} (variant_id ${v._id}, ₹${v.price}${v.inventoryQuantity > 0 ? "" : ", sold out"})`)
    .join("; ");
  throw new HttpError(409, `${product.title} comes in several options — choose one: ${choices}`);
}

async function addItem(merchantId, actor, productId, quantity = 1, { variantId, replace = false } = {}) {
  if (!mongoose.isValidObjectId(productId)) throw new HttpError(400, "Invalid product id");
  const product = await Product.findOne({ merchantId, _id: productId, status: "active" });
  if (!product) throw new HttpError(404, "Product not found");
  const variant = resolveVariant(product, variantId);

  const cart = await getCartDoc(merchantId, actor);
  const existing = cart.items.find((i) => String(i.product?._id || i.product) === String(product._id) && String(i.variant) === String(variant._id));
  const nextQty = Math.max(1, Math.min(20, replace ? quantity : (existing?.quantity || 0) + quantity));
  if (!canSell(variant, nextQty)) {
    throw new HttpError(409, `Only ${Math.max(0, variant.inventoryQuantity)} of ${product.title} (${variant.title}) in stock`);
  }

  if (existing) existing.quantity = nextQty;
  else cart.items.push({ product: product._id, variant: variant._id, quantity: nextQty });
  await cart.save();
  await cart.populate("items.product");
  return {
    added: { ...product.toCard(), variant: product.variantView(variant) },
    quantity: nextQty,
    cart: await serialize(cart, merchantId),
  };
}

async function removeItem(merchantId, actor, productId, variantId) {
  const cart = await getCartDoc(merchantId, actor);
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => {
    const sameProduct = String(i.product?._id || i.product) === String(productId);
    return !(sameProduct && (!variantId || String(i.variant) === String(variantId)));
  });
  if (cart.items.length === before) throw new HttpError(404, "That product is not in the cart");
  await cart.save();
  await cart.populate("items.product");
  return { removed: { productId, variantId: variantId || null }, cart: await serialize(cart, merchantId) };
}

async function clear(merchantId, actor) {
  await Cart.updateOne({ merchantId, ...ownerOf(actor) }, { $set: { items: [] } });
}

// On sign-in, fold the guest cart into the user's cart.
async function mergeGuestCart(merchantId, guestId, userId) {
  if (!guestId) return;
  const guest = await Cart.findOne({ merchantId, guestId });
  if (!guest || !guest.items.length) return;
  const cart = await Cart.findOneAndUpdate(
    { merchantId, user: userId },
    { $setOnInsert: { merchantId, user: userId, items: [] } },
    { upsert: true, new: true }
  );
  for (const item of guest.items) {
    const existing = cart.items.find((i) => String(i.product) === String(item.product) && String(i.variant) === String(item.variant));
    if (existing) existing.quantity = Math.min(20, existing.quantity + item.quantity);
    else cart.items.push(item);
  }
  await cart.save();
  await guest.deleteOne();
}

module.exports = { getCart, addItem, removeItem, clear, mergeGuestCart, serialize, getCartDoc };
