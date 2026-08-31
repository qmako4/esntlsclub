# ESNTLS Supplier Google Sheet Automation

This Worker can write new Shopify orders into a supplier Google Sheet.

Supplier Sheet:

```text
https://docs.google.com/spreadsheets/d/1rVC0dG9Wyy6UXagB5LlOS_lNR8K9Rl7MC4DVs0EHmMg
```

Each row includes:

- Customer name
- Shipping address
- ESNTLS Club product photo thumbnail shown directly in the cell
- ESNTLS Club product name
- Selected option/size
- Quantity
- Supplier status and tracking columns

The sheet does not include customer email or phone number.

Air Pro line items are excluded from supplier rows.

## Worker Endpoint

Shopify webhook URL:

```text
https://esntls-r2.qmako41212.workers.dev/shopify-order-webhook
```

Create a Shopify `orders/create` webhook pointing to that URL.

## Required Cloudflare Secrets

```text
GOOGLE_SUPPLIER_SHEET_ID=1rVC0dG9Wyy6UXagB5LlOS_lNR8K9Rl7MC4DVs0EHmMg
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service-account-email>
GOOGLE_PRIVATE_KEY=<service-account-private-key>
```

Then share the Google Sheet with the service account email as Editor.

Optional:

```text
SUPPLIER_SHEET_TAB=Orders
SUPPLIER_WHATSAPP_ENABLED=true
```

WhatsApp stays disabled unless `SUPPLIER_WHATSAPP_ENABLED=true`.

## Product Photos

The product photo column is built from the matching ESNTLS Club product image, not the blank Shopify product image.

The Sheet displays the photo with an `IMAGE(...)` formula. It uses a Worker-served R2 image URL, not an `esntlsclub.com` product/page URL. If a product image is still hosted outside R2, the Worker copies it into R2 first and then serves that copied R2 image through `/supplier-image/<key>`.

The separate image URL column is intentionally left blank/hidden so suppliers just see the thumbnail.

Matching uses, in order:

- ESNTLS SKU source ID, for example `ESNTLS-001-UK8`
- Linked Shopify product ID
- Linked Shopify variant ID
- Saved blank Shopify title

If no ESNTLS product match is found, the row is still created and marked `Check item match`.

## Admin Tests

Dry-run without writing to the Sheet:

```bash
curl -X POST "https://esntls-r2.qmako41212.workers.dev/supplier-sheet-test-order" \
  -H "X-Admin-Secret: <ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d "{\"dryRun\":true}"
```

Append a live test row:

```bash
curl -X POST "https://esntls-r2.qmako41212.workers.dev/supplier-sheet-test-order" \
  -H "X-Admin-Secret: <ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d "{\"dryRun\":false}"
```

Sync recent paid, unfulfilled Shopify orders after a cutoff order number:

```bash
curl -X POST "https://esntls-r2.qmako41212.workers.dev/supplier-sheet-sync-recent" \
  -H "X-Admin-Secret: <ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d "{\"afterOrderNumber\":1165,\"dryRun\":false}"
```

View recent supplier order logs:

```bash
curl "https://esntls-r2.qmako41212.workers.dev/supplier-order-log" \
  -H "X-Admin-Secret: <ADMIN_SECRET>"
```
