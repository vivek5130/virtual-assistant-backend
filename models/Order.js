const mongoose = require("mongoose");
const store = require("../config/store");

const OrderSchema = new mongoose.Schema(
  {
    merchantId: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    guestId: String,
    email: { type: String, required: true, lowercase: true, trim: true },
    items: [
      {
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        variant: { type: mongoose.Schema.Types.ObjectId },
        variantTitle: String,
        sku: String,
        weightGrams: Number,
        name: String,
        image: String,
        price: Number,
        quantity: Number,
      },
    ],
    subtotal: Number,
    shipping: Number,
    total: Number,
    currency: { type: String, default: store.currency },
    shippingAddress: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      line1: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
    },
    paymentMethod: { type: String, required: true },
    paymentStatus: { type: String, enum: ["pending", "paid"], default: "pending" },
    status: { type: String, enum: store.orderStatuses, default: "placed" },
    timeline: [{ _id: false, status: String, note: String, at: { type: Date, default: Date.now } }],
  },
  { timestamps: true }
);

OrderSchema.methods.toPublic = function toPublic() {
  return {
    orderNumber: this.orderNumber,
    status: this.status,
    items: this.items.map((i) => ({
      productId: String(i.product),
      variantId: i.variant ? String(i.variant) : null,
      name: i.name,
      variantTitle: i.variantTitle && i.variantTitle !== "Default Title" ? i.variantTitle : null,
      sku: i.sku || null,
      image: i.image,
      price: i.price,
      quantity: i.quantity,
    })),
    subtotal: this.subtotal,
    shipping: this.shipping,
    total: this.total,
    currency: this.currency,
    paymentMethod: this.paymentMethod,
    paymentStatus: this.paymentStatus,
    shippingAddress: { name: this.shippingAddress.name, city: this.shippingAddress.city, state: this.shippingAddress.state, postalCode: this.shippingAddress.postalCode },
    timeline: this.timeline,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("Order", OrderSchema);
