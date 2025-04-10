const Product = require("../models/Product");

// Create Product
exports.createProduct = async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();
        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get Product
exports.getProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.productId).populate("reviews.user", "name");
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

// Update Product
exports.updateProduct = async (req, res) => {
    try {
        const updatedProduct = await Product.findByIdAndUpdate(req.params.productId, req.body, { new: true });
        if (!updatedProduct) return res.status(404).json({ error: "Product not found" });
        res.json(updatedProduct);
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.productId);
        res.json({ message: "Product deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

// Add Review to Product
exports.addReview = async (req, res) => {
    try {
        const { user, rating, comment } = req.body;

        const product = await Product.findById(req.params.productId);
        if (!product) return res.status(404).json({ error: "Product not found" });

        // Add review
        product.reviews.push({ user, rating, comment });

        // Recalculate average rating
        const totalRating = product.reviews.reduce((sum, review) => sum + review.rating, 0);
        product.rating = totalRating / product.reviews.length;

        await product.save();
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

// Get All Products
exports.getAllProducts = async (req, res) => {
    try {
        const { category, minPrice, maxPrice, sortBy, limit } = req.query;
        let filter = {};

        if (category) filter.category = category;
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = parseFloat(minPrice);
            if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
        }

        let query = Product.find(filter).populate("reviews.user", "name");
        if (sortBy) query = query.sort({ price: sortBy === "asc" ? 1 : -1 });
        if (limit) query = query.limit(parseInt(limit));

        const products = await query;
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

