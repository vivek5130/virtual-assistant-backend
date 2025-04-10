const express = require("express");
const { getRecommendations } = require("../controllers/recommendationController");
const router = express.Router();

router.get("/:userId", getRecommendations); // GET /api/recommendations/:userId

module.exports = router;
