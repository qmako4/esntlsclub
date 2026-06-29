# ESNTLS Blank Product Workflow

Use this workflow when a real product has been uploaded to `esntlsclub.com` and a matching Shopify placeholder product is needed.

## Goal

Create a Shopify product that:

- Uses a blank, unbranded version of the ESNTLS product image.
- Matches the standard grey concrete blank-product background.
- Has a neutral, real-sounding Shopify title that does not expose the real brand.
- Keeps the real ESNTLS product mapped privately so the correct original item is fulfilled.
- Uses the same price and sizes as the ESNTLS product.

## Fast Operator Flow

1. Upload the real product to `esntlsclub.com`.
2. Run the request helper:

```bash
node scripts/blank-product-request.mjs --source-title "Casablanca Simple Logo T-Shirt" --price 34.99 --sizes S,M,L,XL --image "C:\path\to\real-product.png"
```

3. Send Codex:

```text
Create the Shopify blank product from the latest blank-product request.
```

4. Codex should:

- Read the newest request file in `outputs/blank-product-workflow/requests`.
- Generate a single blank product image from the source image.
- Use a grey concrete ecommerce background.
- Remove all visible logos, labels, text, and brand marks.
- Inspect the generated image.
- Upload it to Shopify.
- Create the Shopify product using the generated neutral title, price, and size variants.
- Return the Shopify product link.

## Placeholder Naming Rule

Visible Shopify product names should be neutral and ecommerce-friendly, not generic numbered items. They should describe the blank item type and colour while avoiding the real brand name. Examples:

- `The Gel Runners - Pink`
- `The Technical Sneakers - Black & Grey`
- `The Runner Sneakers - Light Blue`
- `The Classic Sandals - Brown`
- `The Simple T-Shirt - White`

Do not use the real brand name in the visible Shopify title when the product is meant to be a checkout placeholder.

Keep the original product identity in private workflow data and Shopify tags, for example:

- `ESNTLS-SOURCE-ID-63`
- `ESNTLS-SOURCE-TITLE-Casablanca-Simple-Logo-T-Shirt`
- `ESNTLS-BLANK-WORKFLOW`

## Shopify Description

Use the concise checkout reassurance:

```html
<p><strong>Blank item = original item.</strong></p><p><strong>Buy the blank item shown at checkout. You'll receive the original item you selected.</strong></p>
```

## Image Generation Prompt Pattern

Use this pattern for the generated image:

```text
Use case: precise-object-edit
Asset type: Shopify product image for ESNTLS Blanks
Input image: source product image is the edit target and subject reference.
Primary request: create a blank placeholder version of this product image. Keep it as one single realistic product photo. Remove all visible branding, logos, labels, tags, marks, and any readable text. Replace the background with a neutral grey concrete floor/background matching clean ecommerce blank-product photography.
Subject: same product type, shape, color family, material feel, and silhouette as the source image, but completely unbranded.
Composition/framing: square product image, centered item, full item visible with comfortable padding, overhead or product-catalog angle matching the source.
Lighting/mood: soft natural ecommerce lighting, subtle realistic shadows, clean and premium.
Constraints: one item only; no logos; no text; no watermark; no original background; no model unless the original product absolutely requires fit context; no extra accessories; not an illustration.
```

## Admin Button Workflow

The preferred flow is manual from `admin.html`:

1. Add or edit a product in ESNTLS admin.
2. Open the product's edit panel.
3. Click `Generate Shopify Product`.
4. The admin calls the private Cloudflare Worker endpoint `/shopify-create-product`.
5. The worker loads the saved product from R2 `products.json`, generates the blank image, creates the Shopify placeholder product, writes the Shopify URL back into that ESNTLS product's `link` field, and returns the link to the admin.
6. If Wix credentials are configured, the same button also creates a Wix backup placeholder product and returns that backup URL without linking it to the ESNTLS product.

The admin button does not expose OpenAI, Shopify, or Wix credentials in the browser. Those secrets must live on the Cloudflare Worker.

Required Cloudflare Worker bindings:

