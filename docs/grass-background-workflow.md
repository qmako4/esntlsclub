# ESNTLS Grass Background Workflow

Use this workflow to automatically turn newly uploaded ESNTLS product photos into green grass ecommerce images.

## What Happens

1. A product is added in `admin.html`.
2. The admin saves it to R2 `products.json` with:

```json
"grassBackground": {
  "status": "pending",
  "sourceImage": "https://...",
  "requestedAt": "..."
}
```

3. The GitHub Action `ESNTLS Grass Background Worker` runs every 15 minutes.
4. The worker only selects products with `grassBackground.status` set to `pending`.
5. OpenAI creates a realistic green grass product image while preserving the original item details.
6. The generated image is uploaded to R2 under `grass-products/`.
7. The product's `images` array is updated so the new grass image becomes the first/main image.
8. The original uploaded image is kept after the grass image.
9. `grassBackground.status` is changed to `done`.

Existing products are not touched unless a manual workflow run uses `include_existing`.

## Required GitHub Secrets

```text
OPENAI_API_KEY
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

The workflow already sets:

```text
R2_ACCOUNT_ID=2cd63a3dc8a97fd3d54da09e423ab769
R2_BUCKET_NAME=esntls-images
ESNTLS_PRODUCTS_OBJECT_KEY=products.json
```

## Manual Test

Run a safe dry-run locally:

```bash
npm run grass-worker:dry-run -- --limit 1
```

Run a safe dry-run in GitHub Actions:

```text
Actions -> ESNTLS Grass Background Worker -> Run workflow -> dry_run: true
```

For a live manual test, upload one new product in admin first, then run:

```text
limit: 1
dry_run: false
include_existing: false
```

## Optional Brand Background Reference

If you want OpenAI to use a specific grass reference image, add this environment variable to the workflow:

```text
GRASS_BACKGROUND_IMAGE_URL=https://...
```

Without it, the worker prompts OpenAI to create a clean green grass/turf ecommerce background.
