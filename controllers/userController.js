const User = require("../models/User");

// Create User
exports.createUser = async (req, res) => {
    try {
        const user = new User(req.body);
        await user.save();
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get User
exports.getUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).populate("purchaseHistory wishlist");
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

// Update User
exports.updateUser = async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(req.params.userId, req.body, { new: true });
        if (!updatedUser) return res.status(404).json({ error: "User not found" });
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};

// Delete User
exports.deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.userId);
        res.json({ message: "User deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Server Error" });
    }
};
