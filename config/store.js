// Fallback store settings for a merchant with no StoreSettings document yet.
// Real values are seeded from seed/store.json and edited in the admin.
module.exports = {
  name: "ShopSmart",
  currency: "INR",
  freeShippingOver: 999,
  shippingFee: 79,
  paymentMethods: [
    { id: "cod", label: "Cash on delivery" },
    { id: "upi-demo", label: "UPI (demo — no charge)" },
  ],
  navigation: [],
  footer: [],
  homeSections: [],
  trustBadges: [],
  orderStatuses: ["placed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"],
};
