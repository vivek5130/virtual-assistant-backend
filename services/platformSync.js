// Pushes this store's data to the AI assistant platform through its public
// Sync API — the same integration any merchant would build:
//   POST /v1/products/batch, DELETE /v1/products/:id,
//   POST /v1/customers/batch, POST /v1/orders/batch
// Failures are logged and never break the shop; a full resync runs on boot
// and via `npm run sync:platform`.
const env = require("../config/env");
const Product = require("../models/Product");
require("../models/Collection"); // registered for populate()
const User = require("../models/User");
const Order = require("../models/Order");

const enabled = () => Boolean(env.platform.url && env.platform.apiKey);

async function call(method, path, body) {
  const res = await fetch(`${env.platform.url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.platform.apiKey}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 207) throw new Error(`${method} ${path} → ${res.status} ${data.error || JSON.stringify(data.failed?.[0] || "")}`);
  return data;
}

// Store product → canonical platform product (Shopify-style, snake_case).
function toPlatformProduct(p) {
  return {
    id: String(p._id),
    title: p.title,
    handle: p.handle,
    description: p.description,
    url: `${env.storePublicUrl}/p/${p.handle}`,
    vendor: p.vendor,
    product_type: p.productType,
    category: p.category,
    tags: p.tags,
    collections: (p.collections || []).map((c) => c?.handle).filter(Boolean),
    status: p.status,
    options: p.options.map((o) => ({ name: o.name, values: o.values })),
    variants: p.variants.map((v) => ({
      id: String(v._id),
      title: v.title,
      sku: v.sku,
      barcode: v.barcode,
      price: v.price,
      compare_at_price: v.compareAtPrice,
      available: v.inventoryQuantity > 0 || v.inventoryPolicy === "continue",
      inventory_quantity: v.inventoryQuantity,
      options: Object.fromEntries(v.options || []),
      weight: v.weight,
      weight_unit: v.weightUnit,
      image: v.imageUrl,
      url: `${env.storePublicUrl}/p/${p.handle}?variant=${v._id}`,
    })),
    images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
    specs: Object.fromEntries(p.metafields.filter((m) => m.namespace === "specs").map((m) => [m.key, m.value])),
    rating: p.rating,
    rating_count: p.ratingCount,
  };
}

function toPlatformOrder(o) {
  return {
    id: String(o._id),
    order_number: o.orderNumber,
    customer_id: o.user ? String(o.user) : undefined,
    email: o.email,
    status: o.status,
    financial_status: o.paymentStatus,
    currency: o.currency,
    subtotal: o.subtotal,
    shipping: o.shipping,
    total: o.total,
    items: o.items.map((i) => ({
      product_id: String(i.product),
      variant_id: i.variant ? String(i.variant) : undefined,
      title: i.name,
      variant_title: i.variantTitle,
      sku: i.sku,
      quantity: i.quantity,
      price: i.price,
      image: i.image,
    })),
    timeline: o.timeline.map((t) => ({ status: t.status, note: t.note, at: t.at })),
    placed_at: o.createdAt,
  };
}

const safe = (label, fn) => async (...args) => {
  if (!enabled()) return null;
  try {
    return await fn(...args);
  } catch (err) {
    console.warn(`[platform-sync] ${label} failed: ${err.message}`);
    return null;
  }
};

const syncProducts = safe("products", async (ids) => {
  
  const products = await Product.find(ids ? { _id: { $in: ids } } : { merchantId: env.merchantId }).populate("collections", "handle");
  let upserted = 0;
  for (let i = 0; i < products.length; i += 200) {
    const r = await call("POST", "/v1/products/batch", { products: products.slice(i, i + 200).map(toPlatformProduct) });
    upserted += r.upserted;
    r.failed?.forEach((f) => console.warn(`[platform-sync] product ${f.id}: ${f.error}`));
  }
  return upserted;
});

const deleteProduct = safe("delete product", (id) => call("DELETE", `/v1/products/${id}`));

const syncCustomer = safe("customer", (user) =>
  call("POST", "/v1/customers/batch", { customers: [{ id: String(user._id), email: user.email, name: user.name }] })
);

const syncOrders = safe("orders", async (orders) => {
  const list = orders || (await Order.find({ merchantId: env.merchantId }).sort({ createdAt: -1 }).limit(500));
  if (!list.length) return 0;
  return (await call("POST", "/v1/orders/batch", { orders: list.map(toPlatformOrder) })).upserted;
});

async function fullSync() {
  if (!enabled()) return console.log("[platform-sync] disabled (set PLATFORM_API_URL and PLATFORM_API_KEY)");
  const products = await syncProducts();
  const users = await User.find({ merchantId: env.merchantId, role: "customer" });
  if (users.length) await safe("customers", () => call("POST", "/v1/customers/batch", { customers: users.map((u) => ({ id: String(u._id), email: u.email, name: u.name })) }))();
  const orders = await syncOrders();
  console.log(`[platform-sync] synced ${products ?? 0} products, ${users.length} customers, ${orders ?? 0} orders`);
}

module.exports = { syncProducts, deleteProduct, syncCustomer, syncOrders, fullSync, toPlatformProduct, enabled };
