// Embedded AI-assistant console. This store's backend (which holds the secret
// platform API key) vouches for its own admin to Unicorn and returns a
// short-lived token; the browser never sees the key.
const env = require("../../config/env");
const { HttpError } = require("../../utils/http");

exports.session = async (req, res) => {
  if (!env.platform.url || !env.platform.apiKey) throw new HttpError(503, "AI platform not configured (PLATFORM_API_URL / PLATFORM_API_KEY)");
  const r = await fetch(`${env.platform.url}/v1/embed/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.platform.apiKey}` },
    body: JSON.stringify({ admin: { id: String(req.user._id), name: req.user.name } }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `AI platform refused the console session: ${data.error || r.status}`);
  res.json({ token: data.token, expiresIn: data.expiresIn, scriptUrl: data.scriptUrl });
};
