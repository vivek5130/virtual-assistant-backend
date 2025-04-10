const express = require("express");
const {
    createPurchase,
    deletePurchase,
    getUserPurchases
} = require("../controllers/purchaseController");

const router = express.Router();

router.post("/", createPurchase); // Add Purchase
router.get("/:userId", getUserPurchases); // Get Purchases by User ID
router.delete("/:purchaseId", deletePurchase); // Delete Purchase

module.exports = router;
