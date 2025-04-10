const mongoose = require("mongoose");

const PurchaseSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Purchase", PurchaseSchema);
