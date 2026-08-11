# ESNTLS Club Photo Studio v2

This is the isolated ESNTLS Club bulk product-photo and product-upload workflow.
It does not share Workers, Queues, R2 storage, configuration, or job data with
XCLUSIVELINE.

## Live service

- Worker: `esntls-photo-studio-v2`
- URL: `https://esntls-photo-studio-v2.qmako41212.workers.dev`
- Queue: `esntls-photo-studio-v2-jobs`
- Media bucket: `esntls-photo-studio-v2-media`
- Preview bucket: `esntls-photo-studio-v2-media-preview`

The Worker also has an ESNTLS-only binding to the existing `esntls-images`
catalog and an authenticated service binding to `esntls-r2` for Shopify and Wix
checkout creation.

## Cloudflare secrets

Set these with `wrangler secret put`; never add their values to source files:

- `OPENAI_API_KEY`
- `ESNTLS_STUDIO_ADMIN_PASSWORD`
- `ESNTLS_STUDIO_SESSION_SECRET`
- `ESNTLS_STORE_SERVICE_TOKEN`

`ESNTLS_STORE_SERVICE_TOKEN` must have the same secret value on `esntls-r2`.
The checked-in `.dev.vars.example` contains names only for local development.

## Commands

Run from this directory:

```powershell
npm test
npx wrangler deploy --dry-run
npx wrangler deploy
```

The approved astro-turf background is
`public/esntls-grass-background.jpg`. Keep that asset path stable because all
generated jobs use it as their permanent background reference.
