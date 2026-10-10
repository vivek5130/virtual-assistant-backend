const mongoose = require("mongoose");

// Shopify-style catalog: a product has up to 3 options (e.g. Color, Size),
// and every purchasable combination is a variant with its own SKU, price,
// inventory and weight. Denormalised fields (priceMin, totalInventory,
// optionIndex…) are recomputed on save so search/filtering stays cheap.

const ImageSchema = new mongoose.Schema({ url: { type: String, required: true }, alt: { type: String, default: "" } }, { _id: true });

const VariantSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // "Crimson / UK 8" or "Default Title"
    sku: { type: String, trim: true },
    barcode: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    costPerItem: { type: Number, min: 0 },
    inventoryQuantity: { type: Number, default: 0 },
    inventoryPolicy: { type: String, enum: ["deny", "continue"], default: "deny" }, // continue = allow backorder
    options: { type: Map, of: String, default: {} }, // { Color: "Crimson", Size: "UK 8" }
    weight: { type: Number, min: 0, default: 0 },
    weightUnit: { type: String, enum: ["g", "kg", "lb", "oz"], default: "g" },
    requiresShipping: { type: Boolean, default: true },
    taxable: { type: Boolean, default: true },
    imageUrl: String,
    position: { type: Number, default: 1 },
  },
  { _id: true }
);

const ReviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true }
);

const ProductSchema = new mongoose.Schema(
  {
    merchantId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    handle: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, default: "" },
    vendor: { type: String, trim: true, default: "" },
    productType: { type: String, trim: true, default: "" },
    // Shopify standard-taxonomy style path: "Apparel & Accessories > Shoes"
    category: { type: String, trim: true, default: "" },
    tags: [{ type: String, lowercase: true, trim: true }],
    status: { type: String, enum: ["active", "draft", "archived"], default: "active", index: true },
    collections: [{ type: mongoose.Schema.Types.ObjectId, ref: "Collection" }],
    options: [{ _id: false, name: { type: String, required: true }, values: [String] }],
    variants: { type: [VariantSchema], validate: [(v) => v.length > 0, "At least one variant required"] },
    images: [ImageSchema],
    seo: { title: String, description: String },
    // Structured data (specs, care, materials…). Namespace "specs" renders on the PDP.
    metafields: [
      {
        _id: false,
        namespace: { type: String, default: "specs" },
        key: { type: String, required: true },
        type: { type: String, default: "single_line_text_field" },
        value: { type: String, required: true },
      },
    ],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    reviews: [ReviewSchema],
    publishedAt: Date,

    // ---- denormalised (maintained in pre-validate) ----
    priceMin: Number,
    priceMax: Number,
    compareAtMax: Number,
    totalInventory: Number,
    available: Boolean,
    optionIndex: [String], // "color:crimson", "size:uk 8"
  },
  { timestamps: true }
);

ProductSchema.index({ merchantId: 1, handle: 1 }, { unique: true });
ProductSchema.index({ merchantId: 1, status: 1, category: 1, priceMin: 1 });
ProductSchema.index({ merchantId: 1, optionIndex: 1 });
ProductSchema.index({ merchantId: 1, collections: 1 });
ProductSchema.index(
  { title: "text", vendor: "text", productType: "text", category: "text", tags: "text", description: "text", "variants.title": "text" },
  { weights: { title: 10, vendor: 6, productType: 6, tags: 5, category: 4, "variants.title": 3, description: 1 }, name: "product_text" }
);

ProductSchema.pre("validate", function denormalise() {
  if (!this.variants?.length) return;
  const prices = this.variants.map((v) => v.price);
  this.priceMin = Math.min(...prices);
  this.priceMax = Math.max(...prices);
  this.compareAtMax = Math.max(0, ...this.variants.map((v) => v.compareAtPrice || 0));
  this.totalInventory = this.variants.reduce((n, v) => n + Math.max(0, v.inventoryQuantity || 0), 0);
  this.available = this.variants.some((v) => v.inventoryQuantity > 0 || v.inventoryPolicy === "continue");
  const index = new Set();
  for (const v of this.variants) for (const [k, val] of v.options || []) index.add(`${k.toLowerCase()}:${String(val).toLowerCase()}`);
  this.optionIndex = [...index];
  if (this.status === "active" && !this.publishedAt) this.publishedAt = new Date();
});

const GRAMS = { g: 1, kg: 1000, lb: 453.592, oz: 28.3495 };

ProductSchema.methods.variantView = function variantView(v) {
  return {
    id: String(v._id),
    title: v.title,
    sku: v.sku || null,
    price: v.price,
    compareAtPrice: v.compareAtPrice || null,
    options: Object.fromEntries(v.options || []),
    available: v.inventoryQuantity > 0 || v.inventoryPolicy === "continue",
    inventoryQuantity: v.inventoryQuantity,
    inventoryPolicy: v.inventoryPolicy,
    weight: v.weight,
    weightUnit: v.weightUnit,
    weightGrams: Math.round((GRAMS[v.weightUnit] || 1) * (v.weight || 0)),
    image: v.imageUrl || null,
  };
};

ProductSchema.methods.findVariant = function findVariant(variantId) {
  if (variantId) return this.variants.id(variantId);
  return this.variants.length === 1 ? this.variants[0] : null;
};

// Compact shape used by listings, chat product cards and AI tools.
ProductSchema.methods.toCard = function toCard() {
  const colorOption = this.options.find((o) => /colou?r/i.test(o.name));
  const defaultVariant = this.variants.find((v) => v.inventoryQuantity > 0) || this.variants[0];
  return {
    id: String(this._id),
    title: this.title,
    name: this.title,
    handle: this.handle,
    slug: this.handle,
    vendor: this.vendor,
    brand: this.vendor,
    productType: this.productType,
    category: this.category,
    tags: this.tags,
    image: this.images[0]?.url || "",
    price: this.priceMin,
    priceMax: this.priceMax,
    compareAtPrice: this.compareAtMax > this.priceMin ? this.compareAtMax : null,
    rating: Math.round((this.rating || 0) * 10) / 10,
    ratingCount: this.ratingCount,
    inStock: !!this.available,
    totalInventory: this.totalInventory,
    options: this.options.map((o) => ({ name: o.name, values: o.values })),
    colors: colorOption ? colorOption.values : [],
    variantCount: this.variants.length,
    defaultVariantId: String(defaultVariant._id),
  };
};

ProductSchema.methods.toDetail = function toDetail() {
  return {
    ...this.toCard(),
    description: this.description,
    status: this.status,
    images: this.images.map((i) => ({ id: String(i._id), url: i.url, alt: i.alt })),
    variants: this.variants.map((v) => this.variantView(v)),
    metafields: this.metafields,
    specs: Object.fromEntries(this.metafields.filter((m) => m.namespace === "specs").map((m) => [m.key, m.value])),
    seo: this.seo || {},
    collections: (this.collections || []).map((c) => (c && c.handle ? { id: String(c._id), handle: c.handle, title: c.title } : { id: String(c) })),
  };
};

module.exports = mongoose.model("Product", ProductSchema);
