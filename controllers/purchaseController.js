const Purchase = require("../models/Purchase");
const User = require("../models/User");

// Create Purchase
exports.createPurchase = async (req, res) => {
    try {
        const purchase = new Purchase(req.body);
        await purchase.save();

        // Update user's purchase history
        await User.findByIdAndUpdate(req.body.user, { $push: { purchaseHistory: purchase._id } });

        res.status(201).json(purchase);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get Purchases by User
exports.getUserPurchases = async (req, res) => {
    try {
        const purchases = await Purchase.find({ user: req.params.userId }).populate("product");
        res.json(purchases);
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

// Delete Purchase
exports.deletePurchase = async (req, res) => {
    try {
        await Purchase.findByIdAndDelete(req.params.purchaseId);
        res.json({ message: "Purchase deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};
