const { HttpError } = require("../utils/http");

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (err.name === "ValidationError" || err.name === "CastError") {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large" });
  }
  const status = err.status || 500;
  // HttpErrors carry safe, user-facing messages; anything else is hidden.
  const expose = err instanceof HttpError;
  if (!expose || status >= 500) console.error(err.message);
  res.status(status).json({
    error: expose ? err.message : "Something went wrong",
    ...(err.details ? { details: err.details } : {}),
  });
};
