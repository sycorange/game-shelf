# Game Shelf

Browser games for friends, hosted on Cloudflare Workers.

- `public/` is the site (landing page, Lantern Lake, Deep Dive).
- `src/worker.js` is the server (friends features, cloud saves) backed by a D1 database.
- `wrangler.jsonc` is the Cloudflare config.

Cloudflare Workers Builds deploys automatically on every push to `main`.
Deployed Via Cloudflare
