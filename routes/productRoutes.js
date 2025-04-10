const express = require("express");
const {
    createProduct,
    updateProduct,
    deleteProduct,
    getProduct,
    getAllProducts, 
    addReview
} = require("../controllers/productController");

const router = express.Router();

router.post("/", createProduct); // Add Product
router.get("/", getAllProducts); // Get All Products
router.get("/:productId", getProduct); // Get Product by ID
router.put("/:productId", updateProduct); // Update Product
router.delete("/:productId", deleteProduct); // Delete Product
router.post("/:productId/review", addReview); // Add Review to Product

module.exports = router;
