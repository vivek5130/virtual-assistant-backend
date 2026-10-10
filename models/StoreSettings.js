const mongoose = require("mongoose");

// Everything the storefront renders besides the hero: brand name,
// announcement, navigation, footer, home sections, checkout settings.
const LinkSchema = new mongoose.Schema({ label: { type: String, required: true }, url: { type: String, required: true } }, { _id: false });

const StoreSettingsSchema = new mongoose.Schema(
  {
    merchantId: { type: String, required: true, unique: true },
    name: { type: String, default: "ShopSmart" },
    tagline: { type: String, default: "" },
    announcement: { type: String, default: "" },
    supportEmail: { type: String, default: "" },
    currency: { type: String, default: "INR" },
    freeShippingOver: { type: Number, default: 999 },
    shippingFee: { type: Number, default: 79 },
    paymentMethods: [{ _id: false, id: String, label: String }],
    navigation: [LinkSchema],
    footer: [{ _id: false, title: String, links: [LinkSchema] }],
    // Home page sections after the hero, rendered in order.
    homeSections: [
      {
        _id: false,
        type: { type: String, enum: ["categories", "collection", "deals"], required: true },
        title: String,
        collectionHandle: String,
        limit: { type: Number, default: 8 },
        tone: { type: String, default: "plain" },
      },
    ],
    trustBadges: [{ _id: false, icon: String, text: String }],
  },
  { timestamps: true }
);

StoreSettingsSchema.methods.toPublic = function toPublic() {
  const { _id, __v, merchantId, createdAt, updatedAt, ...rest } = this.toObject();
  return rest;
};

module.exports = mongoose.model("StoreSettings", StoreSettingsSchema);
