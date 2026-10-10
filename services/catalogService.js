const mongoose = require("mongoose");
const Product = require("../models/Product");
const Collection = require("../models/Collection");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const User = require("../models/User");

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ci = (value) => new RegExp(`^${escapeRegex(String(value).trim())}$`, "i");
const num = (value) => (value === undefined || value === null || value === "" ? undefined : Number(value));
const list = (value) =>
  (Array.isArray(value) ? value : String(value || "").split(","))
    .map((v) => String(v).trim())
    .filter(Boolean);
const leaf = (path) => String(path || "").split(">").pop().trim();

const SORTS = {
  price_asc: { priceMin: 1 },
  price_desc: { priceMin: -1 },
  rating: { rating: -1, ratingCount: -1 },
  newest: { publishedAt: -1 },
  best: { ratingCount: -1, rating: -1 },
};

// Category filter matches the full taxonomy path or any segment of it,
// so "Shoes" and "Apparel & Accessories > Shoes" both work.
const categoryMatcher = (value) => new RegExp(`(^|>\\s*)${escapeRegex(String(value).trim())}(\\s*>|$)`, "i");

/**
 * Metadata-filtered product search shared by the storefront and AI tools.
 *
 * Filters: q, category, productType, vendor|brand, collection (handle),
 * tags (any-of), color, size, option.<Name>=value, minPrice, maxPrice,
 * minRating, inStock, sort, page, limit. Unknown category/vendor/productType
 * values are folded into keywords instead of returning nothing, and are
 * reported in `relaxed`.
 */
async function searchProducts(merchantId, rawParams = {}, { includeDrafts = false } = {}) {
  const params = { ...rawParams };
  if (params.brand && !params.vendor) params.vendor = params.brand;
  const filter = { merchantId };
  if (!includeDrafts) filter.status = "active";

  const relaxed = [];
  const relax = (field, note) => {
    relaxed.push({ field, value: params[field], note });
    params.q = `${params.q || ""} ${params[field]}`.trim();
    delete params[field];
  };

  if (params.category) {
    const exists = await Product.exists({ merchantId, category: categoryMatcher(params.category) });
    if (exists) filter.category = categoryMatcher(params.category);
    else relax("category", `no category "${params.category}"; searched it as keywords`);
  }
  for (const field of ["vendor", "productType"]) {
    if (!params[field]) continue;
    const exists = await Product.exists({ merchantId, [field]: ci(params[field]) });
    if (exists) filter[field] = ci(params[field]);
    else relax(field, `no ${field} "${params[field]}"; searched it as keywords`);
  }

  if (params.collection) {
    const collection = await Collection.findOne({ merchantId, handle: String(params.collection).toLowerCase() });
    filter.collections = collection ? collection._id : null;
  }

  const tags = list(params.tags).map((t) => t.toLowerCase());
  if (tags.length) filter.tags = { $in: tags };

  // Option filters → optionIndex ("color:crimson"). Values within an option OR; options AND.
  const optionFilters = {};
  if (params.color) optionFilters.color = list(params.color);
  if (params.size) optionFilters.size = list(params.size);
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("option.") && value) optionFilters[key.slice(7).toLowerCase()] = list(value);
  }
  const optionClauses = Object.entries(optionFilters).map(([name, values]) => ({
    optionIndex: { $in: values.map((v) => `${name}:${v.toLowerCase()}`) },
  }));
  if (optionClauses.length) filter.$and = optionClauses;

  const minPrice = num(params.minPrice);
  const maxPrice = num(params.maxPrice);
  if (maxPrice !== undefined && !Number.isNaN(maxPrice)) filter.priceMin = { $lte: maxPrice };
  if (minPrice !== undefined && !Number.isNaN(minPrice)) filter.priceMax = { $gte: minPrice };
  const minRating = num(params.minRating);
  if (minRating) filter.rating = { $gte: minRating };
  if (String(params.inStock) === "true") filter.available = true;

  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 12, 1), 48);
  const page = Math.max(parseInt(params.page, 10) || 1, 1);
  const q = String(params.q || "").trim();
  const sortKey = params.sort && SORTS[params.sort] ? params.sort : null;

  let query = filter;
  let projection = {};
  let sort = sortKey ? SORTS[sortKey] : SORTS.best;
  if (q) {
    const textFilter = { ...filter, $text: { $search: q } };
    if (await Product.exists(textFilter)) {
      query = textFilter;
      projection = { score: { $meta: "textScore" } };
      if (!sortKey) sort = { score: { $meta: "textScore" } };
    } else {
      // Partial words ("sneak", "head") fall back to a regex across key fields.
      const words = q.split(/\s+/).filter((w) => w.length > 1).map(escapeRegex);
      const rx = new RegExp(words.join("|") || escapeRegex(q), "i");
      query = { ...filter, $or: [{ title: rx }, { vendor: rx }, { productType: rx }, { category: rx }, { tags: rx }, { description: rx }, { optionIndex: rx }] };
    }
  }

  const [total, docs] = await Promise.all([
    Product.countDocuments(query),
    Product.find(query, projection).sort(sort).skip((page - 1) * limit).limit(limit),
  ]);

  return {
    products: docs.map((d) => d.toCard()),
    total,
    page,
    pages: Math.ceil(total / limit),
    ...(relaxed.length ? { relaxed } : {}),
    appliedFilters: Object.fromEntries(
      Object.entries({
        q,
        category: params.category,
        productType: params.productType,
        vendor: params.vendor,
        collection: params.collection,
        tags: tags.join(","),
        ...Object.fromEntries(Object.entries(optionFilters).map(([k, v]) => [k, v.join(",")])),
        minPrice,
        maxPrice,
        minRating,
        inStock: params.inStock,
        sort: params.sort,
      }).filter(([, v]) => v !== undefined && v !== "" && v !== null)
    ),
  };
}

