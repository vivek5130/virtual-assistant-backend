const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    merchantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Optional short login handle (e.g. "vivek"); email always works too.
    username: { type: String, lowercase: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    // Empty for accounts created through Google sign-in.
    passwordHash: { type: String },
    googleId: { type: String },
    avatarUrl: { type: String },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  },
  { timestamps: true }
);
UserSchema.index({ merchantId: 1, email: 1 }, { unique: true });
UserSchema.index({ merchantId: 1, googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: "string" } } });
UserSchema.index({ merchantId: 1, username: 1 }, { unique: true, partialFilterExpression: { username: { $type: "string" } } });

UserSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    username: this.username || null,
    email: this.email,
    role: this.role,
    avatarUrl: this.avatarUrl || null,
    providers: [...(this.passwordHash ? ["password"] : []), ...(this.googleId ? ["google"] : [])],
  };
};

module.exports = mongoose.model("User", UserSchema);
