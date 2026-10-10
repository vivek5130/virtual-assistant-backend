const Product = require("../models/Product");
const Collection = require("../models/Collection");
const StoreSettings = require("../models/StoreSettings");
const catalog = require("../services/catalogService");
const { toDocument, slugify } = require("../services/productAdmin");
const { getSettings } = require("../services/storeService");
const platformSync = require("../services/platformSync");
const { HttpError, pick } = require("../utils/http");

// ---------- public ----------
exports.list = async (req, res) => res.json(await catalog.searchProducts(req.merchantId, req.query));
exports.facets = async (req, res) => res.json(await catalog.facets(req.merchantId));

exports.get = async (req, res) => {
  const product = await catalog.findProduct(req.merchantId, req.params.idOrSlug);
  if (!product) throw new HttpError(404, "Product not found");
  const reviews = product.reviews.slice(-10).map((r) => ({ rating: r.rating, comment: r.comment, createdAt: r.createdAt }));
  res.json({ product: { ...product.toDetail(), reviews } });
};

exports.similar = async (req, res) => {
  const product = await catalog.findProduct(req.merchantId, req.params.idOrSlug);
  if (!product) throw new HttpError(404, "Product not found");
  res.json(await catalog.recommend(req.merchantId, { productId: String(product._id), limit: 4 }, { userId: req.user?._id, guestId: req.guestId }));
};

exports.addReview = async (req, res) => {
  const { rating, comment } = req.body || {};
  const product = await catalog.findProduct(req.merchantId, req.params.idOrSlug);
  if (!product) throw new HttpError(404, "Product not found");
  product.reviews.push({ user: req.user._id, rating: Number(rating), comment });
  product.ratingCount = product.reviews.length;
  product.rating = product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length;
  await product.save();
  res.status(201).json({ product: product.toDetail() });
};

exports.collections = async (req, res) => res.json({ collections: (await catalog.facets(req.merchantId)).collections });

exports.collection = async (req, res) => {
  const collection = await Collection.findOne({ merchantId: req.merchantId, handle: req.params.handle });
  if (!collection) throw new HttpError(404, "Collection not found");
  const result = await catalog.searchProducts(req.merchantId, { sort: collection.sortOrder, ...req.query, collection: collection.handle });
  res.json({ collection: collection.toPublic(result.total), ...result });
};

exports.store = async (req, res) => res.json({ store: (await getSettings(req.merchantId)).toPublic() });

// ---------- admin: products ----------
exports.adminList = async (req, res) => {
  const filter = { merchantId: req.merchantId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.title = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const products = await Product.find(filter).sort({ updatedAt: -1 }).limit(200);
  res.json({ products: products.map((p) => ({ ...p.toCard(), status: p.status, updatedAt: p.updatedAt })) });
};

exports.adminGet = async (req, res) => {
  const product = await catalog.findProduct(req.merchantId, req.params.id, { includeDrafts: true });
  if (!product) throw new HttpError(404, "Product not found");
  res.json({ product: product.toDetail() });
};

exports.create = async (req, res) => {
  const doc = await toDocument(req.merchantId, req.body || {});
  if (await Product.exists({ merchantId: req.merchantId, handle: doc.handle })) doc.handle = `${doc.handle}-${Date.now().toString(36)}`;
  const product = await Product.create(doc);
  platformSync.syncProducts([product._id]);
  res.status(201).json({ product: product.toDetail() });
};

exports.update = async (req, res) => {
  const product = await Product.findOne({ merchantId: req.merchantId, _id: req.params.id });
  if (!product) throw new HttpError(404, "Product not found");
  const doc = await toDocument(req.merchantId, { handle: product.handle, ...req.body });
  // Keep variant ids stable when the admin edits existing variants.
  doc.variants = doc.variants.map(({ id, ...v }) => ({ ...v, ...(id || v._id ? { _id: id || v._id } : {}) }));
  product.set(doc);
  await product.save();
  platformSync.syncProducts([product._id]);
  res.json({ product: (await catalog.findProduct(req.merchantId, product._id, { includeDrafts: true })).toDetail() });
};

exports.remove = async (req, res) => {
  await Product.deleteOne({ merchantId: req.merchantId, _id: req.params.id });
  platformSync.deleteProduct(req.params.id);
  res.json({ deleted: req.params.id });
};

// ---------- admin: collections ----------
const COLLECTION_FIELDS = ["title", "description", "image", "featured", "position", "sortOrder", "seo"];

exports.createCollection = async (req, res) => {
  const body = req.body || {};
  if (!body.title) throw new HttpError(400, "Title required");
  const collection = await Collection.create({ ...pick(body, COLLECTION_FIELDS), handle: slugify(body.handle || body.title), merchantId: req.merchantId });
  res.status(201).json({ collection: collection.toPublic(0) });
};

exports.updateCollection = async (req, res) => {
  const collection = await Collection.findOneAndUpdate(
    { merchantId: req.merchantId, _id: req.params.id },
    { $set: pick(req.body || {}, COLLECTION_FIELDS) },
    { new: true, runValidators: true }
  );
  if (!collection) throw new HttpError(404, "Collection not found");
  res.json({ collection: collection.toPublic() });
};

exports.removeCollection = async (req, res) => {
  await Product.updateMany({ merchantId: req.merchantId }, { $pull: { collections: req.params.id } });
  await Collection.deleteOne({ merchantId: req.merchantId, _id: req.params.id });
  res.json({ deleted: req.params.id });
};

// ---------- admin: store settings ----------
const STORE_FIELDS = ["name", "tagline", "announcement", "supportEmail", "currency", "freeShippingOver", "shippingFee", "paymentMethods", "navigation", "footer", "homeSections", "trustBadges"];

exports.updateStore = async (req, res) => {
  const store = await StoreSettings.findOneAndUpdate(
    { merchantId: req.merchantId },
    { $set: pick(req.body || {}, STORE_FIELDS), $setOnInsert: { merchantId: req.merchantId } },
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ store: store.toPublic() });
};