/** Every filterable attribute with counts — drives UI filters and AI tools. */
async function facets(merchantId) {
  const match = { merchantId, status: "active" };
  const [result] = await Product.aggregate([
    { $match: match },
    {
      $facet: {
        categories: [
          { $group: { _id: "$category", count: { $sum: 1 }, minPrice: { $min: "$priceMin" }, image: { $first: { $arrayElemAt: ["$images.url", 0] } } } },
          { $sort: { count: -1 } },
        ],
        productTypes: [{ $group: { _id: "$productType", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        vendors: [{ $match: { vendor: { $ne: "" } } }, { $group: { _id: "$vendor", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        tags: [{ $unwind: "$tags" }, { $group: { _id: "$tags", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 60 }],
        options: [
          { $unwind: "$options" },
          { $unwind: "$options.values" },
          { $group: { _id: { name: "$options.name", value: "$options.values" }, count: { $sum: 1 } } },
          { $sort: { "_id.name": 1, count: -1 } },
        ],
        collections: [{ $unwind: "$collections" }, { $group: { _id: "$collections", count: { $sum: 1 } } }],
        price: [{ $group: { _id: null, min: { $min: "$priceMin" }, max: { $max: "$priceMax" } } }],
      },
    },
  ]);

  const options = {};
  for (const o of result.options) (options[o._id.name] ||= []).push({ value: o._id.value, count: o.count });
  const countBy = Object.fromEntries(result.collections.map((c) => [String(c._id), c.count]));
  const collections = await Collection.find({ merchantId }).sort({ position: 1 });

  return {
    categories: result.categories
      .filter((c) => c._id)
      .map((c) => ({ name: leaf(c._id), path: c._id, count: c.count, minPrice: c.minPrice, image: c.image })),
    productTypes: result.productTypes.filter((t) => t._id).map((t) => ({ name: t._id, count: t.count })),
    vendors: result.vendors.map((v) => ({ name: v._id, count: v.count })),
    collections: collections.map((c) => c.toPublic(countBy[String(c._id)] || 0)),
    tags: result.tags.map((t) => ({ name: t._id, count: t.count })),
    options,
    price: result.price[0] ? { min: result.price[0].min, max: result.price[0].max } : { min: 0, max: 0 },
  };
}

async function findProduct(merchantId, idOrHandle, { includeDrafts = false } = {}) {
  const query = mongoose.isValidObjectId(idOrHandle) ? { _id: idOrHandle } : { handle: String(idOrHandle).toLowerCase() };
  return Product.findOne({ merchantId, ...query, ...(includeDrafts ? {} : { status: "active" }) }).populate("collections", "handle title");
}

/**
 * Content-based recommendations. Signals: anchor product (type, category,
 * tags, price band), shopper cart/wishlist/orders, free-text preferences,
 * budget, and colour/size wishes.
 */
async function recommend(merchantId, { productId, category, maxPrice, preferences, color, size, limit = 4 }, actor = {}) {
  const anchor = productId && mongoose.isValidObjectId(productId) ? await Product.findOne({ merchantId, _id: productId }) : null;

  const signalIds = new Set();
  if (actor.userId || actor.guestId) {
    const owner = actor.userId ? { user: actor.userId } : { guestId: actor.guestId };
    const cart = await Cart.findOne({ merchantId, ...owner });
    cart?.items.forEach((i) => signalIds.add(String(i.product)));
    if (actor.userId) {
      const user = await User.findById(actor.userId).select("wishlist");
      user?.wishlist.forEach((id) => signalIds.add(String(id)));
      const orders = await Order.find({ merchantId, user: actor.userId }).sort({ createdAt: -1 }).limit(5);
      orders.forEach((o) => o.items.forEach((i) => signalIds.add(String(i.product))));
    }
  }
  const signals = signalIds.size ? await Product.find({ _id: { $in: [...signalIds] } }) : [];
  const likedTypes = new Set(signals.map((p) => p.productType.toLowerCase()));
  const likedTags = new Set(signals.flatMap((p) => p.tags));
  const prefWords = String(preferences || "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const wantOptions = [...list(color).map((c) => `color:${c.toLowerCase()}`), ...list(size).map((s) => `size:${s.toLowerCase()}`)];

  const filter = { merchantId, status: "active", available: true, _id: { $nin: [...signalIds, ...(anchor ? [String(anchor._id)] : [])] } };
  if (category) filter.$or = [{ category: categoryMatcher(category) }, { productType: ci(category) }];
  if (num(maxPrice)) filter.priceMin = { $lte: num(maxPrice) };
  const candidates = await Product.find(filter).limit(400);

  const scored = candidates.map((p) => {
    let score = (p.rating || 0) / 5;
    const reasons = [];
    if (anchor) {
      if (p.productType === anchor.productType) {
        score += 2;
        reasons.push(`another ${p.productType.toLowerCase()}`);
      } else if (leaf(p.category) === leaf(anchor.category)) {
        score += 1.2;
        reasons.push(`also in ${leaf(p.category)}`);
      }
      const shared = p.tags.filter((t) => anchor.tags.includes(t));
      score += shared.length * 0.5;
      if (shared.length && !reasons.length) reasons.push(`shares ${shared.slice(0, 2).join(", ")}`);
      score += Math.max(0, 1 - Math.abs(p.priceMin - anchor.priceMin) / Math.max(anchor.priceMin, 1));
    }
    if (likedTypes.has(p.productType.toLowerCase())) {
      score += 1;
      reasons.push("matches your picks");
    }
    score += p.tags.filter((t) => likedTags.has(t)).length * 0.3;
    if (wantOptions.length) {
      const hits = wantOptions.filter((o) => p.optionIndex.includes(o)).length;
      score += hits * 1.5;
      if (hits) reasons.push("available in your size/colour");
    }
    if (prefWords.length) {
      const hay = `${p.title} ${p.vendor} ${p.productType} ${p.category} ${p.tags.join(" ")} ${p.optionIndex.join(" ")} ${p.description}`.toLowerCase();
      const hits = prefWords.filter((w) => hay.includes(w)).length;
      score += hits * 0.8;
      if (hits) reasons.push("fits what you described");
    }
    return { product: p, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  return {
    products: scored.slice(0, Math.min(Number(limit) || 4, 12)).map((s) => ({ ...s.product.toCard(), reason: s.reasons[0] || "top rated" })),
    basedOn: { anchor: anchor ? anchor.title : null, signals: signals.length, preferences: preferences || null },
  };
}

module.exports = { searchProducts, facets, findProduct, recommend, leaf };
