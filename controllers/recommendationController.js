const User = require("../models/User");
const Product = require("../models/Product");
const { getGeminiRecommendation } = require("../services/geminiService");

exports.getRecommendations = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .populate("purchaseHistory")
            .populate("wishlist");

        if (!user) return res.status(404).json({ error: "User not found" });

        const recommendedProduct = await getGeminiRecommendation(user);
        res.json({ recommendation: recommendedProduct });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server Error" });
    }
};
