const express = require("express");
const router = express.Router();

router.use("/users", require("./userRoutes"));
router.use("/products", require("./productRoutes"));
router.use("/purchases", require("./purchaseRoutes"));
router.use("/recommendations", require("./recommendationRoutes"));

module.exports = router;