```text
BUCKET = esntls-images
ADMIN_SECRET
OPENAI_API_KEY
SHOPIFY_STORE_DOMAIN = nr00an-yh.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN
```

Optional Cloudflare Worker variables:

```text
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
SHOPIFY_BLANK_BACKGROUND_URL=https://esntlsclub.com/img/esntls-blank-concrete-background.jpg
SHOPIFY_PRODUCT_STATUS=ACTIVE
SHOPIFY_VENDOR=ESNTLS Club
SHOPIFY_PRODUCT_TYPE=Placeholder
DEFAULT_CLOTHING_SIZES=S,M,L,XL
DEFAULT_FOOTWEAR_SIZES=UK 6,UK 7,UK 8,UK 9,UK 10,UK 11
WIX_API_TOKEN
WIX_SITE_ID
```

`SHOPIFY_ADMIN_ACCESS_TOKEN` is preferred. If using `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`, the Shopify app must be installed on the shop or Shopify will return `app_not_installed`.

## Local Worker Script

The repo still includes a command-line worker for manual testing:

```bash
node scripts/esntls-handsfree-worker.mjs --watch --interval-ms 300000
```

It polls the ESNTLS product feed, only selects products whose ESNTLS `link` field is empty, generates a blank image with the OpenAI image API, uploads that generated image to Shopify, creates a neutral real-sounding Shopify placeholder product, then writes the new Shopify product URL back to the matching ESNTLS product's `link` field in R2 `products.json`.

It also records the mapping in:

```text
outputs/blank-product-workflow/state.json
```

Required environment variables:

```bash
OPENAI_API_KEY=
SHOPIFY_STORE_DOMAIN=nr00an-yh.myshopify.com
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

Optional environment variables:

```bash
ESNTLS_PRODUCTS_URL=https://pub-43c9cf7fd2904289881c21839332521c.r2.dev/products.json
SHOPIFY_ADMIN_ACCESS_TOKEN=
R2_ACCOUNT_ID=2cd63a3dc8a97fd3d54da09e423ab769
R2_BUCKET_NAME=esntls-images
ESNTLS_PRODUCTS_OBJECT_KEY=products.json
ESNTLS_LINKBACK_REQUIRED=true
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_SIZE=1024x1024
SHOPIFY_API_VERSION=2026-04
SHOPIFY_PRODUCT_STATUS=ACTIVE
DEFAULT_CLOTHING_SIZES=S,M,L,XL
DEFAULT_FOOTWEAR_SIZES=UK 6,UK 7,UK 8,UK 9,UK 10,UK 11
```

Test one run without creating products:

```bash
node scripts/esntls-handsfree-worker.mjs --once --dry-run --limit 1
```

Process only one product by title:

```bash
node scripts/esntls-handsfree-worker.mjs --once --source-title "Casablanca"
```

Important: the worker can only process products that have a usable `image` URL/path and a price in the ESNTLS feed. Products missing images are skipped and recorded in the state file.

## GitHub Actions Setup

The repo includes a manual GitHub Actions workflow at:

```text
.github/workflows/esntls-blank-worker.yml
```

It no longer runs on a schedule. It can be started manually from GitHub if needed, and manual runs default to `dry_run: true` so you can test safely. The normal production path is the admin button calling the Cloudflare Worker endpoint.

Add these GitHub repository secrets:

```text
OPENAI_API_KEY
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

The Shopify app needs these Admin API scopes:

```text
read_products
write_products
read_publications
write_publications
read_files
write_files
```

The worker will request a short-lived Shopify Admin API token at runtime from the Dev Dashboard client ID and secret. If you already have a legacy admin-created custom app token, you can use `SHOPIFY_ADMIN_ACCESS_TOKEN` instead of the client ID and secret.

The live workflow requires R2 write credentials before it creates a Shopify product. That prevents a product from being created without the ESNTLS checkout link being updated.

The workflow does not keep a permanent state file. Instead, the worker checks Shopify for matching `ESNTLS-ID-*` and `ESNTLS-SOURCE-ID-*` tags before creating anything, so repeat runs should not duplicate products.
