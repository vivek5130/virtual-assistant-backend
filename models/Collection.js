const mongoose = require("mongoose");

// Shopify-style collections. Products reference collections; `featured`
// collections become storefront sections in the order of `position`.
const CollectionSchema = new mongoose.Schema(
  {
    merchantId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    handle: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    featured: { type: Boolean, default: false },
    position: { type: Number, default: 0 },
    sortOrder: { type: String, enum: ["best", "price_asc", "price_desc", "newest", "rating"], default: "best" },
    seo: { title: String, description: String },
  },
  { timestamps: true }
);
CollectionSchema.index({ merchantId: 1, handle: 1 }, { unique: true });

CollectionSchema.methods.toPublic = function toPublic(productCount) {
  return {
    id: String(this._id),
    title: this.title,
    handle: this.handle,
    description: this.description,
    image: this.image,
    featured: this.featured,
    position: this.position,
    sortOrder: this.sortOrder,
    ...(productCount !== undefined ? { productCount } : {}),
  };
};

module.exports = mongoose.model("Collection", CollectionSchema);
