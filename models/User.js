const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true, required: true },
    preferences: [String], // Example: ["Electronics", "Gaming"]
    purchaseHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: "Purchase" }],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }]
});

module.exports = mongoose.model("User", UserSchema);
