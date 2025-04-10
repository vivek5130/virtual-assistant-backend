const express = require("express");
const {
    createUser,
    updateUser,
    deleteUser,
    getUser
} = require("../controllers/userController");

const router = express.Router();

router.post("/", createUser); // Create User
router.get("/:userId", getUser); // Get User by ID
router.put("/:userId", updateUser); // Update User
router.delete("/:userId", deleteUser); // Delete User

module.exports = router;
