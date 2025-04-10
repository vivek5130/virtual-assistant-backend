require("dotenv").config();
const express = require("express");
const cors = require('cors');
const connectDB = require("./config/db");

const app = express();
app.use(express.json());

// Allow requests from your frontend
app.use(cors({
    origin: '*', // 'http://localhost:5173', // or '*' for all origins during dev
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true // only if you use cookies/sessions
  }));

// Connect to MongoDB
connectDB();

// Routes
app.use("/api", require("./routes"));

// Error Handling Middleware
app.use(require("./middleware/errorHandler"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
