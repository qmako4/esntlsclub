# ESNTLS Supplier WhatsApp Automation

This Worker sends a supplier-safe WhatsApp message when Shopify creates a new order.

The message includes:

- Customer name
- Shipping address
- ESNTLS Club product name, selected option/size, and quantity

The message does not include:

- Customer email
- Customer phone number
- Air Pro line items

## Worker Endpoint

Shopify webhook URL:

```text
https://esntls-r2.qmako41212.workers.dev/shopify-order-webhook
```

## Required Secrets

Add these in Cloudflare Worker secrets:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_SUPPLIER_TO
```

Optional:

```text
WHATSAPP_OWNER_TO
WHATSAPP_TEMPLATE_NAME
WHATSAPP_TEMPLATE_LANGUAGE
SHOPIFY_WEBHOOK_SECRET
```

If `SHOPIFY_WEBHOOK_SECRET` is not set, the Worker uses `SHOPIFY_CLIENT_SECRET` to verify Shopify webhook HMAC signatures.

## WhatsApp Template

For fully hands-free sends, Meta usually requires an approved WhatsApp template unless the recipient recently messaged the business number.

Recommended template:

```text
Name: new_supplier_order
Language: en_GB
Body:
New ESNTLS order:
{{1}}
```

Then set:

```text
WHATSAPP_TEMPLATE_NAME=new_supplier_order
WHATSAPP_TEMPLATE_LANGUAGE=en_GB
```

## Admin Test

Dry-run without sending:

```bash
curl -X POST "https://esntls-r2.qmako41212.workers.dev/whatsapp-test-order" \
  -H "X-Admin-Secret: <ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d "{\"dryRun\":true}"
```

Send a live test:

```bash
curl -X POST "https://esntls-r2.qmako41212.workers.dev/whatsapp-test-order" \
  -H "X-Admin-Secret: <ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d "{\"dryRun\":false}"
```

View recent logs:

```bash
curl "https://esntls-r2.qmako41212.workers.dev/whatsapp-order-log" \
  -H "X-Admin-Secret: <ADMIN_SECRET>"
```

