const mongoose = require("mongoose");

const CartSchema = new mongoose.Schema(
  {
    merchantId: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    guestId: { type: String },
    items: [
      {
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        variant: { type: mongoose.Schema.Types.ObjectId, required: true },
        quantity: { type: Number, required: true, min: 1, max: 20 },
      },
    ],
  },
  { timestamps: true }
);
CartSchema.index({ merchantId: 1, user: 1 }, { unique: true, partialFilterExpression: { user: { $exists: true } } });
CartSchema.index({ merchantId: 1, guestId: 1 }, { unique: true, partialFilterExpression: { guestId: { $exists: true } } });

module.exports = mongoose.model("Cart", CartSchema);
