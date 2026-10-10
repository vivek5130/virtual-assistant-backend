// Store order administration. (Conversations & AI memory live in the assistant platform.)
const Order = require("../../models/Order");
const orderService = require("../../services/orderService");
const platformSync = require("../../services/platformSync");

exports.orders = async (req, res) => {
  const orders = await Order.find({ merchantId: req.merchantId }).sort({ createdAt: -1 }).limit(100);
  res.json({ orders: orders.map((o) => ({ ...o.toPublic(), email: o.email })) });
};

exports.setOrderStatus = async (req, res) => {
  const order = await orderService.setStatus(req.merchantId, req.params.orderNumber, req.body?.status, req.body?.note);
  platformSync.syncOrders([order]); // keep the AI's order tracking current
  res.json({ order: order.toPublic() });
};

