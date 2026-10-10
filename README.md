# ShopSmart store backend (demo merchant)

A normal e-commerce backend — catalog (Shopify-style variants), cart,
checkout, orders, store settings, shopper auth — that **uses the Unicorn
platform like any customer would**:

- Syncs products, customers and orders to the platform's **Sync API**
  (`services/platformSync.js`): full sync on boot / `npm run sync:platform`,
  incremental on product edits, checkout and order status changes.
- Signs shopper identities for the widget (`GET /api/assistant/identity`,
  HMAC-SHA256 with `PLATFORM_IDENTITY_SECRET`).
- Holds **no AI code or model keys**.

```bash
npm install
cp .env.example .env     # MONGO_URI, JWT_SECRET, PLATFORM_API_URL, PLATFORM_API_KEY, PLATFORM_IDENTITY_SECRET
npm run seed             # catalog, demo users (vivek / vivek5926 admin, demo / demo12345 shopper), then syncs
npm run dev              # :7008
npm test
```
