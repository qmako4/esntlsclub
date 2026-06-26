# ESNTLS Blank Product Workflow

Use this workflow when a real product has been uploaded to `esntlsclub.com` and a matching Shopify placeholder product is needed.

## Goal

Create a Shopify product that:

- Uses a blank, unbranded version of the ESNTLS product image.
- Matches the standard grey concrete blank-product background.
- Has a neutral random Shopify title.
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
- Create the Shopify product using the generated random title, price, and size variants.
- Return the Shopify product link.

## Random Naming Rule

Visible Shopify product names should be neutral and random, for example:

- `Daily Item 4827`
- `Studio Item 1936`
- `Select Item 7402`
- `Core Item 6281`

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

## What Full Automation Would Need Later

A fully automatic version, where uploading to ESNTLS instantly creates the Shopify blank item without asking Codex, would need:

- An ESNTLS product-created webhook or scheduled scanner.
- A private server or serverless function.
- OpenAI image API credentials.
- Shopify Admin API credentials.
- A review queue so bad generated images do not go live by accident.
- A mapping table from ESNTLS product ID to Shopify placeholder product ID.

Until that is built, this workflow keeps the risky visual step reviewed by Codex before the Shopify product goes live.

## Hands-Free Worker

The repo now includes a hands-free worker:

```bash
node scripts/esntls-handsfree-worker.mjs --watch --interval-ms 300000
```

It polls the ESNTLS product feed, finds products it has not processed, generates a blank image with the OpenAI image API, uploads that generated image to Shopify, creates a randomly named Shopify placeholder product, then records the mapping in:

```text
outputs/blank-product-workflow/state.json
```

Required environment variables:

```bash
OPENAI_API_KEY=
SHOPIFY_STORE_DOMAIN=nr00an-yh.myshopify.com
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
```

Optional environment variables:

```bash
ESNTLS_PRODUCTS_URL=https://pub-43c9cf7fd2904289881c21839332521c.r2.dev/products.json
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

The repo includes a scheduled workflow at:

```text
.github/workflows/esntls-blank-worker.yml
```

It runs every 15 minutes and can also be started manually from GitHub.

Add these GitHub repository secrets:

```text
OPENAI_API_KEY
SHOPIFY_STORE_DOMAIN
SHOPIFY_CLIENT_ID
SHOPIFY_CLIENT_SECRET
```

The Shopify token needs these Admin API scopes:

```text
read_products
write_products
read_publications
write_publications
read_files
write_files
```

The workflow does not keep a permanent state file. Instead, the worker checks Shopify for matching `ESNTLS-ID-*` and `ESNTLS-SOURCE-ID-*` tags before creating anything, so repeat runs should not duplicate products.
