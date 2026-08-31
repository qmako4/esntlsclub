// R2 admin Worker for esntlsclub
// Deploy via Cloudflare Dashboard → Workers & Pages → Create Worker → paste this code.
//
// Required bindings (set in the Worker's Settings → Variables tab):
//   1. R2 Bucket binding:
//        Variable name: BUCKET
//        Bucket:        esntls-images
//   2. Environment variables (encrypted):
//        ADMIN_SECRET   any random string (used by admin.html to authenticate)
//        OPENAI_API_KEY used by /shopify-create-product to generate the blank image
//        SHOPIFY_STORE_DOMAIN e.g. nr00an-yh.myshopify.com
//        SHOPIFY_ADMIN_ACCESS_TOKEN recommended Shopify Admin token, or:
//        SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET for an installed Shopify app
//        WIX_API_TOKEN  Wix API key with WIX_STORES.PRODUCT_READ scope (for /wix-sync)
//        WIX_SITE_ID    7e8c1aa8-aaa7-42ef-8c93-a5c2524c6155 (for /wix-sync)
//        WHATSAPP_ACCESS_TOKEN       Meta WhatsApp Cloud API token
//        WHATSAPP_PHONE_NUMBER_ID    Meta WhatsApp sender phone number ID
//        WHATSAPP_SUPPLIER_TO        Supplier WhatsApp number in international format, no +
//        WHATSAPP_OWNER_TO           Optional owner WhatsApp number in international format, no +
//        WHATSAPP_TEMPLATE_NAME      Optional one-variable approved template for hands-free sends
//        WHATSAPP_TEMPLATE_LANGUAGE  Optional template language code, defaults to en_GB
//        SHOPIFY_WEBHOOK_SECRET      Optional Shopify webhook secret; falls back to SHOPIFY_CLIENT_SECRET
//        GOOGLE_SUPPLIER_SHEET_ID    Google Sheet ID for supplier order rows
//        GOOGLE_SERVICE_ACCOUNT_EMAIL Service account email shared on the supplier Sheet
//        GOOGLE_PRIVATE_KEY          Service account private key with Sheets API write access
//        SUPPLIER_SHEET_TAB          Optional tab name, defaults to Orders
//
// Public Shopify webhook endpoint:
//   POST   /shopify-order-webhook → receives Shopify orders/create and records supplier rows
//
// Endpoints below require header  X-Admin-Secret: <ADMIN_SECRET>:
//   GET    /list             → { objects: [{key, url, size, uploaded}, ...] }
//   PUT    /upload/<key>     → request body = file bytes, Content-Type = file mime
//   DELETE /delete/<key>     → removes <key> from the bucket
//   POST   /wix-sync         → refreshes wix-products.json on R2 from the Wix Stores API
//   POST   /wix-orders-sync  → refreshes wix-orders.json on R2 from the Wix eCom Orders API
//                              (last 90 days, trimmed to fields the Orders admin tab needs)
//   POST   /wix-create-product → creates a minimal Wix placeholder product and returns its URL.
//                                Body: { name: string, priceAmount: string, comparePriceAmount?: string }
//   POST   /sync-linked-price → updates linked Shopify/Wix placeholder prices after an admin price edit.
//                                Body: { productId: string|number, price: string|number }
//   POST   /restore-standard-stock → makes selected R2 products buyable on 7-12 day delivery and restores linked Wix stock.
//                                Body: { products: [{ id, price }], delivery?: string, inventoryQuantity?: number }
//   POST   /restore-b30-shopify-stock → makes B30 Shopify variants sellable and refreshes variant IDs.
//                                Body: { sizes?: string[], inventoryPolicy?: 'CONTINUE'|'DENY', createMissing?: boolean, dryRun?: boolean }
//   POST   /checkout-link-mode → switches products between saved Shopify and Wix checkout links.
//                                Body: { mode: 'shopify'|'wix', productId?: string|number }
//   POST   /grass-preview     → creates a simple ESNTLS grass background preview from multipart form data.
//   POST   /whatsapp-test-order → dry-run or send a test supplier WhatsApp order.
//   GET    /whatsapp-order-log → lists recent supplier WhatsApp webhook logs.
//   POST   /supplier-sheet-test-order → dry-run or append a test supplier Sheet order.
//   GET    /supplier-order-log → lists recent supplier webhook destination logs.
//   POST   /supplier-sheet-sync-recent → fetches recent Shopify orders and appends supplier Sheet rows.

const PUBLIC_BASE = 'https://pub-43c9cf7fd2904289881c21839332521c.r2.dev/';
const DEFAULT_BACKGROUND_URL = 'https://esntlsclub.com/img/esntls-blank-concrete-background.jpg';
const FALLBACK_BACKGROUND_URL = 'https://raw.githubusercontent.com/qmako4/esntlsclub/main/img/esntls-blank-concrete-background.jpg';
const DEFAULT_GRASS_BACKGROUND_URL = 'https://esntlsclub.com/img/esntls-grass-background.jpg';
const SHOPIFY_API_VERSION = '2026-04';
const YUPOO_IMPORT_LIMIT = 30;
const YUPOO_PAGE_CRAWL_LIMIT = 12;
const GRASS_JOB_ROOT = 'studio-jobs/';
const GRASS_JOB_STALE_AFTER_MS = 2 * 60 * 1000;
const GRASS_JOB_OPENAI_TIMEOUT_MS = 85 * 1000;
const GRASS_JOB_FOREGROUND_TIMEOUT_MS = 180 * 1000;
const GRASS_JOB_TERMINAL_STATUSES = ['complete', 'partial', 'failed', 'cancelled'];
const WHATSAPP_ORDER_ROOT = 'supplier-whatsapp/orders/';
const SUPPLIER_ORDER_ROOT = 'supplier-orders/orders/';
const WHATSAPP_DEFAULT_GRAPH_VERSION = 'v21.0';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

let googleSheetsTokenCache = { cacheKey: '', accessToken: '', expiresAt: 0 };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret, X-ESNTLS-Service-Token',
  'Access-Control-Max-Age': '86400'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

const PRODUCT_SEARCH_QUERY = `
query ProductsBySourceTag($query: String!) {
  products(first: 1, query: $query) {
    nodes { id title handle tags }
  }
}`;

const PRODUCT_VARIANTS_QUERY = `
query ProductVariantsForPriceSync($id: ID!) {
  product(id: $id) {
    id
    title
    handle
    variants(first: 100) {
      nodes { id title sku price }
    }
  }
}`;

const PRODUCT_VARIANTS_BULK_UPDATE_MUTATION = `
mutation ProductVariantsBulkUpdateForPriceSync($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    product { id title handle }
    productVariants { id price }
    userErrors { field message }
  }
}`;

const RECENT_SUPPLIER_ORDERS_QUERY = `
query RecentSupplierOrders($first: Int!, $query: String) {
  orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id
      name
      createdAt
      displayFinancialStatus
      displayFulfillmentStatus
      shippingAddress {
        name
        address1
        address2
        city
        province
        country
        zip
      }
      lineItems(first: 50) {
        nodes {
          id
          name
          title
          sku
          quantity
          currentQuantity
          variantTitle
          image { url }
          product { id title handle }
          variant {
            id
            title
            sku
            selectedOptions { name value }
            product { id title handle }
          }
          customAttributes { key value }
        }
      }
    }
  }
}`;

const PRODUCT_VARIANTS_STOCK_QUERY = `
query ProductVariantsForStock($id: ID!) {
  product(id: $id) {
    id
    title
    handle
    options {
      id
      name
      values
      optionValues { id name }
    }
    variants(first: 100) {
      nodes {
        id
        title
        sku
        price
        inventoryPolicy
        availableForSale
        inventoryQuantity
        sellableOnlineQuantity
        selectedOptions { name value }
      }
    }
  }
}`;

const PRODUCT_VARIANTS_BULK_CREATE_STOCK_MUTATION = `
mutation ProductVariantsBulkCreateForStock($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId: $productId, variants: $variants) {
    product { id title handle }
    productVariants {
      id
      title
      sku
      price
      inventoryPolicy
      availableForSale
      selectedOptions { name value }
    }
    userErrors { field message }
  }
}`;

const PRODUCT_VARIANTS_POLICY_UPDATE_MUTATION = `
mutation ProductVariantsPolicyUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: true) {
    product { id title handle }
    productVariants {
      id
      title
      sku
      inventoryPolicy
      availableForSale
      selectedOptions { name value }
    }
    userErrors { field message }
  }
}`;

const STAGED_UPLOAD_MUTATION = `
mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters { name value }
    }
    userErrors { field message }
  }
}`;

const PRODUCT_SET_MUTATION = `
mutation ProductSet($input: ProductSetInput!, $synchronous: Boolean!) {
  productSet(input: $input, synchronous: $synchronous) {
    product {
      id
      title
      handle
      variants(first: 100) { nodes { id title sku price } }
    }
    userErrors { field message }
  }
}`;

const PRODUCT_UPDATE_MEDIA_MUTATION = `
mutation ProductUpdateMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
  productUpdate(product: $product, media: $media) {
    product {
      id
      title
      handle
      featuredMedia { preview { image { url } } }
    }
    userErrors { field message }
  }
}`;

const PRODUCT_UPDATE_STATUS_MUTATION = `
mutation ProductUpdateStatus($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { id title handle status }
    userErrors { field message }
  }
}`;

const PUBLICATIONS_QUERY = `
query PublicationsForStorefront {
  publications(first: 20) { nodes { id name } }
}`;

const PUBLISHABLE_PUBLISH_MUTATION = `
mutation PublishProductToOnlineStore($id: ID!, $publicationId: ID!) {
  publishablePublish(id: $id, input: { publicationId: $publicationId }) {
    publishable { ... on Product { id title handle } }
    userErrors { field message }
  }
}`;

const DISCOUNT_BY_CODE_QUERY = `
query DiscountByCode($code: String!) {
  codeDiscountNodeByCode(code: $code) {
    id
    codeDiscount {
      ... on DiscountCodeBasic {
        title
        status
        summary
        codes(first: 1) { nodes { code } }
      }
    }
  }
}`;

const B30_DISCOUNT_CREATE_MUTATION = `
mutation CreateB30BundleDiscount($input: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $input) {
    codeDiscountNode {
      id
      codeDiscount {
        ... on DiscountCodeBasic {
          title
          status
          summary
          codes(first: 1) { nodes { code } }
        }
      }
    }
    userErrors { field code message }
  }
}`;

const B30_DISCOUNT_UPDATE_MUTATION = `
mutation UpdateB30BundleDiscount($id: ID!, $input: DiscountCodeBasicInput!) {
  discountCodeBasicUpdate(id: $id, basicCodeDiscount: $input) {
    codeDiscountNode {
      id
      codeDiscount {
        ... on DiscountCodeBasic {
          title
          status
          summary
          codes(first: 1) { nodes { code } }
        }
      }
    }
    userErrors { field code message }
  }
}`;

const BXGY_DISCOUNT_CREATE_MUTATION = `
mutation CreateBxgyDiscount($input: DiscountCodeBxgyInput!) {
  discountCodeBxgyCreate(bxgyCodeDiscount: $input) {
    codeDiscountNode {
      id
      codeDiscount {
        ... on DiscountCodeBxgy {
          title
          status
          summary
          codes(first: 1) { nodes { code } }
        }
      }
    }
    userErrors { field code message }
  }
}`;

const BXGY_DISCOUNT_UPDATE_MUTATION = `
mutation UpdateBxgyDiscount($id: ID!, $input: DiscountCodeBxgyInput!) {
  discountCodeBxgyUpdate(id: $id, bxgyCodeDiscount: $input) {
    codeDiscountNode {
      id
      codeDiscount {
        ... on DiscountCodeBxgy {
          title
          status
          summary
          codes(first: 1) { nodes { code } }
        }
      }
    }
    userErrors { field code message }
  }
}`;

const COLOR_PATTERNS = [
  [/black\s*(?:and|&|\+|\/)\s*white|white\s*(?:and|&|\+|\/)\s*black/i, 'Black & White'],
  [/black\s*(?:and|&|\+|\/)\s*grey|grey\s*(?:and|&|\+|\/)\s*black|black\s*(?:and|&|\+|\/)\s*gray|gray\s*(?:and|&|\+|\/)\s*black/i, 'Black & Grey'],
  [/grey\s*(?:and|&|\+|\/)\s*white|white\s*(?:and|&|\+|\/)\s*grey|gray\s*(?:and|&|\+|\/)\s*white|white\s*(?:and|&|\+|\/)\s*gray/i, 'Grey & White'],
  [/blue\s*(?:and|&|\+|\/)?\s*lime|lime\s*(?:and|&|\+|\/)?\s*blue/i, 'Blue Lime'],
  [/light\s*blue/i, 'Light Blue'],
  [/dark\s*blue/i, 'Dark Blue'],
  [/\bnavy\b/i, 'Navy'],
  [/\bpink\b/i, 'Pink'],
  [/\bbrown\b/i, 'Brown'],
  [/\bbeige\b/i, 'Beige'],
  [/\bcream\b/i, 'Cream'],
  [/\bred\b/i, 'Red'],
  [/\bgreen\b/i, 'Green'],
  [/\blime\b/i, 'Lime'],
  [/\bwhite\b/i, 'White'],
  [/\bblack\b/i, 'Black'],
  [/\bgr[ae]y\b/i, 'Grey'],
  [/\bblue\b/i, 'Blue']
];

function productText(product) {
  return `${product.title || ''} ${product.categories.join(' ')}`;
}

function stableNameIndex(value, count) {
  if (!count) return 0;
  const text = String(value || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash % count;
}

function chooseNameVariant(product, variants) {
  const key = `${product?.id || ''}|${productText(product)}`;
  return variants[stableNameIndex(key, variants.length)];
}

function inferPlaceholderColor(product) {
  const text = productText(product);
  const hit = COLOR_PATTERNS.find(([pattern]) => pattern.test(text));
  return hit ? hit[1] : '';
}

function inferPlaceholderBase(product) {
  const text = productText(product).toLowerCase();
  if (/\b(sandals?|slides?|sliders?)\b/.test(text)) return /\b(slides?|sliders?)\b/.test(text) ? 'Classic Slides' : 'Classic Sandals';
  if (/\b(gel|kayano|asics)\b/.test(text)) return 'Gel Runners';
  if (/\b(b30|gats?|technical)\b/.test(text)) return chooseNameVariant(product, ['Panelled Runners', 'Retro Trainers', 'Court Runners', 'Low Trainers']);
  if (/\b(b22|runner|sneakers?|trainers?|shoes?|footwear)\b/.test(text)) return chooseNameVariant(product, ['Runner Sneakers', 'Court Trainers', 'Everyday Runners', 'Clean Trainers', 'Panelled Sneakers']);
  if (/\b(t-?shirt|tee|shirt)\b/.test(text)) return 'Simple T-Shirt';
  if (/\b(shorts?)\b/.test(text)) return 'Summer Shorts';
  if (/\b(tracksuit)\b/.test(text)) return 'Core Tracksuit';
  if (/\b(parka)\b/.test(text)) return 'Parka Jacket';
  if (/\b(puffer)\b/.test(text)) return 'Puffer Jacket';
  if (/\b(jacket|windrunner|coat|outerwear|clothing)\b/.test(text)) return 'Lightweight Jacket';
  if (/\b(watches?|timepieces?|datejust|daytona|submariner|oyster|gmt|rolex|cartier|patek|audemars|royal\s*oak)\b/.test(text)) return 'Classic Watch';
  if (/\b(earphones?|earbuds?|headphones?|airpods?)\b/.test(text)) return 'Essential Earphones';
  if (/\b(sunglasses?|glasses|shades)\b/.test(text)) return 'Sunglasses';
  if (/\b(wallets?|card\s*holders?|cardholders?)\b/.test(text)) return 'Card Holder';
  if (/\b(belts?)\b/.test(text)) return 'Leather Belt';
  if (/\b(caps?|hats?|beanies?)\b/.test(text)) return 'Cap';
  if (/\b(bracelets?|necklaces?|rings?|chains?|jewell?ery)\b/.test(text)) return 'Jewellery Piece';
  if (/\b(messenger|bags?|backpacks?|totes?|duffles?|crossbody)\b/.test(text)) return 'Messenger Bag';
  if (/\b(accessories?)\b/.test(text)) return 'Essential Accessory';
  return 'Select Piece';
}

function buildPlaceholderTitle(product) {
  const base = inferPlaceholderBase(product);
  const color = inferPlaceholderColor(product);
  return color ? `The ${base} - ${color}` : `The ${base}`;
}

function normalizePlaceholderTitleOverride(value) {
  const title = String(value || '').replace(/\s+/g, ' ').trim();
  if (!title) return '';
  if (title.length < 3) throw new Error('Shopify name must be at least 3 characters');
  if (title.length > 80) throw new Error('Shopify name must be 80 characters or less');
  return title;
}

function slugify(value) {
  return String(value || 'product')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function isDefaultClothingSizeList(value) {
  const clothing = new Set(['XS', 'S', 'M', 'L', 'XL']);
  const sizes = splitList(value).map(size => size.toUpperCase());
  return sizes.length > 0 && sizes.every(size => clothing.has(size));
}

function productLooksLikeFootwear(product) {
  const text = `${product.title || ''} ${product.categories.join(' ')}`.toLowerCase();
  return /\b(sandals?|slides?|sliders?|trainers?|sneakers?|shoes?|footwear|gats?|b22|b30|asics|gel|kayano|saucony)\b/.test(text);
}

function uniqueList(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function splitOptionValues(value) {
  if (Array.isArray(value) || typeof value === 'string') return uniqueList(splitList(value));
  return [];
}

function cleanOptionName(value, fallback = 'Style') {
  const name = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  return name || fallback;
}

function priceAmount(value) {
  const cleaned = String(value || '').replace(/[£$,\s]/g, '');
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]).toFixed(2) : '';
}

function normalizeStoredProduct(raw) {
  const title = raw.name || raw.title || raw.productName || '';
  const categories = splitList(raw.category || raw.categories);
  const image = raw.image || raw.imageUrl || raw.featuredImage || raw.thumbnail || raw.images?.[0]?.url || raw.images?.[0] || '';
  const variationValues = splitOptionValues(raw.variationValues ?? raw.variations ?? raw.variantValues ?? raw.colours ?? raw.colors);
  const variationName = variationValues.length
    ? cleanOptionName(raw.variationName || raw.variantOptionName || raw.optionName || raw.optionLabel, 'Style')
    : '';
  return {
    id: raw.id || raw.productId || raw.slug || slugify(title),
    title,
    price: priceAmount(raw.price || raw.price_gbp || raw.sale_price_gbp),
    link: raw.link || '',
    image,
    sizes: splitList(raw.sizes || raw.size || raw.availableSizes),
    variationName,
    variationValues,
    categories,
    active: raw.active !== false,
    raw
  };
}

function inferSizes(product, env) {
  if (productLooksLikeFootwear(product) && (!product.sizes.length || isDefaultClothingSizeList(product.sizes))) {
    return splitList(env.DEFAULT_FOOTWEAR_SIZES || 'UK 5,UK 6,UK 7,UK 8,UK 9,UK 10,UK 11,UK 12');
  }
  if (product.sizes.length) return product.sizes;
  const text = `${product.title || ''} ${product.categories.join(' ')}`.toLowerCase();
  if (/\b(t-?shirts?|tees?|shirts?|shorts?|jackets?|tracksuits?|hoodies?|clothing|tops?|parkas?|puffers?|coats?|casablanca)\b/.test(text)) {
    return splitList(env.DEFAULT_CLOTHING_SIZES || 'XS,S,M,L,XL');
  }
  if (/\b(watches?|timepieces?|datejust|daytona|submariner|oyster|gmt|rolex|cartier|patek|audemars|royal\s*oak|earphones?|earbuds?|headphones?|airpods?|sunglasses?|glasses|shades|wallets?|card\s*holders?|cardholders?|belts?|caps?|hats?|beanies?|bracelets?|necklaces?|rings?|chains?|jewell?ery|messenger|bags?|backpacks?|totes?|duffles?|crossbody|accessories?)\b/.test(text)) {
    return splitList(env.DEFAULT_ACCESSORY_SIZES || 'One Size');
  }
  return splitList(env.DEFAULT_SIZES || 'One Size');
}

function buildProductVariantPlan(product, env) {
  const sizes = uniqueList(inferSizes(product, env));
  const variationValues = splitOptionValues(product.variationValues);
  let variationName = variationValues.length ? cleanOptionName(product.variationName, 'Style') : '';
  if (variationName.toLowerCase() === 'size') variationName = 'Style';

  const productOptions = [];
  if (sizes.length) {
    productOptions.push({ name: 'Size', position: 1, values: sizes.map(size => ({ name: size })) });
  }
  if (variationValues.length) {
    productOptions.push({
      name: variationName,
      position: productOptions.length + 1,
      values: variationValues.map(value => ({ name: value }))
    });
  }

  const sizeList = sizes.length ? sizes : [null];
  const variationList = variationValues.length ? variationValues : [null];
  const variants = [];
  for (const size of sizeList) {
    for (const variation of variationList) {
      const optionValues = [];
      const skuParts = ['ESNTLS', slugify(product.id)];
      if (size) {
        optionValues.push({ optionName: 'Size', name: size });
        skuParts.push(slugify(size).toUpperCase());
      }
      if (variation) {
        optionValues.push({ optionName: variationName, name: variation });
        skuParts.push(slugify(variation).toUpperCase());
      }
      variants.push({
        optionValues,
        price: product.price,
        sku: skuParts.join('-')
      });
    }
  }

  return { sizes, variationName, variationValues, productOptions, variants };
}

function numericShopifyVariantId(value) {
  const match = String(value || '').match(/(\d+)(?:\D*)$/);
  return match ? match[1] : '';
}

function shopifyVariantKey(optionValues) {
  return (optionValues || []).map(optionValue => optionValue.name).filter(Boolean).join('|') || 'Default';
}

function buildShopifyVariantMap(shopifyVariants, variantPlan) {
  const nodes = Array.isArray(shopifyVariants) ? shopifyVariants : [];
  const map = {};
  const planned = variantPlan?.variants || [];

  nodes.forEach(node => {
    const id = numericShopifyVariantId(node?.id);
    if (!id) return;
    const title = String(node?.title || '').trim();
    if (title && title.toLowerCase() !== 'default title') {
      map[title] = id;
      const normalizedTitle = title.split(/\s*\/\s*/).filter(Boolean).join('|');
      if (normalizedTitle && normalizedTitle !== title) map[normalizedTitle] = id;
    }
  });
  if (Object.keys(map).length) return map;

  planned.forEach((plannedVariant, index) => {
    const key = shopifyVariantKey(plannedVariant.optionValues);
    if (map[key]) return;
    const node = nodes[index];
    const id = numericShopifyVariantId(node?.id);
    if (id) map[key] = id;
  });
  if (Object.keys(map).length) return map;
  nodes.forEach(node => {
    const id = numericShopifyVariantId(node?.id);
    if (id) map[node.title || 'Default'] = id;
  });
  return map;
}

async function shopifyVariantMapForProduct(env, productId, sourceProduct) {
  const variantPlan = buildProductVariantPlan(sourceProduct, env);
  const data = await shopifyGraphql(env, PRODUCT_VARIANTS_QUERY, { id: productId });
  return buildShopifyVariantMap(data.product?.variants?.nodes || [], variantPlan);
}

function shopifyVariantSize(node) {
  const selected = (node?.selectedOptions || []).find(option => /^size$/i.test(String(option?.name || '')));
  return String(selected?.value || node?.title || '').replace(/\s+/g, ' ').trim();
}

function buildShopifyVariantMapFromNodes(nodes) {
  const map = {};
  for (const node of nodes || []) {
    const id = numericShopifyVariantId(node?.id);
    const size = shopifyVariantSize(node);
    if (id && size && size.toLowerCase() !== 'default title') map[size] = id;
  }
  return map;
}

function productIsB30(rawProduct) {
  const text = `${rawProduct?.name || rawProduct?.title || ''} ${rawProduct?.brand || ''} ${rawProduct?.category || rawProduct?.categories || ''}`.toLowerCase();
  return /\bb30\b/.test(text);
}

function shopifyProductIdForRawProduct(rawProduct) {
  return rawProduct?.shopifyPlaceholder?.shopifyProductId || rawProduct?.shopifyProductId || '';
}

async function restoreB30ShopifyStockFromR2(env, requestBody = {}) {
  const { payload, list } = await readProductsPayload(env);
  const requestedSizes = uniqueList(splitList(requestBody.sizes || env.DEFAULT_FOOTWEAR_SIZES || 'UK 5,UK 6,UK 7,UK 8,UK 9,UK 10,UK 11,UK 12'));
  const sizes = requestedSizes.length ? requestedSizes : ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12'];
  const inventoryPolicy = String(requestBody.inventoryPolicy || 'CONTINUE').toUpperCase() === 'DENY' ? 'DENY' : 'CONTINUE';
  const createMissing = requestBody.createMissing !== false;
  const dryRun = requestBody.dryRun === true;
  const updatedAt = new Date().toISOString();
  const products = [];
  const skipped = [];

  for (const rawProduct of list) {
    if (!productIsB30(rawProduct)) continue;
    const shopifyProductId = shopifyProductIdForRawProduct(rawProduct);
    if (!shopifyProductId) {
      skipped.push({ id: rawProduct.id, name: rawProduct.name || rawProduct.title || '', reason: 'Missing linked Shopify product ID' });
      continue;
    }

    const product = normalizeStoredProduct({ ...rawProduct, sizes });
    const data = await shopifyGraphql(env, PRODUCT_VARIANTS_STOCK_QUERY, { id: shopifyProductId });
    const shopifyProduct = data.product;
    if (!shopifyProduct) {
      skipped.push({ id: rawProduct.id, name: product.title, reason: 'Shopify product was not found' });
      continue;
    }

    const variants = shopifyProduct.variants?.nodes || [];
    const bySize = new Map();
    for (const variant of variants) {
      const size = shopifyVariantSize(variant);
      if (size) bySize.set(size.toLowerCase(), variant);
    }

    const missingSizes = sizes.filter(size => !bySize.has(size.toLowerCase()));
    const created = [];
    if (createMissing && missingSizes.length && !dryRun) {
      const createData = await shopifyGraphql(env, PRODUCT_VARIANTS_BULK_CREATE_STOCK_MUTATION, {
        productId: shopifyProduct.id,
        variants: missingSizes.map(size => ({
          optionValues: [{ optionName: 'Size', name: size }],
          price: product.price,
          inventoryItem: { sku: `ESNTLS-${slugify(product.id)}-${slugify(size).toUpperCase()}` },
          inventoryPolicy
        }))
      });
      const result = createData.productVariantsBulkCreate;
      if (result.userErrors.length) throw new Error(`Shopify B30 variant create failed for ${product.title}: ${JSON.stringify(result.userErrors)}`);
      created.push(...(result.productVariants || []));
      for (const variant of created) {
        const size = shopifyVariantSize(variant);
        if (size) bySize.set(size.toLowerCase(), variant);
      }
    }

    const targets = sizes.map(size => bySize.get(size.toLowerCase())).filter(Boolean);
    const needsPolicyUpdate = targets.filter(variant => variant.inventoryPolicy !== inventoryPolicy);
    const policyUpdated = [];
    if (needsPolicyUpdate.length && !dryRun) {
      const updateData = await shopifyGraphql(env, PRODUCT_VARIANTS_POLICY_UPDATE_MUTATION, {
        productId: shopifyProduct.id,
        variants: needsPolicyUpdate.map(variant => ({ id: variant.id, inventoryPolicy }))
      });
      const result = updateData.productVariantsBulkUpdate;
      if (result.userErrors.length) throw new Error(`Shopify B30 stock policy update failed for ${product.title}: ${JSON.stringify(result.userErrors)}`);
      policyUpdated.push(...(result.productVariants || []));
      for (const variant of policyUpdated) {
        const size = shopifyVariantSize(variant);
        if (size) bySize.set(size.toLowerCase(), variant);
      }
    }

    const refreshedData = dryRun
      ? { product: shopifyProduct }
      : await shopifyGraphql(env, PRODUCT_VARIANTS_STOCK_QUERY, { id: shopifyProduct.id });
    const refreshedProduct = refreshedData.product || shopifyProduct;
    const refreshedVariants = refreshedProduct.variants?.nodes || [];
    const variantMap = buildShopifyVariantMapFromNodes(refreshedVariants);

    if (!dryRun) {
      rawProduct.sizes = sizes;
      rawProduct.shopifyVariants = variantMap;
      rawProduct.shopifyVariantId = Object.values(variantMap)[0] || rawProduct.shopifyVariantId || '';
      rawProduct.delivery = rawProduct.delivery || '7-12 Days';
      rawProduct.active = rawProduct.active !== false;
      rawProduct.archived = false;
      rawProduct.hidden = false;
      if (rawProduct.shopifyPlaceholder) {
        rawProduct.shopifyPlaceholder.sizes = sizes;
        rawProduct.shopifyPlaceholder.variants = variantMap;
        rawProduct.shopifyPlaceholder.variantCount = Object.keys(variantMap).length;
        rawProduct.shopifyPlaceholder.stockRestoredAt = updatedAt;
      }
      rawProduct.b30ShopifyStockRestore = {
        inventoryPolicy,
        sizes,
        created: created.map(variant => ({ id: numericShopifyVariantId(variant.id), title: variant.title || shopifyVariantSize(variant) })),
        policyUpdated: policyUpdated.map(variant => ({ id: numericShopifyVariantId(variant.id), title: variant.title || shopifyVariantSize(variant) })),
        updatedAt
      };
    }

    products.push({
      id: rawProduct.id,
      name: product.title,
      shopifyTitle: refreshedProduct.title,
      shopifyUrl: storefrontUrl(env, refreshedProduct.handle),
      missingBefore: missingSizes,
      created: created.map(variant => ({ id: numericShopifyVariantId(variant.id), title: variant.title || shopifyVariantSize(variant) })),
      policyUpdated: policyUpdated.map(variant => ({ id: numericShopifyVariantId(variant.id), title: variant.title || shopifyVariantSize(variant) })),
      variants: variantMap
    });
  }

  if (!dryRun) await writeProductsPayload(env, payload);
  return { ok: true, dryRun, inventoryPolicy, sizes, updated: products.length, skipped: skipped.length, products, skippedProducts: skipped, updatedAt };
}

function sourceTags(product) {
  return [
    'ESNTLS-BLANK-WORKFLOW',
    `ESNTLS-ID-${product.id}`,
    `ESNTLS-SOURCE-ID-${product.id}`,
    `ESNTLS-SOURCE-TITLE-${slugify(product.title)}`,
    ...product.categories
  ].filter(Boolean);
}

function shopifyStoreDomain(env) {
  if (!env.SHOPIFY_STORE_DOMAIN) throw new Error('SHOPIFY_STORE_DOMAIN env var not set');
  return env.SHOPIFY_STORE_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function storefrontUrl(env, handle) {
  return `https://${shopifyStoreDomain(env)}/products/${handle}`;
}

function extractShopifyHandle(value, env) {
  if (!value) return '';
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const storeHost = shopifyStoreDomain(env).replace(/^www\./, '').toLowerCase();
    const isShopify = host === storeHost || host.endsWith('.myshopify.com');
    if (!isShopify) return '';
    const match = url.pathname.match(/\/products\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

function extractWixSlug(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!/essentialsblanks\.net$/i.test(url.hostname.replace(/^www\./, ''))) return '';
    const match = url.pathname.match(/\/product-page\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

function isShopifyCheckoutUrl(value, env) {
  return !!extractShopifyHandle(value, env);
}

function isWixCheckoutUrl(value) {
  return !!extractWixSlug(value);
}

function hasUsableWixBackup(backup) {
  return !!(backup && (backup.url || backup.id) && backup.status !== 'error' && backup.status !== 'skipped');
}

function getCheckoutLinks(rawProduct, env) {
  const existing = rawProduct.checkoutLinks && typeof rawProduct.checkoutLinks === 'object'
    ? { ...rawProduct.checkoutLinks }
    : {};
  const currentLink = rawProduct.link || '';

  if (!existing.shopify) {
    const shopifyUrl = rawProduct.shopifyPlaceholder?.shopifyUrl || rawProduct.shopifyUrl || '';
    if (shopifyUrl) existing.shopify = shopifyUrl;
  }
  if (!existing.shopify && currentLink && isShopifyCheckoutUrl(currentLink, env)) {
    existing.shopify = currentLink;
  }

  if (!existing.originalWix && currentLink && isWixCheckoutUrl(currentLink)) {
    existing.originalWix = currentLink;
  }
  if (!existing.wix) {
    const wixUrl = rawProduct.wixBackupPlaceholder?.url || rawProduct.wixLink || rawProduct.wixUrl || existing.originalWix || '';
    if (wixUrl) existing.wix = wixUrl;
  }

  if (!existing.active) {
    existing.active = isShopifyCheckoutUrl(currentLink, env) ? 'shopify' : (isWixCheckoutUrl(currentLink) ? 'wix' : '');
  }
  return existing;
}

function rememberCheckoutLinks(rawProduct, env, updates = {}) {
  const links = getCheckoutLinks(rawProduct, env);
  if (updates.shopifyUrl) links.shopify = updates.shopifyUrl;
  if (updates.wixUrl) links.wix = updates.wixUrl;
  if (updates.originalWix && !links.originalWix) links.originalWix = updates.originalWix;
  if (updates.active) links.active = updates.active;
  links.updatedAt = new Date().toISOString();
  rawProduct.checkoutLinks = links;
  return links;
}

function checkoutUrlForMode(rawProduct, env, mode) {
  const links = getCheckoutLinks(rawProduct, env);
  if (mode === 'shopify') {
    return rawProduct.shopifyPlaceholder?.shopifyUrl || links.shopify || (isShopifyCheckoutUrl(rawProduct.link, env) ? rawProduct.link : '');
  }
  if (mode === 'wix') {
    return rawProduct.wixBackupPlaceholder?.url || links.wix || links.originalWix || (isWixCheckoutUrl(rawProduct.link) ? rawProduct.link : '');
  }
  return '';
}

function buildDescriptionHtml() {
  return [
    '<p><strong>Blank item = original item.</strong></p>',
    "<p><strong>Buy the blank item shown at checkout. You'll receive the original item you selected.</strong></p>"
  ].join('');
}

function shopifyOrderDisplayName(order) {
  return String(order?.name || order?.order_number || order?.id || '').replace(/\s+/g, ' ').trim();
}

function shopifyOrderId(order) {
  return String(order?.admin_graphql_api_id || order?.id || shopifyOrderDisplayName(order) || '').trim();
}

function supplierWhatsappOrderKey(order, deliveryId = '') {
  const stable = shopifyOrderId(order) || deliveryId || crypto.randomUUID();
  return `${WHATSAPP_ORDER_ROOT}${slugify(stable)}.json`;
}

function safeMessageLine(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitleKey(value) {
  return safeMessageLine(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeShopifyNumericId(value) {
  return numericShopifyVariantId(value);
}

function shopifyLineItems(order) {
  if (Array.isArray(order?.line_items)) return order.line_items;
  if (Array.isArray(order?.lineItems)) return order.lineItems;
  if (Array.isArray(order?.lineItems?.nodes)) return order.lineItems.nodes;
  if (Array.isArray(order?.lineItems?.edges)) {
    return order.lineItems.edges.map(edge => edge?.node).filter(Boolean);
  }
  return [];
}

function shopifyLineItemSku(lineItem) {
  return safeMessageLine(lineItem?.sku || lineItem?.variant?.sku || lineItem?.node?.sku || '');
}

function shopifySourceIdFromSku(lineItem) {
  const sku = shopifyLineItemSku(lineItem);
  const match = sku.match(/^ESNTLS[-_]?0*([0-9]+)(?:[-_]|$)/i);
  return match ? String(Number(match[1])) : '';
}

function linkedShopifyProductIds(rawProduct) {
  const placeholder = rawProduct?.shopifyPlaceholder || {};
  return uniqueList([
    rawProduct?.shopifyProductId,
    placeholder.shopifyProductId,
    rawProduct?.shopify?.productId
  ].map(normalizeShopifyNumericId).filter(Boolean));
}

function linkedShopifyVariantIds(rawProduct) {
  const placeholder = rawProduct?.shopifyPlaceholder || {};
  const maps = [
    placeholder.variants,
    rawProduct?.shopifyVariantMap,
    rawProduct?.shopifyVariants,
    rawProduct?.variants
  ];
  const ids = [];
  for (const map of maps) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
    for (const value of Object.values(map)) {
      const id = normalizeShopifyNumericId(value);
      if (id) ids.push(id);
    }
  }
  return uniqueList(ids);
}

function linkedShopifyTitleKeys(rawProduct) {
  const placeholder = rawProduct?.shopifyPlaceholder || {};
  return uniqueList([
    rawProduct?.shopifyTitle,
    placeholder.shopifyTitle,
    placeholder.title,
    rawProduct?.blankTitle
  ].map(normalizeTitleKey).filter(Boolean));
}

function resolveEsntlsProductForShopifyLineItem(lineItem, products) {
  const skuSourceId = shopifySourceIdFromSku(lineItem);
  if (skuSourceId) {
    const match = products.find(product => String(product.raw?.id || product.id) === skuSourceId);
    if (match) return match;
  }

  const productId = normalizeShopifyNumericId(lineItem?.product_id || lineItem?.productId || lineItem?.product?.id);
  const variantId = normalizeShopifyNumericId(lineItem?.variant_id || lineItem?.variantId || lineItem?.variant?.id);
  const titleKey = normalizeTitleKey(lineItem?.title || lineItem?.product_title || lineItem?.productTitle || '');

  if (productId) {
    const match = products.find(product => linkedShopifyProductIds(product.raw).includes(productId));
    if (match) return match;
  }

  if (variantId) {
    const match = products.find(product => linkedShopifyVariantIds(product.raw).includes(variantId));
    if (match) return match;
  }

  if (titleKey) {
    const match = products.find(product => linkedShopifyTitleKeys(product.raw).includes(titleKey));
    if (match) return match;
  }

  return null;
}

function isSupplierWhatsappExcludedItem(lineItem, product) {
  const sku = shopifyLineItemSku(lineItem);
  if (/^ESNTLS[-_]?0*54(?:[-_]|$)/i.test(sku)) return true;

  const sourceId = String(product?.raw?.id || product?.id || '').trim();
  if (sourceId === '54') return true;

  const text = normalizeTitleKey([
    product?.title,
    product?.raw?.name,
    lineItem?.title,
    lineItem?.name,
    lineItem?.product_title,
    lineItem?.variant_title,
    product?.raw?.shopifyPlaceholder?.shopifyTitle
  ].filter(Boolean).join(' '));

  return /\bair pro\b/.test(text) || /\bclassic essentials earphones\b/.test(text);
}

function optionLooksLikeSize(value) {
  const text = safeMessageLine(value).toUpperCase();
  return /^(UK\s*)?\d{1,2}(?:\.\d)?$/.test(text)
    || /^UK\s*\d{1,2}(?:\.\d)?$/.test(text)
    || /^(XXS|XS|S|M|L|XL|XXL|XXXL|ONE SIZE|OS|OSFA)$/.test(text);
}

function normalizeSupplierOption(value) {
  const text = safeMessageLine(value);
  if (!text || /^default title$/i.test(text)) return '';
  const ukMatch = text.match(/^UK\s*([0-9]{1,2}(?:\.\d)?)$/i) || text.match(/^([0-9]{1,2}(?:\.\d)?)$/);
  if (ukMatch) return `UK ${ukMatch[1]}`;
  return text;
}

function lineItemOptionParts(lineItem) {
  const parts = [];
  const variantTitle = normalizeSupplierOption(lineItem?.variant_title || lineItem?.variantTitle || lineItem?.variant?.title);
  if (variantTitle) {
    parts.push(...variantTitle.split(/\s*\/\s*/).map(normalizeSupplierOption).filter(Boolean));
  }

  const selectedOptions = lineItem?.selectedOptions || lineItem?.variant?.selectedOptions || [];
  if (Array.isArray(selectedOptions)) {
    for (const option of selectedOptions) {
      const name = safeMessageLine(option?.name);
      const value = normalizeSupplierOption(option?.value);
      if (!value || /^title$/i.test(name)) continue;
      parts.push(value);
    }
  }

  const properties = Array.isArray(lineItem?.properties) ? lineItem.properties : [];
  for (const property of properties) {
    const name = safeMessageLine(property?.name);
    const value = normalizeSupplierOption(property?.value);
    if (!value || name.startsWith('_')) continue;
    if (/email|phone|mobile|contact/i.test(name)) continue;
    parts.push(value);
  }

  const sizes = [];
  const other = [];
  for (const part of uniqueList(parts)) {
    if (optionLooksLikeSize(part)) sizes.push(part);
    else other.push(part);
  }
  return [...other, ...sizes];
}

function fallbackShopifyLineItemTitle(lineItem) {
  const title = safeMessageLine(lineItem?.title || lineItem?.product_title || lineItem?.productTitle || lineItem?.name);
  const variant = safeMessageLine(lineItem?.variant_title || lineItem?.variantTitle);
  if (title && variant && title.toLowerCase().endsWith(` - ${variant}`.toLowerCase())) {
    return title.slice(0, -variant.length - 3).trim();
  }
  return title || 'Unknown item';
}

function formatSupplierLineItem(lineItem, product) {
  const title = safeMessageLine(product?.title || product?.raw?.name || fallbackShopifyLineItemTitle(lineItem));
  const titleKey = normalizeTitleKey(title);
  const optionParts = lineItemOptionParts(lineItem).filter(option => {
    if (optionLooksLikeSize(option)) return true;
    const optionKey = normalizeTitleKey(option);
    return optionKey && !titleKey.includes(optionKey);
  });
  const quantity = Math.max(1, Number(lineItem?.quantity || lineItem?.current_quantity || 1));
  const base = [title, ...optionParts].filter(Boolean).join(' - ');
  return quantity > 1 ? `${base} x${quantity}` : base;
}

function shippingAddressLines(order) {
  const shipping = order?.shipping_address || order?.shippingAddress || {};
  const name = safeMessageLine(
    shipping.name ||
    [shipping.first_name || shipping.firstName, shipping.last_name || shipping.lastName].filter(Boolean).join(' ')
  );
  const province = safeMessageLine(shipping.province || shipping.province_code || shipping.provinceCode);
  const country = safeMessageLine(shipping.country || shipping.country_name || shipping.countryName || shipping.countryFullName || shipping.country_code);
  return [
    name,
    shipping.address1,
    shipping.address2,
    shipping.city,
    province,
    shipping.zip || shipping.postal_code || shipping.postalCode,
    country
  ].map(safeMessageLine).filter(Boolean);
}

function shippingAddressFields(order) {
  const shipping = order?.shipping_address || order?.shippingAddress || {};
  return {
    name: safeMessageLine(
      shipping.name ||
      [shipping.first_name || shipping.firstName, shipping.last_name || shipping.lastName].filter(Boolean).join(' ')
    ),
    address1: safeMessageLine(shipping.address1),
    address2: safeMessageLine(shipping.address2),
    city: safeMessageLine(shipping.city),
    province: safeMessageLine(shipping.province || shipping.province_code || shipping.provinceCode),
    postcode: safeMessageLine(shipping.zip || shipping.postal_code || shipping.postalCode),
    country: safeMessageLine(shipping.country || shipping.country_name || shipping.countryName || shipping.countryFullName || shipping.country_code)
  };
}

function r2PublicUrlForKey(key) {
  const cleanKey = safeMessageLine(key).replace(/^\/+/, '');
  return cleanKey ? `${PUBLIC_BASE}${cleanKey}` : '';
}

function supplierImageSourceUrl(value) {
  const image = safeMessageLine(value);
  if (!image) return '';
  if (image.startsWith(PUBLIC_BASE)) return image;
  if (/^https?:\/\//i.test(image)) {
    try {
      const parsed = new URL(image);
      if (/^(www\.)?esntlsclub\.com$/i.test(parsed.hostname) && parsed.pathname.startsWith('/media/')) {
        return r2PublicUrlForKey(decodeURIComponent(parsed.pathname.slice('/media/'.length)));
      }
    } catch {
      return image;
    }
    return image;
  }
  if (image.startsWith('/media/')) return r2PublicUrlForKey(image.slice('/media/'.length));
  if (image.startsWith('/')) return `https://esntlsclub.com${image}`;
  return r2PublicUrlForKey(image);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function extensionFromUrlOrContentType(sourceUrl, contentType) {
  try {
    const pathname = new URL(sourceUrl).pathname;
    const ext = pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  } catch {}
  return extensionForContentType(contentType);
}

async function mirrorSupplierSheetImage(env, sourceUrl, product) {
  if (!sourceUrl || sourceUrl.startsWith(PUBLIC_BASE) || !/^https?:\/\//i.test(sourceUrl)) return sourceUrl || '';
  if (!env.BUCKET) return '';

  const hash = (await sha256Hex(sourceUrl)).slice(0, 24);
  const productId = slugify(product?.raw?.id || product?.id || 'unmatched') || 'unmatched';
  const initialKey = `supplier-sheet-images/${productId}-${hash}`;

  const existing = await env.BUCKET.list({ prefix: initialKey, limit: 1 });
  const existingKey = existing.objects?.[0]?.key;
  if (existingKey) return r2PublicUrlForKey(existingKey);

  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'ESNTLS supplier sheet image sync' }
  });
  if (!response.ok) return '';

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) return '';

  const key = `${initialKey}.${extensionFromUrlOrContentType(sourceUrl, contentType)}`;
  await env.BUCKET.put(key, await response.arrayBuffer(), {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' }
  });
  return r2PublicUrlForKey(key);
}

async function firstSupplierSheetImageUrl(env, product, lineItem) {
  const raw = product?.raw || {};
  const candidates = [
    product?.image,
    raw.image,
    raw.imageUrl,
    raw.featuredImage,
    raw.thumbnail,
    raw.img,
    Array.isArray(raw.images) ? raw.images[0] : '',
    Array.isArray(raw.imgs) ? raw.imgs[0] : '',
    Array.isArray(raw.media) ? (raw.media[0]?.url || raw.media[0]) : '',
    lineItem?.image?.src,
    lineItem?.image?.url,
    lineItem?.variant?.image?.url
  ];
  for (const candidate of candidates) {
    const sourceUrl = supplierImageSourceUrl(candidate);
    if (!sourceUrl) continue;
    const image = await mirrorSupplierSheetImage(env, sourceUrl, product);
    if (image) return image;
  }
  return '';
}

function esntlsProductPageUrl(product) {
  const id = product?.raw?.id || product?.id;
  return id ? `https://esntlsclub.com/product.html?id=${encodeURIComponent(id)}` : '';
}

function sheetString(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').trim();
}

function googleSheetFormulaString(value) {
  return String(value || '').replace(/"/g, '""');
}

function googleImageFormula(imageUrl) {
  if (!imageUrl) return '';
  const escaped = googleSheetFormulaString(imageUrl);
  return `=IFERROR(IMAGE("${escaped}",4,96,96),"Image unavailable")`;
}

function supplierOrderLogKey(order, deliveryId = '') {
  const stable = shopifyOrderId(order) || deliveryId || crypto.randomUUID();
  return `${SUPPLIER_ORDER_ROOT}${slugify(stable)}.json`;
}

async function buildSupplierSheetRows(env, order) {
  const { list } = await readProductsPayload(env);
  const products = list.map(raw => {
    const normalized = normalizeStoredProduct(raw);
    return { ...normalized, raw };
  });

  const shipping = shippingAddressFields(order);
  if (!shipping.name && !shipping.address1) throw new Error('Order is missing a shipping address');

  const orderDate = sheetString(order?.created_at || order?.createdAt || new Date().toISOString());
  const orderName = shopifyOrderDisplayName(order);
  const rows = [];
  const excludedLineItems = [];
  const unresolvedLineItems = [];

  for (const lineItem of shopifyLineItems(order)) {
    const product = resolveEsntlsProductForShopifyLineItem(lineItem, products);
    if (isSupplierWhatsappExcludedItem(lineItem, product)) {
      excludedLineItems.push(fallbackShopifyLineItemTitle(lineItem));
      continue;
    }

    const optionParts = lineItemOptionParts(lineItem);
    const quantity = Math.max(1, Number(lineItem?.quantity || lineItem?.current_quantity || 1));
    const productTitle = safeMessageLine(product?.title || product?.raw?.name || fallbackShopifyLineItemTitle(lineItem));
    const imageUrl = await firstSupplierSheetImageUrl(env, product, lineItem);
    const productPage = esntlsProductPageUrl(product);
    if (!product) unresolvedLineItems.push(fallbackShopifyLineItemTitle(lineItem));

    rows.push([
      orderDate,
      orderName,
      shipping.name,
      shipping.address1,
      shipping.address2,
      shipping.city || shipping.province,
      shipping.postcode,
      shipping.country,
      googleImageFormula(imageUrl),
      '',
      productTitle,
      optionParts.join(' - '),
      quantity,
      'New',
      '',
      '',
      product ? '' : 'Check item match',
      'No'
    ]);
  }

  return { rows, excludedLineItems, unresolvedLineItems };
}

async function buildSupplierWhatsappOrder(env, order) {
  const { list } = await readProductsPayload(env);
  const products = list.map(raw => {
    const normalized = normalizeStoredProduct(raw);
    return { ...normalized, raw };
  });

  const address = shippingAddressLines(order);
  if (!address.length) throw new Error('Order is missing a shipping address');

  const sentLineItems = [];
  const excludedLineItems = [];
  for (const lineItem of shopifyLineItems(order)) {
    const product = resolveEsntlsProductForShopifyLineItem(lineItem, products);
    if (isSupplierWhatsappExcludedItem(lineItem, product)) {
      excludedLineItems.push(fallbackShopifyLineItemTitle(lineItem));
      continue;
    }
    sentLineItems.push(formatSupplierLineItem(lineItem, product));
  }

  if (!sentLineItems.length) {
    return {
      orderName: shopifyOrderDisplayName(order),
      message: '',
      sentLineItems,
      excludedLineItems,
      skipReason: 'No supplier line items after exclusions'
    };
  }

  return {
    orderName: shopifyOrderDisplayName(order),
    message: [...address, '', ...sentLineItems].join('\n'),
    sentLineItems,
    excludedLineItems,
    skipReason: ''
  };
}

function normalizeWhatsappNumber(value) {
  return String(value || '').replace(/[^\d]/g, '').replace(/^00/, '');
}

function whatsappRecipients(env) {
  const recipients = [
    ...splitList(env.WHATSAPP_SUPPLIER_TO),
    ...splitList(env.WHATSAPP_OWNER_TO)
  ].map(normalizeWhatsappNumber).filter(Boolean);
  return uniqueList(recipients);
}

function maskWhatsappRecipient(value) {
  const number = normalizeWhatsappNumber(value);
  if (number.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, number.length - 4))}${number.slice(-4)}`;
}

async function hmacSha256Base64(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, data);
  return bytesToBase64(new Uint8Array(signature));
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  try {
    const binary = atob(String(value || '').trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array();
  }
}

function base64UrlEncodeBytes(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeJson(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToArrayBuffer(pem) {
  const normalized = String(pem || '')
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const bytes = base64ToBytes(normalized);
  if (!bytes.length) throw new Error('GOOGLE_PRIVATE_KEY is not a valid private key');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function signGoogleJwt(unsignedJwt, privateKeyPem) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedJwt)
  );
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function getGoogleSheetsAccessToken(env) {
  const email = safeMessageLine(env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = String(env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!email) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL env var not set');
  if (!privateKey) throw new Error('GOOGLE_PRIVATE_KEY env var not set');

  const now = Math.floor(Date.now() / 1000);
  const cacheKey = `${email}:${privateKey.slice(-48)}`;
  if (
    googleSheetsTokenCache.cacheKey === cacheKey &&
    googleSheetsTokenCache.accessToken &&
    googleSheetsTokenCache.expiresAt > now + 60
  ) {
    return googleSheetsTokenCache.accessToken;
  }

  const unsignedJwt = [
    base64UrlEncodeJson({ alg: 'RS256', typ: 'JWT' }),
    base64UrlEncodeJson({
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })
  ].join('.');
  const assertion = `${unsignedJwt}.${await signGoogleJwt(unsignedJwt, privateKey)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.error || !data.access_token) {
    throw new Error(`Google Sheets authentication failed: ${data.error_description || data.error || response.status}`);
  }

  googleSheetsTokenCache = {
    cacheKey,
    accessToken: data.access_token,
    expiresAt: now + Math.max(60, Number(data.expires_in || 3600))
  };
  return data.access_token;
}

function googleSheetsTabName(env) {
  return sheetString(env.SUPPLIER_SHEET_TAB || 'Orders') || 'Orders';
}

function googleSheetsA1SheetName(tabName) {
  const name = googleSheetFormulaString(tabName);
  return /^[A-Za-z0-9_]+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

function supplierSheetConfigured(env) {
  return Boolean(env.GOOGLE_SUPPLIER_SHEET_ID && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY);
}

function supplierWhatsappEnabled(env) {
  return /^true$/i.test(String(env.SUPPLIER_WHATSAPP_ENABLED || '').trim());
}

async function appendRowsToSupplierGoogleSheet(env, rows) {
  if (!rows.length) return { status: 'skipped', reason: 'No supplier rows to append' };
  const sheetId = safeMessageLine(env.GOOGLE_SUPPLIER_SHEET_ID);
  if (!sheetId) throw new Error('GOOGLE_SUPPLIER_SHEET_ID env var not set');

  const accessToken = await getGoogleSheetsAccessToken(env);
  const range = `${googleSheetsA1SheetName(googleSheetsTabName(env))}!A:R`;
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      majorDimension: 'ROWS',
      values: rows
    })
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.error) {
    throw new Error(`Google Sheets append failed: ${JSON.stringify(data.error || data)}`);
  }
  return {
    status: 'appended',
    spreadsheetId: sheetId,
    tab: googleSheetsTabName(env),
    rowCount: rows.length,
    updatedRange: data.updates?.updatedRange || ''
  };
}

function constantTimeEqualBytes(a, b) {
  if (!a.length || !b.length) return false;
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const ai = i < a.length ? a[i] : 0;
    const bi = i < b.length ? b[i] : 0;
    diff |= ai ^ bi;
  }
  return diff === 0;
}

async function verifyShopifyWebhookRequest(req, rawBody, env) {
  const secret = env.SHOPIFY_WEBHOOK_SECRET || env.SHOPIFY_CLIENT_SECRET || '';
  if (!secret) {
    return { ok: false, status: 500, error: 'SHOPIFY_WEBHOOK_SECRET or SHOPIFY_CLIENT_SECRET is not configured' };
  }
  const supplied = req.headers.get('X-Shopify-Hmac-Sha256') || '';
  if (!supplied) return { ok: false, status: 401, error: 'Missing Shopify HMAC' };

  const expected = base64ToBytes(await hmacSha256Base64(secret, rawBody));
  const actual = base64ToBytes(supplied);
  if (!constantTimeEqualBytes(expected, actual)) {
    return { ok: false, status: 401, error: 'Invalid Shopify HMAC' };
  }
  return { ok: true };
}

async function handleShopifyOrderWebhook(req, env, ctx) {
  const rawBody = await req.arrayBuffer();
  const verification = await verifyShopifyWebhookRequest(req, rawBody, env);
  if (!verification.ok) return json({ error: verification.error }, verification.status);

  let order;
  try {
    order = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return json({ error: 'Invalid Shopify webhook JSON' }, 400);
  }

  const deliveryId = req.headers.get('X-Shopify-Webhook-Id') || '';
  ctx.waitUntil(
    processSupplierOrderWebhook(env, order, {
      deliveryId,
      source: 'shopify-orders-create-webhook',
      force: false
    }).catch(error => logSupplierOrderError(env, order, error, { deliveryId, source: 'shopify-orders-create-webhook' }))
  );

  return json({ ok: true, accepted: true, orderName: shopifyOrderDisplayName(order) || null }, 202);
}

async function processSupplierOrderWebhook(env, order, options = {}) {
  if (!env.BUCKET) throw new Error('BUCKET binding is not configured');

  const key = supplierOrderLogKey(order, options.deliveryId);
  if (!options.force) {
    const existing = await env.BUCKET.get(key);
    if (existing) {
      return { ok: true, status: 'skipped', reason: 'Order already processed', key };
    }
  }

  const built = await buildSupplierSheetRows(env, order);
  const baseRecord = {
    orderId: shopifyOrderId(order),
    orderName: shopifyOrderDisplayName(order),
    source: options.source || 'manual',
    deliveryId: options.deliveryId || '',
    rowCount: built.rows.length,
    excludedLineItems: built.excludedLineItems,
    unresolvedLineItems: built.unresolvedLineItems,
    createdAt: new Date().toISOString()
  };

  if (!built.rows.length) {
    if (options.dryRun !== false) {
      return {
        ok: true,
        status: 'skipped',
        reason: 'No supplier line items after exclusions',
        key,
        orderName: baseRecord.orderName,
        rowCount: 0,
        excludedLineItems: built.excludedLineItems,
        unresolvedLineItems: built.unresolvedLineItems
      };
    }
    await writeSupplierOrderLog(env, key, { ...baseRecord, status: 'skipped', reason: 'No supplier line items after exclusions' });
    return { ok: true, status: 'skipped', reason: 'No supplier line items after exclusions', key };
  }

  if (options.dryRun !== false) {
    return {
      ok: true,
      status: 'dry-run',
      key,
      orderName: baseRecord.orderName,
      rowCount: built.rows.length,
      rows: built.rows,
      excludedLineItems: built.excludedLineItems,
      unresolvedLineItems: built.unresolvedLineItems
    };
  }

  const sheet = supplierSheetConfigured(env)
    ? await appendRowsToSupplierGoogleSheet(env, built.rows)
    : {
        status: 'not_configured',
        reason: 'Set GOOGLE_SUPPLIER_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY'
      };

  const whatsapp = supplierWhatsappEnabled(env)
    ? await sendShopifyOrderToWhatsApp(env, order, {
        deliveryId: options.deliveryId,
        source: options.source || 'supplier-order-webhook',
        dryRun: false,
        force: true
      })
    : { status: 'disabled' };

  const status = sheet.status === 'appended' ? 'appended' : 'not_configured';
  await writeSupplierOrderLog(env, key, {
    ...baseRecord,
    status,
    sheet,
    whatsapp,
    appendedAt: sheet.status === 'appended' ? new Date().toISOString() : ''
  });

  return {
    ok: sheet.status === 'appended',
    status,
    key,
    orderName: baseRecord.orderName,
    rowCount: built.rows.length,
    sheet,
    whatsapp,
    excludedLineItems: built.excludedLineItems,
    unresolvedLineItems: built.unresolvedLineItems
  };
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function orderNameNumber(order) {
  const match = String(order?.name || order?.order_number || order?.number || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function graphOrderLineItemToWebhookLineItem(lineItem) {
  const variant = lineItem?.variant || {};
  const product = lineItem?.product || variant.product || {};
  const imageUrl = safeMessageLine(lineItem?.image?.url);
  return {
    admin_graphql_api_id: lineItem?.id || '',
    id: lineItem?.id || '',
    title: lineItem?.title || lineItem?.name || '',
    name: lineItem?.name || lineItem?.title || '',
    sku: lineItem?.sku || variant.sku || '',
    quantity: lineItem?.quantity,
    current_quantity: lineItem?.currentQuantity,
    variant_title: lineItem?.variantTitle || variant.title || '',
    product_id: product.id || '',
    variant_id: variant.id || '',
    image: imageUrl ? { src: imageUrl, url: imageUrl } : undefined,
    product,
    variant,
    selectedOptions: variant.selectedOptions || [],
    properties: Array.isArray(lineItem?.customAttributes)
      ? lineItem.customAttributes.map(attribute => ({
          name: attribute?.key || '',
          value: attribute?.value || ''
        }))
      : []
  };
}

function graphOrderToWebhookOrder(order) {
  const shipping = order?.shippingAddress || {};
  return {
    admin_graphql_api_id: order?.id || '',
    id: order?.id || '',
    name: order?.name || '',
    created_at: order?.createdAt || '',
    financial_status: order?.displayFinancialStatus || '',
    fulfillment_status: order?.displayFulfillmentStatus || '',
    shipping_address: {
      name: shipping.name || '',
      address1: shipping.address1 || '',
      address2: shipping.address2 || '',
      city: shipping.city || '',
      province: shipping.province || '',
      country: shipping.country || '',
      zip: shipping.zip || ''
    },
    line_items: (order?.lineItems?.nodes || []).map(graphOrderLineItemToWebhookLineItem)
  };
}

function supplierSyncSkipsOrder(order, options) {
  const orderNumber = orderNameNumber(order);
  if (options.afterOrderNumber && orderNumber && orderNumber <= options.afterOrderNumber) {
    return `At or before #${options.afterOrderNumber}`;
  }
  if (!options.includeUnpaid && String(order?.displayFinancialStatus || '').toUpperCase() !== 'PAID') {
    return `Financial status ${order?.displayFinancialStatus || 'unknown'}`;
  }
  if (!options.includeFulfilled && String(order?.displayFulfillmentStatus || '').toUpperCase() === 'FULFILLED') {
    return 'Already fulfilled';
  }
  if (!order?.shippingAddress) return 'Missing shipping address';
  return '';
}

async function syncRecentSupplierOrdersToSheet(env, requestBody = {}) {
  const first = clampInteger(requestBody.first, 50, 1, 50);
  const afterOrderNumber = clampInteger(requestBody.afterOrderNumber, 0, 0, 999999999);
  const options = {
    afterOrderNumber,
    includeFulfilled: requestBody.includeFulfilled === true,
    includeUnpaid: requestBody.includeUnpaid === true
  };
  const dryRun = requestBody.dryRun !== false;
  const force = requestBody.force === true;
  const query = safeMessageLine(requestBody.query || '');

  const data = await shopifyGraphql(env, RECENT_SUPPLIER_ORDERS_QUERY, { first, query });
  const nodes = data?.orders?.nodes || [];
  const skippedOrders = [];
  const candidates = [];

  for (const order of nodes) {
    const reason = supplierSyncSkipsOrder(order, options);
    if (reason) {
      skippedOrders.push({ orderName: order?.name || '', reason });
      continue;
    }
    candidates.push(order);
  }

  candidates.sort((a, b) => orderNameNumber(a) - orderNameNumber(b));

  const results = [];
  for (const order of candidates) {
    const supplierOrder = graphOrderToWebhookOrder(order);
    const result = await processSupplierOrderWebhook(env, supplierOrder, {
      dryRun,
      force,
      source: 'admin-supplier-sheet-sync'
    });
    results.push({
      orderName: result.orderName || supplierOrder.name,
      status: result.status,
      rowCount: result.rowCount || 0,
      key: result.key,
      excludedLineItems: result.excludedLineItems || [],
      unresolvedLineItems: result.unresolvedLineItems || []
    });
  }

  return {
    ok: true,
    dryRun,
    first,
    query,
    afterOrderNumber,
    fetched: nodes.length,
    considered: candidates.length,
    appendedOrders: results.filter(result => result.status === 'appended').length,
    appendedRows: results.reduce((total, result) => total + (result.status === 'appended' ? Number(result.rowCount || 0) : 0), 0),
    skippedOrders,
    results
  };
}

async function sendShopifyOrderToWhatsApp(env, order, options = {}) {
  if (!env.BUCKET) throw new Error('BUCKET binding is not configured');

  const key = supplierWhatsappOrderKey(order, options.deliveryId);
  if (!options.force) {
    const existing = await env.BUCKET.get(key);
    if (existing) {
      return { ok: true, status: 'skipped', reason: 'Order already processed', key };
    }
  }

  const built = await buildSupplierWhatsappOrder(env, order);
  const baseRecord = {
    orderId: shopifyOrderId(order),
    orderName: built.orderName,
    source: options.source || 'manual',
    deliveryId: options.deliveryId || '',
    sentLineItems: built.sentLineItems,
    excludedLineItems: built.excludedLineItems,
    message: built.message,
    createdAt: new Date().toISOString()
  };

  if (built.skipReason) {
    await writeWhatsappOrderLog(env, key, { ...baseRecord, status: 'skipped', reason: built.skipReason });
    return { ok: true, status: 'skipped', reason: built.skipReason, key, message: built.message };
  }

  if (options.dryRun !== false) {
    return { ok: true, status: 'dry-run', key, orderName: built.orderName, message: built.message };
  }

  const recipients = whatsappRecipients(env);
  if (!env.WHATSAPP_ACCESS_TOKEN) throw new Error('WHATSAPP_ACCESS_TOKEN env var not set');
  if (!env.WHATSAPP_PHONE_NUMBER_ID) throw new Error('WHATSAPP_PHONE_NUMBER_ID env var not set');
  if (!recipients.length) throw new Error('Set WHATSAPP_SUPPLIER_TO and optionally WHATSAPP_OWNER_TO');

  const results = [];
  for (const recipient of recipients) {
    const response = await sendWhatsappOrderMessage(env, recipient, built.message);
    results.push({ to: maskWhatsappRecipient(recipient), ...response });
  }

  await writeWhatsappOrderLog(env, key, {
    ...baseRecord,
    status: 'sent',
    sentAt: new Date().toISOString(),
    recipients: results
  });

  return { ok: true, status: 'sent', key, orderName: built.orderName, recipients: results, message: built.message };
}

async function sendWhatsappOrderMessage(env, to, message) {
  if (env.WHATSAPP_TEMPLATE_NAME) {
    return sendWhatsappTemplateMessage(env, to, message);
  }
  return sendWhatsappTextMessage(env, to, message);
}

function whatsappGraphMessagesUrl(env) {
  const version = String(env.WHATSAPP_GRAPH_VERSION || WHATSAPP_DEFAULT_GRAPH_VERSION).replace(/^\/+/, '');
  return `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

async function sendWhatsappTextMessage(env, to, message) {
  const response = await fetch(whatsappGraphMessagesUrl(env), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { preview_url: false, body: message }
    })
  });
  return parseWhatsappSendResponse(response);
}

async function sendWhatsappTemplateMessage(env, to, message) {
  const response = await fetch(whatsappGraphMessagesUrl(env), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: env.WHATSAPP_TEMPLATE_NAME,
        language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_GB' },
        components: [{
          type: 'body',
          parameters: [{ type: 'text', text: message }]
        }]
      }
    })
  });
  return parseWhatsappSendResponse(response);
}

async function parseWhatsappSendResponse(response) {
  const data = await readJsonResponse(response);
  if (!response.ok || data.error) {
    throw new Error(`WhatsApp API failed: ${JSON.stringify(data.error || data)}`);
  }
  return {
    providerMessageId: data.messages?.[0]?.id || '',
    providerStatus: data.messages?.[0]?.message_status || 'accepted'
  };
}

async function writeWhatsappOrderLog(env, key, record) {
  await env.BUCKET.put(key, JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: JSON_CONTENT_TYPE }
  });
}

async function writeSupplierOrderLog(env, key, record) {
  await env.BUCKET.put(key, JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: JSON_CONTENT_TYPE }
  });
}

async function logWhatsappOrderError(env, order, error, meta = {}) {
  try {
    const key = supplierWhatsappOrderKey(order, meta.deliveryId);
    await writeWhatsappOrderLog(env, key, {
      orderId: shopifyOrderId(order),
      orderName: shopifyOrderDisplayName(order),
      source: meta.source || 'shopify-orders-create-webhook',
      deliveryId: meta.deliveryId || '',
      status: 'error',
      error: error?.message || String(error),
      createdAt: new Date().toISOString()
    });
  } catch (logError) {
    console.error(JSON.stringify({
      event: 'supplier_whatsapp_log_failed',
      error: logError?.message || String(logError)
    }));
  }
}

async function logSupplierOrderError(env, order, error, meta = {}) {
  try {
    const key = supplierOrderLogKey(order, meta.deliveryId);
    await writeSupplierOrderLog(env, key, {
      orderId: shopifyOrderId(order),
      orderName: shopifyOrderDisplayName(order),
      source: meta.source || 'shopify-orders-create-webhook',
      deliveryId: meta.deliveryId || '',
      status: 'error',
      error: error?.message || String(error),
      createdAt: new Date().toISOString()
    });
  } catch (logError) {
    console.error(JSON.stringify({
      event: 'supplier_order_log_failed',
      error: logError?.message || String(logError)
    }));
  }
}

async function listWhatsappOrderLogs(env, limit = 50) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 50)));
  const listed = await env.BUCKET.list({ prefix: WHATSAPP_ORDER_ROOT, limit: safeLimit });
  const logs = [];
  for (const object of listed.objects || []) {
    const stored = await env.BUCKET.get(object.key);
    if (!stored) continue;
    try {
      const record = JSON.parse(await stored.text());
      logs.push({
        key: object.key,
        uploaded: object.uploaded,
        status: record.status,
        orderName: record.orderName,
        sentAt: record.sentAt || '',
        createdAt: record.createdAt || '',
        reason: record.reason || '',
        error: record.error || '',
        message: record.message || '',
        recipients: record.recipients || [],
        excludedLineItems: record.excludedLineItems || []
      });
    } catch {
      logs.push({ key: object.key, uploaded: object.uploaded, status: 'unreadable' });
    }
  }
  logs.sort((a, b) => String(b.createdAt || b.uploaded || '').localeCompare(String(a.createdAt || a.uploaded || '')));
  return { ok: true, logs };
}

async function listSupplierOrderLogs(env, limit = 50) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 50)));
  const listed = await env.BUCKET.list({ prefix: SUPPLIER_ORDER_ROOT, limit: safeLimit });
  const logs = [];
  for (const object of listed.objects || []) {
    const stored = await env.BUCKET.get(object.key);
    if (!stored) continue;
    try {
      const record = JSON.parse(await stored.text());
      logs.push({
        key: object.key,
        uploaded: object.uploaded,
        status: record.status,
        orderName: record.orderName,
        rowCount: record.rowCount || 0,
        sheet: record.sheet || null,
        whatsapp: record.whatsapp || null,
        appendedAt: record.appendedAt || '',
        createdAt: record.createdAt || '',
        reason: record.reason || '',
        error: record.error || '',
        excludedLineItems: record.excludedLineItems || [],
        unresolvedLineItems: record.unresolvedLineItems || []
      });
    } catch {
      logs.push({ key: object.key, uploaded: object.uploaded, status: 'unreadable' });
    }
  }
  logs.sort((a, b) => String(b.createdAt || b.uploaded || '').localeCompare(String(a.createdAt || a.uploaded || '')));
  return { ok: true, logs };
}

function sampleShopifyOrderForWhatsappTest() {
  return {
    id: `test-${Date.now()}`,
    name: '#WHATSAPP-TEST',
    shipping_address: {
      name: 'Test Customer',
      address1: '1 Test Street',
      city: 'London',
      zip: 'SW1A 1AA',
      country: 'United Kingdom'
    },
    line_items: [{
      title: 'Test ESNTLS Item',
      variant_title: 'UK 8',
      sku: 'ESNTLS-001-UK8',
      quantity: 1
    }]
  };
}

function buildShopifyImagePrompt(product, hasBackground) {
  const backgroundLine = hasBackground
    ? 'Use the provided ESNTLS grey concrete background plate as the final background so Shopify and Wix blank products share the same backdrop.'
    : 'Replace the original background with a neutral grey concrete floor/background matching clean ESNTLS Shopify blank product photography.';
  return [
    'Create a blank placeholder product image for ESNTLS Blanks.',
    `The source image for "${product.title}" is the subject reference.`,
    backgroundLine,
    'Use the source only to understand the broad item category, color family, angle, and scale.',
    'Create a new generic blank version of the item, not the exact source product with logos removed.',
    'The output must not be recognizable as the original branded/designer item. Change model-specific details such as panel shapes, overlays, sole tooling, tread pattern, stitching layout, lace arrangement, badges, hardware, trim, and decorative shapes.',
    'Keep it believable as the same kind of product and the same general colour, but make the design clearly different and unbranded.',
    'Remove visible branding, logos, labels, tags, marks, monograms, and readable text.',
    'Final composition should be one clean square ecommerce product photo with the full item visible, centered, and comfortably surrounded by grey concrete.',
    'Use only a subtle natural contact shadow. No unrealistic shadows, no floating effect, no props, no packaging, no text, no watermark, no extra products, no model.',
    'If a hand is in the source and is needed to hold the item naturally, keep the hand realistic and unchanged; otherwise show only the item.',
    'Do not use grass or any green outdoor background.'
  ].join('\n');
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 0, label = 'Request') {
  const timeout = Number(timeoutMs || 0);
  if (!timeout) return fetch(url, options);

  const controller = new AbortController();
  const parentSignal = options.signal;
  let timer = null;
  const abortFromParent = () => controller.abort(parentSignal.reason);

  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener('abort', abortFromParent, { once: true });
  }

  timer = setTimeout(() => {
    controller.abort(new Error(`${label} timed out after ${Math.round(timeout / 1000)}s`));
  }, timeout);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !(parentSignal && parentSignal.aborted)) {
      throw new Error(`${label} timed out after ${Math.round(timeout / 1000)}s`);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener('abort', abortFromParent);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shouldRetryImageDownload(status) {
  return [404, 408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

function base64ToBlob(base64, type = 'image/png') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function normalizeOpenAIImageMime(type, filename = '') {
  const raw = String(type || '').split(';')[0].trim().toLowerCase();
  if (raw === 'image/jpeg' || raw === 'image/jpg' || raw === 'image/pjpeg') return 'image/jpeg';
  if (raw === 'image/png') return 'image/png';
  if (raw === 'image/webp') return 'image/webp';
  if (raw.startsWith('image/')) return raw;

  const name = String(filename || '').toLowerCase();
  if (/\.(jpe?g)$/.test(name)) return 'image/jpeg';
  if (/\.png$/.test(name)) return 'image/png';
  if (/\.webp$/.test(name)) return 'image/webp';

  return raw || 'image/jpeg';
}

function isOpenAIImageMime(type) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(String(type || '').toLowerCase());
}

function requireOpenAIImageMime(type, label = 'Image') {
  if (!isOpenAIImageMime(type)) {
    throw new Error(`${label} must be JPEG, PNG, or WebP. The source returned ${type || 'an unknown format'}.`);
  }
  return type;
}

async function openAIImagePart(part, fallbackFilename = 'image.jpg') {
  const blob = part instanceof Blob ? part : part && part.blob;
  if (!(blob instanceof Blob)) throw new Error('Missing image blob');
  const filename = (part && (part.filename || part.name)) || fallbackFilename;
  const type = normalizeOpenAIImageMime((part && part.type) || blob.type, filename);
  requireOpenAIImageMime(type, filename);
  const currentType = String(blob.type || '').split(';')[0].trim().toLowerCase();
  if (currentType === type) return { blob, filename };
  return { blob: new Blob([await blob.arrayBuffer()], { type }), filename };
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchImageBlob(url, label, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 5));
  let lastStatus = 0;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, { headers: { accept: 'image/*,*/*' } }, Number(options.timeoutMs || 15000), `${label} download`);
      if (response.ok) {
        const pathname = new URL(url).pathname;
        const type = normalizeOpenAIImageMime(response.headers.get('content-type'), pathname);
        return { blob: await response.blob(), type, filename: slugify(pathname.split('/').pop()) || 'image' };
      }
      lastStatus = response.status;
      await response.body?.cancel?.();
      if (!shouldRetryImageDownload(response.status)) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(250 * attempt);
  }
  if (lastStatus) throw new Error(`${label} download failed: ${lastStatus}`);
  throw new Error(`${label} download failed${lastError ? `: ${lastError.message}` : ''}`);
}

function isAllowedYupooHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'yupoo.com' || host.endsWith('.yupoo.com');
}

function validateYupooUrl(value, label = 'Yupoo URL') {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error(`${label} must start with http or https`);
  if (!isAllowedYupooHost(parsed.hostname)) throw new Error(`${label} must be a yupoo.com link`);
  return parsed;
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x3D;/gi, '=')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([a-f0-9]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function normalizeYupooHtml(html) {
  return decodeHtmlEntities(html)
    .replace(/\\\//g, '/')
    .replace(/\\u002f/gi, '/')
    .replace(/\\u003a/gi, ':')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=');
}

function cleanYupooImageUrl(value, baseUrl) {
  let raw = decodeHtmlEntities(value).trim();
  if (!raw) return '';
  if (raw.startsWith('//')) raw = 'https:' + raw;
  let parsed;
  try {
    parsed = new URL(raw, baseUrl);
  } catch {
    return '';
  }
  if (!isAllowedYupooHost(parsed.hostname)) return '';
  if (!/(?:^|\.)photo\.yupoo\.com$|(?:^|\.)pic\.yupoo\.com$/i.test(parsed.hostname)) return '';
  if (/\/(?:icons?|avatar|logo|qrcode)\b/i.test(parsed.pathname)) return '';
  if (/\/(?:square|small|thumb|thumbnail|tiny|medium)\.(?:jpe?g|png|webp)$/i.test(parsed.pathname)) return '';
  if (!/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(parsed.pathname + parsed.search)) return '';
  parsed.hash = '';
  return parsed.href;
}

function uniquePush(list, seen, value) {
  if (!value || seen.has(value)) return false;
  seen.add(value);
  list.push(value);
  return true;
}

function yupooImageFolderKey(value) {
  try {
    const parsed = new URL(value);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 3) return '';
    return parsed.origin + '/' + parts.slice(0, -1).join('/');
  } catch {
    return '';
  }
}

function isGenericYupooImage(value) {
  try {
    return /\/(?:big|square|small|thumb|thumbnail|tiny|medium)\.(?:jpe?g|png|webp)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function addYupooImage(list, seen, value) {
  if (!value || seen.has(value)) return false;
  const folder = yupooImageFolderKey(value);
  if (folder) {
    const existingIndex = list.findIndex(item => yupooImageFolderKey(item) === folder);
    if (existingIndex >= 0) {
      const existing = list[existingIndex];
      if (isGenericYupooImage(existing) && !isGenericYupooImage(value)) {
        seen.delete(existing);
        seen.add(value);
        list[existingIndex] = value;
        return true;
      }
      return false;
    }
  }
  return uniquePush(list, seen, value);
}

function extractYupooImageUrls(html, pageUrl) {
  const normalized = normalizeYupooHtml(html);
  const images = [];
  const seen = new Set();
  const directRe = /((?:https?:)?\/\/(?:photo|pic)\.yupoo\.com\/[^"'<>\s\\)]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\s\\)]*)?)/gi;
  for (const match of normalized.matchAll(directRe)) {
    uniquePush(images, seen, cleanYupooImageUrl(match[1], pageUrl));
  }
  return images;
}

function extractYupooPageLinks(html, pageUrl) {
  const normalized = normalizeYupooHtml(html);
  const base = new URL(pageUrl);
  const links = [];
  const seen = new Set([base.href]);
  const hrefRe = /\b(?:href|data-href)=["']([^"']+)["']/gi;
  for (const match of normalized.matchAll(hrefRe)) {
    const href = decodeHtmlEntities(match[1]).trim();
    if (!href || /^(?:#|javascript:|mailto:|tel:)/i.test(href)) continue;
    let parsed;
    try {
      parsed = new URL(href, base.href);
    } catch {
      continue;
    }
    if (parsed.hostname !== base.hostname) continue;
    if (!/^https?:$/.test(parsed.protocol)) continue;
    if (/\.(?:jpe?g|png|webp|css|js|svg|ico)(?:$|\?)/i.test(parsed.pathname)) continue;
    if (parsed.pathname === '/' || (parsed.pathname === base.pathname && parsed.search === base.search)) continue;
    if (/\/(?:categories|collections|tag|search|login|about|contact)\b/i.test(parsed.pathname)) continue;
    parsed.hash = '';
    uniquePush(links, seen, parsed.href);
    if (links.length >= YUPOO_PAGE_CRAWL_LIMIT) break;
  }
  return links;
}

function yupooImageName(imageUrl, index) {
  let name = '';
  try {
    const parsed = new URL(imageUrl);
    name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
  } catch {}
  name = name.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '');
  if (!/\.(?:jpe?g|png|webp)$/i.test(name)) name = `${name || 'image'}.jpg`;
  return `yupoo_${String(index + 1).padStart(2, '0')}_${name}`;
}

async function fetchYupooHtml(pageUrl) {
  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ESNTLSPhotoStudio/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  if (!response.ok) throw new Error(`Yupoo page fetch failed: HTTP ${response.status}`);
  return response.text();
}

async function listYupooImages(rawUrl, requestedLimit) {
  const start = validateYupooUrl(rawUrl);
  const parsedLimit = parseInt(requestedLimit || YUPOO_IMPORT_LIMIT, 10);
  const limit = Math.min(Math.max(parsedLimit || YUPOO_IMPORT_LIMIT, 1), YUPOO_IMPORT_LIMIT);
  if (/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(start.pathname + start.search)) {
    const direct = cleanYupooImageUrl(start.href, start.href);
    return { ok: true, sourceUrl: start.href, count: direct ? 1 : 0, images: direct ? [{ url: direct, name: yupooImageName(direct, 0) }] : [] };
  }

  const queue = [start.href];
  const seenPages = new Set();
  const seenImages = new Set();
  const images = [];

  while (queue.length && seenPages.size < YUPOO_PAGE_CRAWL_LIMIT && images.length < limit) {
    const pageUrl = queue.shift();
    if (seenPages.has(pageUrl)) continue;
    seenPages.add(pageUrl);
    const html = await fetchYupooHtml(pageUrl);
    for (const imageUrl of extractYupooImageUrls(html, pageUrl)) {
      if (addYupooImage(images, seenImages, imageUrl) && images.length >= limit) break;
    }
    if (images.length >= limit) break;
    for (const link of extractYupooPageLinks(html, pageUrl)) {
      if (!seenPages.has(link) && !queue.includes(link)) queue.push(link);
      if (queue.length + seenPages.size >= YUPOO_PAGE_CRAWL_LIMIT) break;
    }
  }

  return {
    ok: true,
    sourceUrl: start.href,
    crawledPages: seenPages.size,
    count: images.length,
    images: images.slice(0, limit).map((url, index) => ({ url, name: yupooImageName(url, index) }))
  };
}

async function proxyYupooImage(rawUrl) {
  const parsed = validateYupooUrl(rawUrl, 'Yupoo image URL');
  const imageUrl = cleanYupooImageUrl(parsed.href, parsed.href);
  if (!imageUrl) throw new Error('URL is not a supported Yupoo image');
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ESNTLSPhotoStudio/1.0)',
      'Accept': 'image/jpeg,image/png,image/webp,image/*;q=0.8,*/*;q=0.2',
      'Referer': parsed.origin + '/'
    }
  });
  if (!response.ok) throw new Error(`Yupoo image download failed: HTTP ${response.status}`);
  const type = normalizeOpenAIImageMime(response.headers.get('content-type'), imageUrl);
  if (!type.startsWith('image/')) throw new Error('Yupoo URL did not return an image');
  requireOpenAIImageMime(type, 'Yupoo image');
  return new Response(response.body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': type,
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

async function requestOpenAIImageEdit(env, product, source, background, model, size) {
  const form = new FormData();
  const sourcePart = await openAIImagePart(source, 'source.jpg');
  const backgroundPart = background ? await openAIImagePart(background, 'esntls-background.jpg') : null;
  form.append('model', model);
  form.append('prompt', buildShopifyImagePrompt(product, !!background));
  form.append('size', size);
  if (env.OPENAI_IMAGE_QUALITY) form.append('quality', env.OPENAI_IMAGE_QUALITY);
  if (backgroundPart) {
    form.append('image[]', sourcePart.blob, sourcePart.filename);
    form.append('image[]', backgroundPart.blob, backgroundPart.filename);
  } else {
    form.append('image', sourcePart.blob, sourcePart.filename);
  }
  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`OpenAI image generation failed: ${JSON.stringify(data)}`);
  const first = data.data && data.data[0];
  if (first && first.b64_json) return base64ToBlob(first.b64_json, 'image/png');
  if (first && first.url) {
    const imageResponse = await fetch(first.url);
    if (!imageResponse.ok) throw new Error(`Generated image URL download failed: ${imageResponse.status}`);
    return imageResponse.blob();
  }
  throw new Error(`OpenAI image response did not include b64_json or url: ${JSON.stringify(data)}`);
}

function grassReplacementPrompt(productName = 'uploaded product') {
  return [
    'Use case: realistic ecommerce flat-lay background replacement for ESNTLSCLUB.',
    `Input image 1 is the product photo named "${String(productName || 'uploaded product').trim() || 'uploaded product'}".`,
    'Input image 2 is the original ESNTLSCLUB green grass background. Use it as the physical ground surface that the product is lying on.',
    'Create a 3:4 overhead flat-lay product photo where the product appears naturally placed on that exact supplied grass background.',
    'Preserve the product exactly: its shape, silhouette, colour, logos, printed text, texture, stitching, fabric grain, mesh holes, tags, defects, marks, wear, folds, and edge details.',
    'Preserve the exact number of products shown. Do not add duplicates, alternative colourways, extra garments, props, or a different arrangement. If the input contains a group or set, keep the same items and overlap order.',
    'Preserve any existing hands, arms, hangers, packaging, and other foreground details exactly. Do not add or remove them.',
    'Do not smooth, repaint, recolour, relight, retouch, redesign, clean, repair, de-wrinkle, upscale, or restyle the product. Avoid AI smoothing and retain the genuine fabric and material texture.',
    "Preserve the supplied ESNTLSCLUB background's exact green grass colour, texture, blade pattern, lighting, and natural imperfections. Do not replace it with different grass or generate a new outdoor environment.",
    'Do not invent, duplicate, extend, or add ESNTLSCLUB text, logos, watermarks, labels, props, hands, hangers, flowers, plants, soil, walls, or scenery.',
    'Only add subtle realism where the product touches the grass: a soft natural contact shadow, slight grass compression, and a small amount of grass naturally overlapping the lowest product edges.',
    'Shadows must be soft and believable. Do not create dramatic, floating, glossy, harsh, oversized, or unrealistic shadows.',
    'Keep realistic product scale and perspective. Size the product proportionally to the background like a genuine overhead photograph, not an oversized pasted cutout.',
    'Leave visible green grass around the product on every side. Most clothing should fill approximately 50-68% of the canvas. Shoes, watches, jewellery, and smaller accessories should appear proportionally smaller.',
    'Do not let the product touch the image borders unless it is already intentionally cropped in the source image.',
    'Centre the product like a clean ecommerce flat-lay. The result should look naturally photographed on grass, not AI-generated or digitally composited.',
    'If anything is uncertain, prioritise preserving the uploaded product and supplied grass background over inventing or improving details.'
  ].join(' ');
}

function buildGrassImagePrompt(prompt, hasReferences = false) {
  const fallback = grassReplacementPrompt();
  const referenceLine = hasReferences
    ? 'Use the additional reference images only to match the finished ESNTLS artificial-grass product-photo look: real phone photo, natural scale, camera distance, soft grounding, and grass texture. Do not copy or add products, boxes, cards, logos, stickers, packaging, hands, props, text, or layout from the reference images.'
    : '';
  return [String(prompt || fallback).trim() || fallback, referenceLine].filter(Boolean).join(' ');
}

async function requestOpenAIGrassImageEdit(env, source, background, prompt, model, size, quality, references = [], options = {}) {
  const form = new FormData();
  const sourcePart = await openAIImagePart(source, 'product.jpg');
  const backgroundPart = background ? await openAIImagePart(background, 'esntls-background.jpg') : null;
  form.append('model', model);
  form.append('image[]', sourcePart.blob, sourcePart.filename);
  if (backgroundPart) form.append('image[]', backgroundPart.blob, backgroundPart.filename);
  for (const reference of references.slice(0, 6)) {
    const referencePart = await openAIImagePart(reference, reference.filename || 'esntls-reference.jpg');
    form.append('image[]', referencePart.blob, referencePart.filename);
  }
  form.append('prompt', buildGrassImagePrompt(prompt, references.length > 0));
  form.append('size', size);
  if (quality) form.append('quality', quality);
  if (model === 'gpt-image-1' || model.startsWith('gpt-image-1.5')) {
    form.append('input_fidelity', 'high');
  }
  form.append('n', '1');

  const timeoutMs = Number(options.timeoutMs || 0);
  const response = await fetchWithTimeout('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form
  }, timeoutMs, `${model} image generation`);
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`${model}: OpenAI image generation failed: ${JSON.stringify(data)}`);
  const first = data.data && data.data[0];
  if (first && first.b64_json) return { blob: base64ToBlob(first.b64_json, 'image/png'), model, size };
  if (first && first.url) {
    const imageResponse = await fetchWithTimeout(first.url, {}, Number(options.downloadTimeoutMs || 30000), `${model} generated image download`);
    if (!imageResponse.ok) throw new Error(`${model}: Generated image URL download failed: ${imageResponse.status}`);
    return { blob: await imageResponse.blob(), model, size };
  }
  throw new Error(`${model}: OpenAI image response did not include b64_json or url: ${JSON.stringify(data)}`);
}

async function createGrassPreview(env, formData) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY env var not set');
  const image = formData.get('image') || formData.get('image[]');
  if (!(image instanceof Blob)) throw new Error('Missing image file');
  let backgroundFile = formData.get('background');
  let background = null;
  if (backgroundFile instanceof Blob) {
    background = {
      blob: backgroundFile,
      type: normalizeOpenAIImageMime(backgroundFile.type, backgroundFile.name),
      filename: backgroundFile.name || 'esntls-background.jpg'
    };
  } else {
    const backgroundUrl = env.GRASS_BACKGROUND_IMAGE_URL || DEFAULT_GRASS_BACKGROUND_URL;
    background = await fetchImageBlob(backgroundUrl, 'Grass background image');
  }

  const source = {
    blob: image,
    type: normalizeOpenAIImageMime(image.type, image.name),
    filename: image.name || 'product.jpg'
  };
  const prompt = formData.get('prompt') || '';
  const quality = formData.get('quality') || env.OPENAI_IMAGE_QUALITY || 'medium';
  const referenceFiles = [
    ...formData.getAll('reference'),
    ...formData.getAll('reference[]')
  ].filter(item => item instanceof Blob).map((file, index) => ({
    blob: file,
    type: normalizeOpenAIImageMime(file.type, file.name),
    filename: file.name || `esntls-reference-${index + 1}.jpg`
  }));
  const referenceUrls = [
    ...formData.getAll('referenceUrl'),
    ...formData.getAll('referenceUrl[]')
  ].map(value => String(value || '').trim()).filter(Boolean);
  const references = [...referenceFiles];
  for (const referenceUrl of referenceUrls.slice(0, Math.max(0, 6 - references.length))) {
    references.push(await fetchImageBlob(referenceUrl, 'Reference image'));
  }
  try {
    const result = await requestOpenAIGrassImageEdit(
      env,
      source,
      background,
      prompt,
      env.OPENAI_GRASS_IMAGE_MODEL || env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      env.OPENAI_GRASS_IMAGE_SIZE || '768x1024',
      quality,
      references
    );
    return {
      ok: true,
      b64: await blobToBase64(result.blob),
      contentType: result.blob.type || 'image/png',
      model: result.model,
      size: result.size
    };
  } catch (primaryError) {
    const result = await requestOpenAIGrassImageEdit(
      env,
      source,
      background,
      prompt,
      env.OPENAI_GRASS_FALLBACK_MODEL || 'gpt-image-1',
      env.OPENAI_GRASS_FALLBACK_SIZE || '1024x1536',
      quality,
      references
    );
    return {
      ok: true,
      b64: await blobToBase64(result.blob),
      contentType: result.blob.type || 'image/png',
      model: result.model,
      size: result.size,
      fallbackReason: primaryError.message
    };
  }
}

async function createGrassJob(req, env, formData, ctx) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY env var not set');
  const images = [
    ...formData.getAll('image'),
    ...formData.getAll('image[]')
  ].filter(item => item instanceof Blob);
  if (!images.length) throw new Error('Missing image file');

  const maxImages = Math.max(1, Math.min(Number(env.GRASS_JOB_MAX_IMAGES || 24), 40));
  const selectedImages = images.slice(0, maxImages);
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  const prefix = grassJobPrefix(jobId);
  const promptList = [
    ...formData.getAll('prompt[]'),
    ...formData.getAll('prompts[]')
  ].map(value => String(value || '').trim());
  const fallbackPrompt = String(formData.get('prompt') || '').trim();
  const quality = String(formData.get('quality') || env.OPENAI_IMAGE_QUALITY || 'medium').trim() || 'medium';
  const referenceUrls = [
    ...formData.getAll('referenceUrl'),
    ...formData.getAll('referenceUrl[]')
  ].map(value => String(value || '').trim()).filter(Boolean).slice(0, 6);

  let background = { kind: 'default', url: env.GRASS_BACKGROUND_IMAGE_URL || DEFAULT_GRASS_BACKGROUND_URL };
  const backgroundFile = formData.get('background');
  const backgroundUrl = String(formData.get('backgroundUrl') || '').trim();
  if (backgroundFile instanceof Blob) {
    const filename = safeJobFilename(backgroundFile.name || 'esntls-background.jpg');
    const contentType = requireOpenAIImageMime(normalizeOpenAIImageMime(backgroundFile.type, filename), 'Background image');
    const key = `${prefix}background/${crypto.randomUUID()}-${filename}`;
    await env.BUCKET.put(key, backgroundFile, {
      httpMetadata: { contentType, cacheControl: 'private, max-age=604800' },
      customMetadata: { createdBy: 'esntls-grass-job', role: 'background' }
    });
    background = { kind: 'stored', key, filename, contentType };
  } else if (backgroundUrl) {
    background = { kind: 'url', url: backgroundUrl };
  }

  const items = [];
  for (let i = 0; i < selectedImages.length; i++) {
    const image = selectedImages[i];
    const filename = safeJobFilename(image.name || `product-${i + 1}.jpg`);
    const contentType = requireOpenAIImageMime(normalizeOpenAIImageMime(image.type, filename), `Product image ${i + 1}`);
    const key = `${prefix}sources/${String(i + 1).padStart(2, '0')}-${crypto.randomUUID()}-${filename}`;
    await env.BUCKET.put(key, image, {
      httpMetadata: { contentType, cacheControl: 'private, max-age=604800' },
      customMetadata: { createdBy: 'esntls-grass-job', role: 'source' }
    });
    items.push({
      id: crypto.randomUUID(),
      index: i,
      status: 'queued',
      sourceKey: key,
      originalName: filename,
      contentType,
      prompt: promptList[i] || fallbackPrompt || grassReplacementPrompt(filename),
      createdAt: now
    });
  }

  const job = {
    id: jobId,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    quality,
    background,
    referenceUrls,
    total: items.length,
    completed: 0,
    failed: 0,
    cancelled: 0,
    items
  };

  await writeGrassJob(env, job);
  const queue = await enqueueGrassJob(env, job.id, ctx, 'created');
  return json({ ok: true, job: publicGrassJob(job), queue }, 202);
}

async function getGrassJobs(req, env, ctx) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (id) {
    let job = await readGrassJob(env, id);
    if (!job) return json({ error: 'Background job was not found' }, 404);
    if (isStaleGrassJob(job)) {
      job = await resumeGrassJob(env, job, ctx, 'stale-read-recovery');
    }
    return json({ ok: true, job: publicGrassJob(job) });
  }

  const listed = await env.BUCKET.list({ prefix: GRASS_JOB_ROOT, limit: 100 });
  const jobs = [];
  for (const object of listed.objects || []) {
    if (!object.key.endsWith('/job.json')) continue;
    const record = await env.BUCKET.get(object.key);
    if (!record) continue;
    try {
      jobs.push(publicGrassJob(await record.json(), { includeItems: false }));
    } catch {}
  }
  jobs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') || 12), 30));
  return json({ ok: true, jobs: jobs.slice(0, limit), truncated: listed.truncated, cursor: listed.cursor || null });
}

async function resumeGrassJobFromRequest(req, env, ctx) {
  const body = await req.json().catch(() => ({}));
  const id = body.id || new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'Missing background job id' }, 400);
  const job = await readGrassJob(env, id);
  if (!job) return json({ error: 'Background job was not found' }, 404);
  if (isGrassJobTerminal(job.status)) return json({ ok: true, job: publicGrassJob(job), alreadyFinished: true });
  const resumed = await resumeGrassJob(env, job, ctx, 'manual-resume');
  return json({ ok: true, job: publicGrassJob(resumed) }, 202);
}

async function retryFailedGrassJob(req, env, ctx) {
  const body = await req.json().catch(() => ({}));
  const id = body.id || new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'Missing background job id' }, 400);
  const job = await readGrassJob(env, id);
  if (!job) return json({ error: 'Background job was not found' }, 404);

  let retried = 0;
  const now = new Date().toISOString();
  for (const item of job.items || []) {
    if (item.status !== 'failed') continue;
    item.status = 'queued';
    item.error = null;
    item.finishedAt = null;
    item.retriedAt = now;
    item.retryCount = Number(item.retryCount || 0) + 1;
    retried++;
  }
  if (!retried) return json({ ok: true, job: publicGrassJob(job), retried: 0 });

  job.status = 'queued';
  job.finishedAt = null;
  job.failed = 0;
  job.completed = (job.items || []).filter(item => item.status === 'complete').length;
  job.cancelled = (job.items || []).filter(item => item.status === 'cancelled').length;
  await writeGrassJob(env, job);
  const queue = await enqueueGrassJob(env, job.id, ctx, 'retry-failed');
  const queuedJob = await readGrassJob(env, job.id);
  return json({ ok: true, retried, job: publicGrassJob(queuedJob || job), queue }, 202);
}

async function cancelGrassJob(req, env) {
  const body = await req.json().catch(() => ({}));
  const id = body.id || new URL(req.url).searchParams.get('id');
  if (!id) return json({ error: 'Missing background job id' }, 400);
  const job = await readGrassJob(env, id);
  if (!job) return json({ error: 'Background job was not found' }, 404);
  if (isGrassJobTerminal(job.status)) return json({ ok: true, job: publicGrassJob(job), alreadyFinished: true });

  const now = new Date().toISOString();
  for (const item of job.items || []) {
    if (['queued', 'running'].includes(item.status)) {
      item.status = 'cancelled';
      item.error = null;
      item.cancelledAt = now;
    }
  }
  job.status = 'cancelled';
  job.cancelledAt = now;
  job.finishedAt = now;
  job.completed = (job.items || []).filter(item => item.status === 'complete').length;
  job.failed = (job.items || []).filter(item => item.status === 'failed').length;
  job.cancelled = (job.items || []).filter(item => item.status === 'cancelled').length;
  await writeGrassJob(env, job);
  return json({ ok: true, job: publicGrassJob(job) });
}

async function enqueueGrassJob(env, jobId, ctx, reason) {
  const job = await readGrassJob(env, jobId);
  if (!job || isGrassJobTerminal(job.status)) return { method: 'none', count: 0 };

  const pending = (job.items || [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && item.status === 'queued');
  if (!pending.length) return { method: 'none', count: 0 };

  if (!env.GRASS_JOB_QUEUE || typeof env.GRASS_JOB_QUEUE.sendBatch !== 'function') {
    throw new Error('The ESNTLS background queue is not configured');
  }

  job.queue = {
    method: 'queue',
    reason,
    count: pending.length,
    enqueuedAt: new Date().toISOString()
  };
  await writeGrassJob(env, job);

  const messages = pending.map(({ item, index }) => ({
    body: { type: 'esntls-grass-job-item', jobId, itemId: item.id, index }
  }));
  for (let index = 0; index < messages.length; index += 100) {
    await env.GRASS_JOB_QUEUE.sendBatch(messages.slice(index, index + 100));
  }
  return { method: 'queue', reason, count: messages.length, enqueuedAt: new Date().toISOString() };
}

async function resumeGrassJob(env, job, ctx, reason) {
  for (const item of job.items || []) {
    if (item.status === 'running') {
      item.status = 'queued';
      item.error = null;
      item.resumedAt = new Date().toISOString();
    }
  }
  job.status = 'queued';
  job.finishedAt = null;
  await writeGrassJob(env, job);
  await enqueueGrassJob(env, job.id, ctx, reason);
  return (await readGrassJob(env, job.id)) || job;
}

async function processGrassJob(env, jobId) {
  let job = await readGrassJob(env, jobId);
  if (!job || isGrassJobTerminal(job.status)) return;

  for (let i = 0; i < (job.items || []).length; i++) {
    job = await readGrassJob(env, jobId);
    if (!job || isGrassJobTerminal(job.status)) return;
    const item = job.items[i];
    if (!item || ['complete', 'failed', 'cancelled'].includes(item.status)) continue;
    await processGrassJobItem(env, jobId, item.id, i);
  }
}

async function processGrassJobItem(env, jobId, itemId, fallbackIndex, options = {}) {
  let job = await readGrassJob(env, jobId);
  if (!job || isGrassJobTerminal(job.status)) return;
  const foundIndex = (job.items || []).findIndex(item => item.id === itemId);
  const index = foundIndex >= 0 ? foundIndex : fallbackIndex;
  const item = job.items[index];
  if (!item || ['complete', 'failed', 'cancelled'].includes(item.status)) {
    await finalizeGrassJob(env, jobId);
    return;
  }
  if (item.status === 'running' && !options.force) {
    const attemptedAt = grassItemAttemptTime(item);
    if (Number.isFinite(attemptedAt) && Date.now() - attemptedAt <= GRASS_JOB_STALE_AFTER_MS) return;
  }

  item.status = 'running';
  item.startedAt = item.startedAt || new Date().toISOString();
  item.lastAttemptAt = new Date().toISOString();
  item.error = null;
  job.status = 'running';
  job.startedAt = job.startedAt || new Date().toISOString();
  job.finishedAt = null;
  await writeGrassJob(env, job);

  try {
    const source = await grassJobBlobPart(env, item.sourceKey, item.originalName);
    const background = await grassJobBackgroundPart(env, job);
    const references = await grassJobReferenceParts(job.referenceUrls || []);
    const generated = await generateGrassJobImage(env, source, background, item.prompt, job.quality, references, options);
    const latest = await readGrassJob(env, jobId);
    if (!latest || latest.status === 'cancelled') return;
    const latestIndex = (latest.items || []).findIndex(entry => entry.id === item.id);
    const latestItem = latest.items[latestIndex >= 0 ? latestIndex : index];
    if (!latestItem || latestItem.status === 'cancelled') return;

    const bytes = new Uint8Array(await generated.blob.arrayBuffer());
    const filename = outputGrassJobFilename(item.originalName, generated.blob.type);
    const key = `${grassJobPrefix(jobId)}outputs/${String((latestIndex >= 0 ? latestIndex : index) + 1).padStart(2, '0')}-${crypto.randomUUID()}-${filename}`;
    await env.BUCKET.put(key, bytes, {
      httpMetadata: { contentType: generated.blob.type || 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { createdBy: 'esntls-grass-job', source: item.originalName || '' }
    });

    latestItem.status = 'complete';
    latestItem.finishedAt = new Date().toISOString();
    latestItem.error = null;
    latestItem.result = {
      key,
      url: PUBLIC_BASE + key,
      filename,
      contentType: generated.blob.type || 'image/png',
      size: bytes.byteLength,
      model: generated.model,
      imageSize: generated.size,
      fallbackReason: generated.fallbackReason || ''
    };
    await writeGrassJob(env, latest);
  } catch (error) {
    const latest = await readGrassJob(env, jobId);
    if (!latest || latest.status === 'cancelled') return;
    const latestIndex = (latest.items || []).findIndex(entry => entry.id === item.id);
    const latestItem = latest.items[latestIndex >= 0 ? latestIndex : index];
    if (latestItem && latestItem.status !== 'cancelled') {
      latestItem.status = 'failed';
      latestItem.finishedAt = new Date().toISOString();
      latestItem.error = error.message || 'Generation failed';
      await writeGrassJob(env, latest);
    }
  }

  await finalizeGrassJob(env, jobId);
}

async function generateGrassJobImage(env, source, background, prompt, quality, references, options = {}) {
  const timeoutMs = Math.max(15000, Number(options.timeoutMs || env.GRASS_JOB_OPENAI_TIMEOUT_MS || GRASS_JOB_OPENAI_TIMEOUT_MS));
  try {
    return await requestOpenAIGrassImageEdit(
      env,
      source,
      background,
      prompt,
      env.OPENAI_GRASS_IMAGE_MODEL || env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      env.OPENAI_GRASS_IMAGE_SIZE || '768x1024',
      quality,
      references,
      { timeoutMs }
    );
  } catch (primaryError) {
    if (/timed out after/i.test(primaryError.message || '')) throw primaryError;
    const result = await requestOpenAIGrassImageEdit(
      env,
      source,
      background,
      prompt,
      env.OPENAI_GRASS_FALLBACK_MODEL || 'gpt-image-1',
      env.OPENAI_GRASS_FALLBACK_SIZE || '1024x1536',
      quality,
      references,
      { timeoutMs }
    );
    return { ...result, fallbackReason: primaryError.message };
  }
}

async function finalizeGrassJob(env, jobId) {
  const job = await readGrassJob(env, jobId);
  if (!job) return null;
  job.completed = (job.items || []).filter(item => item.status === 'complete').length;
  job.failed = (job.items || []).filter(item => item.status === 'failed').length;
  job.cancelled = (job.items || []).filter(item => item.status === 'cancelled').length;
  const total = job.total || (job.items || []).length || 0;
  if (job.status === 'cancelled') {
    job.finishedAt = job.finishedAt || new Date().toISOString();
  } else if (job.completed + job.failed + job.cancelled >= total) {
    job.status = job.completed === total ? 'complete' : job.completed > 0 ? 'partial' : job.cancelled ? 'cancelled' : 'failed';
    job.finishedAt = new Date().toISOString();
  } else {
    job.status = 'running';
    job.finishedAt = null;
  }
  await writeGrassJob(env, job);
  return job;
}

function grassItemAttemptTime(item) {
  return Date.parse(item.lastAttemptAt || item.startedAt || item.createdAt || '');
}

function resetStaleGrassJobItems(job, force = false) {
  const now = Date.now();
  let reset = 0;
  for (const item of job.items || []) {
    if (item.status !== 'running') continue;
    const attemptAt = grassItemAttemptTime(item);
    const stale = !Number.isFinite(attemptAt) || now - attemptAt > GRASS_JOB_STALE_AFTER_MS;
    if (!force && !stale) continue;
    item.status = 'queued';
    item.error = null;
    item.resumedAt = new Date().toISOString();
    reset++;
  }
  if (reset) {
    job.status = 'queued';
    job.finishedAt = null;
  }
  return reset;
}

async function processNextGrassJobItem(env, jobId, options = {}) {
  let job = await readGrassJob(env, jobId);
  if (!job) throw new Error('Background job was not found');
  if (isGrassJobTerminal(job.status)) return job;

  const reset = resetStaleGrassJobItems(job, !!options.force);
  if (reset) await writeGrassJob(env, job);

  job = await readGrassJob(env, jobId) || job;
  if ((job.items || []).some(item => item.status === 'running')) return job;

  const index = (job.items || []).findIndex(item => item.status === 'queued');
  if (index < 0) return await finalizeGrassJob(env, jobId) || job;

  const item = job.items[index];
  await processGrassJobItem(env, jobId, item.id, index, {
    timeoutMs: Math.max(15000, Number(options.timeoutMs || env.GRASS_JOB_FOREGROUND_TIMEOUT_MS || GRASS_JOB_FOREGROUND_TIMEOUT_MS))
  });

  return await readGrassJob(env, jobId) || job;
}

function grassJobPrefix(jobId) {
  return `${GRASS_JOB_ROOT}${jobId}/`;
}

function grassJobRecordKey(jobId) {
  return `${grassJobPrefix(jobId)}job.json`;
}

async function readGrassJob(env, jobId) {
  const object = await env.BUCKET.get(grassJobRecordKey(jobId));
  if (!object) return null;
  return await object.json();
}

async function writeGrassJob(env, job) {
  const record = { ...job, updatedAt: new Date().toISOString() };
  await env.BUCKET.put(grassJobRecordKey(job.id), JSON.stringify(record, null, 2) + '\n', {
    httpMetadata: { contentType: JSON_CONTENT_TYPE, cacheControl: 'private, max-age=0, no-store' },
    customMetadata: { createdBy: 'esntls-grass-job', role: 'record' }
  });
  return record;
}

function isGrassJobTerminal(status) {
  return GRASS_JOB_TERMINAL_STATUSES.includes(String(status || ''));
}

function isStaleGrassJob(job) {
  if (!job || isGrassJobTerminal(job.status)) return false;
  if (job.queue?.method === 'queue') return false;
  const updatedAt = Date.parse(job.updatedAt || job.startedAt || job.createdAt || '');
  if (!Number.isFinite(updatedAt)) return false;
  const incomplete = Number(job.completed || 0) + Number(job.failed || 0) + Number(job.cancelled || 0) < Number(job.total || job.items?.length || 0);
  return incomplete && Date.now() - updatedAt > GRASS_JOB_STALE_AFTER_MS;
}

function publicGrassJob(job, options = {}) {
  const includeItems = options.includeItems !== false;
  const publicValue = {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    quality: job.quality || 'medium',
    total: job.total || job.items?.length || 0,
    completed: job.completed || 0,
    failed: job.failed || 0,
    cancelled: job.cancelled || 0
  };
  if (includeItems) {
    publicValue.items = (job.items || []).map((item, index) => ({
      id: item.id,
      status: item.status,
      originalName: item.originalName || `product-${index + 1}.jpg`,
      error: item.error || null,
      result: item.result || null
    }));
  }
  return publicValue;
}

async function grassJobBlobPart(env, key, fallbackFilename) {
  const object = await env.BUCKET.get(key);
  if (!object) throw new Error('Stored job source image was not found');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const contentType = requireOpenAIImageMime(normalizeOpenAIImageMime(headers.get('content-type'), fallbackFilename || key), fallbackFilename || key);
  return {
    blob: new Blob([await object.arrayBuffer()], { type: contentType }),
    type: contentType,
    filename: fallbackFilename || key.split('/').pop() || 'image.jpg'
  };
}

async function grassJobBackgroundPart(env, job) {
  if (job.background?.kind === 'stored' && job.background.key) {
    return await grassJobBlobPart(env, job.background.key, job.background.filename || 'esntls-background.jpg');
  }
  const url = job.background?.url || env.GRASS_BACKGROUND_IMAGE_URL || DEFAULT_GRASS_BACKGROUND_URL;
  return await fetchImageBlob(url, 'Grass background image');
}

async function grassJobReferenceParts(referenceUrls) {
  const references = [];
  for (const referenceUrl of (referenceUrls || []).slice(0, 6)) {
    references.push(await fetchImageBlob(referenceUrl, 'Reference image'));
  }
  return references;
}

function safeJobFilename(value) {
  const clean = String(value || 'image.jpg')
    .replace(/[\/'\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return clean || 'image.jpg';
}

function extensionForContentType(contentType) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/avif') return 'avif';
  return 'png';
}

function outputGrassJobFilename(originalName, contentType) {
  const base = safeJobFilename(originalName || 'esntls-grass-output.png').replace(/\.[a-z0-9]+$/i, '') || 'esntls-grass-output';
  return `${base}-grass.${extensionForContentType(contentType)}`;
}

function validateR2ObjectKey(value, label) {
  const key = String(value || '').trim();
  if (!key) throw new Error(`${label} is required`);
  if (key.startsWith('/') || key.includes('..') || key.includes('\\')) throw new Error(`${label} is invalid`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/.test(key)) throw new Error(`${label} contains unsupported characters`);
  return key;
}

function validateR2ImageKey(value, label) {
  const key = validateR2ObjectKey(value, label);
  if (!/\.(?:jpe?g|png|webp|gif|avif)$/i.test(key)) throw new Error(`${label} must be an image key`);
  return key;
}

async function copyR2Object(env, requestBody) {
  if (!env.BUCKET) throw new Error('BUCKET binding is not configured');
  const sourceKey = validateR2ImageKey(requestBody.sourceKey, 'sourceKey');
  const destKey = validateR2ImageKey(requestBody.destKey, 'destKey');
  const object = await env.BUCKET.get(sourceKey);
  if (!object) throw new Error('Source image was not found');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const contentType = normalizeOpenAIImageMime(headers.get('content-type'), sourceKey);
  await env.BUCKET.put(destKey, await object.arrayBuffer(), {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { createdBy: 'esntls-admin-copy', sourceKey }
  });

  return { ok: true, sourceKey, key: destKey, url: PUBLIC_BASE + destKey };
}

function sourceImageFromRequestBody(value) {
  const source = value && typeof value === 'object' ? value : null;
  const base64 = String(source?.base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!base64) return null;
  const filename = slugify(source.filename || 'source-image') || 'source-image';
  const type = normalizeOpenAIImageMime(source.contentType, filename);
  return { blob: base64ToBlob(base64, type), type, filename };
}

function studioMediaKeyFromUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (!url.pathname.startsWith('/media/')) return '';
  const key = url.pathname.slice('/media/'.length).split('/').map(part => decodeURIComponent(part)).join('/');
  return key.startsWith('photo-studio-v2/generated/') ? key : '';
}

async function sourceImageFromStudioMedia(env, value) {
  if (!env.ESNTLS_STUDIO_MEDIA) return null;
  const key = studioMediaKeyFromUrl(value);
  if (!key) return null;
  const object = await env.ESNTLS_STUDIO_MEDIA.get(key);
  if (!object) return null;
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const filename = slugify(key.split('/').pop()) || 'source-image';
  const type = normalizeOpenAIImageMime(headers.get('content-type'), filename);
  return { blob: new Blob([await object.arrayBuffer()], { type }), type, filename };
}

async function generateBlankImage(env, product, sourceOverride = null) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY env var not set');
  if (!product.image) throw new Error('Product is missing an image');
  const source = sourceOverride || await sourceImageFromStudioMedia(env, product.image) || await fetchImageBlob(product.image, 'Source image');
  let background = null;
  const backgroundUrls = splitList(env.SHOPIFY_BLANK_BACKGROUND_URL);
  if (!backgroundUrls.length) backgroundUrls.push(DEFAULT_BACKGROUND_URL, FALLBACK_BACKGROUND_URL);
  for (const backgroundUrl of backgroundUrls) {
    try {
      background = await fetchImageBlob(backgroundUrl, 'Background image');
      break;
    } catch {
      background = null;
    }
  }
  return requestOpenAIImageEdit(
    env,
    product,
    source,
    background,
    env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    env.OPENAI_IMAGE_SIZE || '1024x1024'
  );
}

let cachedShopifyAccessToken = null;
let cachedShopifyAccessTokenExpiresAt = 0;

async function getShopifyAccessToken(env) {
  if (env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET) {
    try {
      return await getShopifyClientCredentialsToken(env);
    } catch (error) {
      if (!env.SHOPIFY_ADMIN_ACCESS_TOKEN) throw error;
      if (!/app_not_installed/i.test(error.message)) throw error;
    }
  }
  if (env.SHOPIFY_ADMIN_ACCESS_TOKEN) return env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  throw new Error('Set SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET, or replace SHOPIFY_ADMIN_ACCESS_TOKEN with a valid Shopify Admin API access token.');
}

async function getShopifyClientCredentialsToken(env) {
  if (cachedShopifyAccessToken && Date.now() < cachedShopifyAccessTokenExpiresAt - 60000) return cachedShopifyAccessToken;
  const body = new URLSearchParams({
    client_id: env.SHOPIFY_CLIENT_ID,
    client_secret: env.SHOPIFY_CLIENT_SECRET,
    grant_type: 'client_credentials'
  });
  const response = await fetch(`https://${shopifyStoreDomain(env)}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !data.access_token) throw new Error(`Shopify access token request failed: ${JSON.stringify(data)}`);
  cachedShopifyAccessToken = data.access_token;
  cachedShopifyAccessTokenExpiresAt = Date.now() + Number(data.expires_in || 86400) * 1000;
  return cachedShopifyAccessToken;
}

async function shopifyGraphql(env, query, variables) {
  const response = await fetch(`https://${shopifyStoreDomain(env)}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': await getShopifyAccessToken(env)
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.errors?.length) {
    const details = JSON.stringify(data.errors || data);
    if (response.status === 401 || /Invalid API key or access token/i.test(details)) {
      throw new Error('Shopify authentication failed. Add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET from the installed Shopify app, or replace SHOPIFY_ADMIN_ACCESS_TOKEN with a valid Admin API access token.');
    }
    throw new Error(`Shopify GraphQL failed: ${details}`);
  }
  return data.data;
}

async function launchFootwearBundleDiscount(env, bundle) {
  const code = bundle.code;
  const existingData = await shopifyGraphql(env, DISCOUNT_BY_CODE_QUERY, { code });
  const existing = existingData.codeDiscountNodeByCode;

  const object = await env.BUCKET.get('products.json');
  if (!object) throw new Error('products.json was not found in R2');
  const payload = JSON.parse(await object.text());
  const products = Array.isArray(payload) ? payload : (Array.isArray(payload.products) ? payload.products : []);
  const productIds = [...new Set(products
    .filter(product => String(product.brand || '').toLowerCase() === bundle.brand)
    .map(product => product.shopifyPlaceholder?.shopifyProductId || product.shopifyProductId)
    .filter(Boolean))];
  if (productIds.length < 2) throw new Error(`At least two linked ${bundle.label} Shopify products are required`);

  const input = {
    title: bundle.title,
    code,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    context: { all: 'ALL' },
    minimumRequirement: { quantity: { greaterThanOrEqualToQuantity: '2' } },
    customerGets: {
      value: { discountAmount: { amount: bundle.discountAmount, appliesOnEachItem: false } },
      items: { products: { productsToAdd: productIds } }
    },
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }
  };
  const updateInput = { ...input };
  delete updateInput.code;
  const data = existing
    ? await shopifyGraphql(env, B30_DISCOUNT_UPDATE_MUTATION, { id: existing.id, input: updateInput })
    : await shopifyGraphql(env, B30_DISCOUNT_CREATE_MUTATION, { input });
  const result = existing ? data.discountCodeBasicUpdate : data.discountCodeBasicCreate;
  if (result.userErrors.length) throw new Error(`Shopify ${bundle.label} discount failed: ${JSON.stringify(result.userErrors)}`);
  return {
    ok: true,
    status: existing ? 'updated' : 'created',
    eligibleProductCount: productIds.length,
    id: result.codeDiscountNode.id,
    discount: result.codeDiscountNode.codeDiscount
  };
}

async function launchB30BundleDiscount(env) {
  return launchFootwearBundleDiscount(env, {
    brand: 'b30',
    label: 'B30',
    code: 'B30PAIR',
    title: 'Any 2 B30s for GBP 179.99',
    discountAmount: '19.99'
  });
}

async function launchB22BundleDiscount(env) {
  return launchFootwearBundleDiscount(env, {
    brand: 'b22',
    label: 'B22',
    code: 'B22PAIR',
    title: 'Any 2 B22s for GBP 229.99',
    discountAmount: '29.99'
  });
}

async function launchAirProAddonDiscount(env) {
  const code = 'AIRPROADDON';
  const existingData = await shopifyGraphql(env, DISCOUNT_BY_CODE_QUERY, { code });
  const existing = existingData.codeDiscountNodeByCode;

  const object = await env.BUCKET.get('products.json');
  if (!object) throw new Error('products.json was not found in R2');
  const payload = JSON.parse(await object.text());
  const products = Array.isArray(payload) ? payload : (Array.isArray(payload.products) ? payload.products : []);
  const airProProduct = products.find(product => (
    String(product.id) === '54' ||
    /\bair\s*pro\b/i.test(String(product.name || product.title || ''))
  ));
  const shopifyProductId = airProProduct?.shopifyPlaceholder?.shopifyProductId || airProProduct?.shopifyProductId;
  if (!shopifyProductId) throw new Error('Linked Air Pro Shopify product was not found');
  const otherProductIds = [...new Set(products
    .filter(product => product !== airProProduct)
    .map(product => product.shopifyPlaceholder?.shopifyProductId || product.shopifyProductId)
    .filter(Boolean)
    .filter(productId => productId !== shopifyProductId))];
  if (!otherProductIds.length) throw new Error('No linked Shopify products were found for the Air Pro add-on requirement');

  const input = {
    title: 'Air Pro add-on - GBP 10 off',
    code,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    usesPerOrderLimit: 1,
    customerBuys: {
      value: { quantity: '1' },
      items: { products: { productsToAdd: otherProductIds } }
    },
    customerGets: {
      value: { discountOnQuantity: { quantity: '1', effect: { amount: '10.00' } } },
      items: { products: { productsToAdd: [shopifyProductId] } }
    },
    customerSelection: { all: true },
    combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: true }
  };
  const updateInput = { ...input };
  delete updateInput.code;
  const data = existing
    ? await shopifyGraphql(env, BXGY_DISCOUNT_UPDATE_MUTATION, { id: existing.id, input: updateInput })
    : await shopifyGraphql(env, BXGY_DISCOUNT_CREATE_MUTATION, { input });
  const result = existing ? data.discountCodeBxgyUpdate : data.discountCodeBxgyCreate;
  if (result.userErrors.length) throw new Error(`Shopify Air Pro discount failed: ${JSON.stringify(result.userErrors)}`);
  return {
    ok: true,
    status: existing ? 'updated' : 'created',
    code,
    shopifyProductId,
    eligibleProductCount: otherProductIds.length,
    id: result.codeDiscountNode.id,
    discount: result.codeDiscountNode.codeDiscount
  };
}

async function launchTelegramDiscount(env) {
  const code = 'TELEGRAM5';
  const existingData = await shopifyGraphql(env, DISCOUNT_BY_CODE_QUERY, { code });
  const existing = existingData.codeDiscountNodeByCode;
  const input = {
    title: 'Join Telegram - GBP 5 off',
    code,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    context: { all: 'ALL' },
    customerGets: {
      value: { discountAmount: { amount: '5.00', appliesOnEachItem: false } },
      items: { all: true }
    },
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }
  };
  const updateInput = { ...input };
  delete updateInput.code;
  const data = existing
    ? await shopifyGraphql(env, B30_DISCOUNT_UPDATE_MUTATION, { id: existing.id, input: updateInput })
    : await shopifyGraphql(env, B30_DISCOUNT_CREATE_MUTATION, { input });
  const result = existing ? data.discountCodeBasicUpdate : data.discountCodeBasicCreate;
  if (result.userErrors.length) throw new Error(`Shopify Telegram discount failed: ${JSON.stringify(result.userErrors)}`);
  return {
    ok: true,
    status: existing ? 'updated' : 'created',
    code,
    id: result.codeDiscountNode.id,
    discount: result.codeDiscountNode.codeDiscount
  };
}

async function launchB30TelegramDiscount(env) {
  const code = 'B30TG';
  const existingData = await shopifyGraphql(env, DISCOUNT_BY_CODE_QUERY, { code });
  const existing = existingData.codeDiscountNodeByCode;

  const object = await env.BUCKET.get('products.json');
  if (!object) throw new Error('products.json was not found in R2');
  const payload = JSON.parse(await object.text());
  const products = Array.isArray(payload) ? payload : (Array.isArray(payload.products) ? payload.products : []);
  const productIds = [...new Set(products
    .filter(product => String(product.brand || '').toLowerCase() === 'b30')
    .map(product => product.shopifyPlaceholder?.shopifyProductId || product.shopifyProductId)
    .filter(Boolean))];
  if (!productIds.length) throw new Error('No linked B30 Shopify products were found');

  const input = {
    title: 'Telegram B30 - GBP 10 off',
    code,
    startsAt: new Date(Date.now() - 60000).toISOString(),
    context: { all: 'ALL' },
    customerGets: {
      value: { discountAmount: { amount: '10.00', appliesOnEachItem: false } },
      items: { products: { productsToAdd: productIds } }
    },
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }
  };
  const updateInput = { ...input };
  delete updateInput.code;
  const data = existing
    ? await shopifyGraphql(env, B30_DISCOUNT_UPDATE_MUTATION, { id: existing.id, input: updateInput })
    : await shopifyGraphql(env, B30_DISCOUNT_CREATE_MUTATION, { input });
  const result = existing ? data.discountCodeBasicUpdate : data.discountCodeBasicCreate;
  if (result.userErrors.length) throw new Error(`Shopify B30 Telegram discount failed: ${JSON.stringify(result.userErrors)}`);
  return {
    ok: true,
    status: existing ? 'updated' : 'created',
    code,
    eligibleProductCount: productIds.length,
    id: result.codeDiscountNode.id,
    discount: result.codeDiscountNode.codeDiscount
  };
}

async function findExistingShopifyProduct(env, product) {
  const data = await shopifyGraphql(env, PRODUCT_SEARCH_QUERY, {
    query: `(tag:ESNTLS-SOURCE-ID-${product.id}) OR (tag:ESNTLS-ID-${product.id})`
  });
  return data.products.nodes[0] || null;
}

async function uploadProductImageToShopify(env, product, imageBlob) {
  const mimeType = normalizeOpenAIImageMime(imageBlob && imageBlob.type, 'blank.jpg');
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const filename = `${slugify(product.id)}-${slugify(product.title)}-blank.${extension}`;
  const staged = await shopifyGraphql(env, STAGED_UPLOAD_MUTATION, {
    input: [{ filename, mimeType, httpMethod: 'POST', resource: 'PRODUCT_IMAGE' }]
  });
  const errors = staged.stagedUploadsCreate.userErrors;
  if (errors.length) throw new Error(`Shopify staged upload failed: ${JSON.stringify(errors)}`);
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  const currentType = String(imageBlob && imageBlob.type || '').split(';')[0].trim().toLowerCase();
  const uploadBlob = currentType === mimeType ? imageBlob : new Blob([await imageBlob.arrayBuffer()], { type: mimeType });
  form.append('file', uploadBlob, filename);
  const uploadResponse = await fetch(target.url, { method: 'POST', body: form });
  if (!uploadResponse.ok) throw new Error(`Shopify staged file POST failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
  return { resourceUrl: target.resourceUrl, filename };
}

async function uploadExistingProductImageToShopify(env, product) {
  if (!product.image) throw new Error('Product is missing an image');
  const source = await sourceImageFromStudioMedia(env, product.image) || await fetchImageBlob(product.image, 'Source image');
  return uploadProductImageToShopify(env, product, source.blob);
}

async function publishProductToOnlineStore(env, productId) {
  if (env.SHOPIFY_PUBLISH_ONLINE_STORE === 'false') return null;
  const publications = await shopifyGraphql(env, PUBLICATIONS_QUERY, {});
  const publication = publications.publications.nodes.find(node => node.name === 'Online Store');
  if (!publication) throw new Error('Could not find the Shopify Online Store publication.');
  const data = await shopifyGraphql(env, PUBLISHABLE_PUBLISH_MUTATION, { id: productId, publicationId: publication.id });
  const errors = data.publishablePublish.userErrors;
  if (errors.length) throw new Error(`Shopify publishablePublish failed: ${JSON.stringify(errors)}`);
  return data.publishablePublish.publishable;
}

async function activateAndPublishShopifyProduct(env, productId) {
  const updated = await shopifyGraphql(env, PRODUCT_UPDATE_STATUS_MUTATION, {
    product: { id: productId, status: 'ACTIVE' }
  });
  const errors = updated.productUpdate.userErrors;
  if (errors.length) throw new Error(`Shopify product status update failed: ${JSON.stringify(errors)}`);

  let published = null;
  try {
    published = await publishProductToOnlineStore(env, productId);
  } catch (error) {
    published = { status: 'error', error: error.message };
  }

  return {
    ...updated.productUpdate.product,
    published
  };
}

async function createShopifyProduct(env, product, imageResourceUrl, visibleTitle) {
  const variantPlan = buildProductVariantPlan(product, env);
  const productSet = await shopifyGraphql(env, PRODUCT_SET_MUTATION, {
    synchronous: true,
    input: {
      title: visibleTitle,
      descriptionHtml: buildDescriptionHtml(),
      vendor: env.SHOPIFY_VENDOR || 'ESNTLS Club',
      productType: env.SHOPIFY_PRODUCT_TYPE || 'Placeholder',
      status: env.SHOPIFY_PRODUCT_STATUS || 'ACTIVE',
      tags: sourceTags(product),
      productOptions: variantPlan.productOptions,
      variants: variantPlan.variants
    }
  });
  const errors = productSet.productSet.userErrors;
  if (errors.length) throw new Error(`Shopify productSet failed: ${JSON.stringify(errors)}`);
  const created = productSet.productSet.product;
  const mediaUpdate = await shopifyGraphql(env, PRODUCT_UPDATE_MEDIA_MUTATION, {
    product: { id: created.id },
    media: [{ originalSource: imageResourceUrl, mediaContentType: 'IMAGE', alt: `${visibleTitle} blank product image` }]
  });
  const mediaErrors = mediaUpdate.productUpdate.userErrors;
  if (mediaErrors.length) throw new Error(`Shopify productUpdate media failed: ${JSON.stringify(mediaErrors)}`);
  await publishProductToOnlineStore(env, created.id);
  return {
    ...created,
    sizes: variantPlan.sizes,
    variationName: variantPlan.variationName,
    variationValues: variantPlan.variationValues,
    variantCount: variantPlan.variants.length,
    shopifyVariants: buildShopifyVariantMap(created.variants?.nodes || [], variantPlan),
    featuredImageUrl: mediaUpdate.productUpdate.product.featuredMedia?.preview?.image?.url || null,
    shopifyUrl: storefrontUrl(env, created.handle)
  };
}

async function createWixBackupProduct(env, product, visibleTitle) {
  if (!env.WIX_API_TOKEN || !env.WIX_SITE_ID) {
    return { status: 'skipped', reason: 'WIX_API_TOKEN or WIX_SITE_ID is not configured' };
  }
  const variantPlan = buildProductVariantPlan(product, env);
  const variantPrice = { actualPrice: { amount: product.price } };
  const options = [];
  if (variantPlan.sizes.length) {
    options.push({
      name: 'Size',
      optionRenderType: 'TEXT_CHOICES',
      choicesSettings: { choices: variantPlan.sizes.map(size => ({ choiceType: 'CHOICE_TEXT', name: size })) }
    });
  }
  if (variantPlan.variationValues.length) {
    options.push({
      name: variantPlan.variationName,
      optionRenderType: 'TEXT_CHOICES',
      choicesSettings: { choices: variantPlan.variationValues.map(value => ({ choiceType: 'CHOICE_TEXT', name: value })) }
    });
  }
  const response = await fetch('https://www.wixapis.com/stores/v3/products', {
    method: 'POST',
    headers: {
      Authorization: env.WIX_API_TOKEN,
      'wix-site-id': env.WIX_SITE_ID,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      product: {
        name: visibleTitle,
        visible: true,
        productType: 'PHYSICAL',
        physicalProperties: {},
        options,
        variantsInfo: {
          variants: variantPlan.variants.map(variant => ({
            visible: true,
            choices: variant.optionValues.map(optionValue => ({
              optionChoiceNames: { optionName: optionValue.optionName, choiceName: optionValue.name, renderType: 'TEXT_CHOICES' }
            })),
            price: variantPrice,
            physicalProperties: {}
          }))
        }
      }
    })
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix backup API ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  const wixProduct = data.product || {};
  return {
    status: 'created',
    id: wixProduct.id,
    name: wixProduct.name,
    slug: wixProduct.slug,
    url: wixProduct.slug ? `https://www.essentialsblanks.net/product-page/${wixProduct.slug}` : ''
  };
}

async function resolveShopifyProductForPriceSync(env, rawProduct, product) {
  const storedId = rawProduct.shopifyPlaceholder?.shopifyProductId || rawProduct.shopifyProductId || '';
  if (storedId) return { id: storedId, source: 'stored' };

  const tagged = await findExistingShopifyProduct(env, product);
  if (tagged?.id) return { id: tagged.id, title: tagged.title, handle: tagged.handle, source: 'tag' };

  const handle = extractShopifyHandle(rawProduct.link || rawProduct.shopifyPlaceholder?.shopifyUrl, env);
  if (!handle) return null;
  const data = await shopifyGraphql(env, PRODUCT_SEARCH_QUERY, { query: `handle:${handle}` });
  const found = data.products.nodes[0] || null;
  return found ? { id: found.id, title: found.title, handle: found.handle, source: 'handle' } : null;
}

async function updateShopifyLinkedPrice(env, rawProduct, product, price) {
  if (!env.SHOPIFY_STORE_DOMAIN) return { status: 'skipped', reason: 'SHOPIFY_STORE_DOMAIN is not configured' };
  const target = await resolveShopifyProductForPriceSync(env, rawProduct, product);
  if (!target?.id) return { status: 'skipped', reason: 'No linked Shopify product found' };

  const data = await shopifyGraphql(env, PRODUCT_VARIANTS_QUERY, { id: target.id });
  const shopifyProduct = data.product;
  if (!shopifyProduct) return { status: 'skipped', reason: `Shopify product ${target.id} was not found` };
  const variants = shopifyProduct.variants.nodes || [];
  if (!variants.length) return { status: 'skipped', reason: 'Shopify product has no variants to update' };

  const updated = await shopifyGraphql(env, PRODUCT_VARIANTS_BULK_UPDATE_MUTATION, {
    productId: shopifyProduct.id,
    variants: variants.map(variant => ({ id: variant.id, price }))
  });
  const payload = updated.productVariantsBulkUpdate;
  if (payload.userErrors.length) throw new Error(`Shopify price update failed: ${JSON.stringify(payload.userErrors)}`);

  return {
    status: 'updated',
    productId: shopifyProduct.id,
    title: shopifyProduct.title,
    handle: shopifyProduct.handle,
    url: storefrontUrl(env, shopifyProduct.handle),
    variantCount: payload.productVariants.length,
    source: target.source
  };
}

async function loadWixCatalogFromR2(env) {
  if (!env.BUCKET) return [];
  const object = await env.BUCKET.get('wix-products.json');
  if (!object) return [];
  try {
    const data = JSON.parse(await object.text());
    return Array.isArray(data.products) ? data.products : [];
  } catch {
    return [];
  }
}

async function resolveWixProductIdsForPriceSync(env, rawProduct) {
  const ids = new Set();
  const backupId = rawProduct.wixBackupPlaceholder?.id || rawProduct.wixBackupProductId || rawProduct.wixProductId || '';
  if (backupId) ids.add(String(backupId));

  const slug = extractWixSlug(rawProduct.link || rawProduct.wixBackupPlaceholder?.url || '');
  if (slug) {
    const catalog = await loadWixCatalogFromR2(env);
    const hit = catalog.find(item =>
      String(item.slug || '').toLowerCase() === slug.toLowerCase() ||
      String(item.url || '').toLowerCase().includes(`/product-page/${slug.toLowerCase()}`)
    );
    if (hit?.id) ids.add(String(hit.id));
    if (!hit?.id && env.WIX_API_TOKEN && env.WIX_SITE_ID) {
      try {
        const product = await fetchWixProductBySlug(env, slug);
        if (product?.id) ids.add(String(product.id));
      } catch {
        // A stale or missing Wix cache should not block Shopify-only price syncs.
      }
    }
  }

  return [...ids];
}

function wixHeaders(env) {
  return {
    'Authorization': env.WIX_API_TOKEN,
    'wix-site-id': env.WIX_SITE_ID,
    'Content-Type': 'application/json'
  };
}

async function fetchWixProduct(env, productId) {
  const response = await fetch(`https://www.wixapis.com/stores/v3/products/${encodeURIComponent(productId)}`, {
    method: 'GET',
    headers: wixHeaders(env)
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix get product ${productId} failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data.product || data;
}

async function fetchWixProductBySlug(env, slug) {
  const response = await fetch(`https://www.wixapis.com/stores/v3/products/slug/${encodeURIComponent(slug)}`, {
    method: 'GET',
    headers: wixHeaders(env)
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix get product by slug ${slug} failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data.product || data;
}

async function patchWixProductPrice(env, wixProduct, price) {
  const variants = wixProduct.variantsInfo?.variants || [];
  if (!variants.length) throw new Error(`Wix product ${wixProduct.id} has no variants to update`);
  const variantPrice = { actualPrice: { amount: price } };
  const product = {
    id: wixProduct.id,
    revision: wixProduct.revision,
    options: wixProduct.options || [],
    variantsInfo: {
      variants: variants.map(variant => ({
        id: variant.id,
        price: variantPrice
      }))
    }
  };
  const response = await fetch(`https://www.wixapis.com/stores/v3/products/${encodeURIComponent(wixProduct.id)}`, {
    method: 'PATCH',
    headers: wixHeaders(env),
    body: JSON.stringify({ product })
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix price update ${wixProduct.id} failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data.product || data;
}

async function updateWixLinkedPrices(env, rawProduct, price) {
  if (!env.WIX_API_TOKEN || !env.WIX_SITE_ID) {
    return { status: 'skipped', reason: 'WIX_API_TOKEN or WIX_SITE_ID is not configured', products: [] };
  }
  const ids = await resolveWixProductIdsForPriceSync(env, rawProduct);
  if (!ids.length) return { status: 'skipped', reason: 'No linked Wix product found', products: [] };

  const products = [];
  for (const id of ids) {
    const wixProduct = await fetchWixProduct(env, id);
    const patched = await patchWixProductPrice(env, wixProduct, price);
    products.push({
      id,
      name: patched.name || wixProduct.name || '',
      slug: patched.slug || wixProduct.slug || '',
      variantCount: (wixProduct.variantsInfo?.variants || []).length
    });
  }

  return { status: 'updated', count: products.length, products };
}

async function searchWixInventoryItems(env, productId) {
  const response = await fetch('https://www.wixapis.com/stores/v3/inventory-items/search', {
    method: 'POST',
    headers: wixHeaders(env),
    body: JSON.stringify({
      search: {
        filter: { productId: { $eq: productId } },
        cursorPaging: { limit: 100 }
      }
    })
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix inventory search ${productId} failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data.inventoryItems || [];
}

async function createWixInventoryItem(env, productId, variantId) {
  const inventoryItem = {
    productId,
    trackQuantity: false,
    inStock: true
  };
  if (variantId) inventoryItem.variantId = variantId;

  const response = await fetch('https://www.wixapis.com/stores/v3/inventory-items', {
    method: 'POST',
    headers: wixHeaders(env),
    body: JSON.stringify({ inventoryItem })
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix inventory create ${productId} failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data.inventoryItem || data;
}

async function patchWixInventoryItemInStock(env, item, inventoryQuantity) {
  if (!item?.id || item.revision === undefined || item.revision === null) {
    throw new Error('Wix inventory item is missing id or revision');
  }

  const quantity = Math.max(Number(item.quantity) || 0, inventoryQuantity);
  const inventoryItem = {
    id: item.id,
    revision: item.revision,
    trackQuantity: item.trackQuantity === true
  };
  if (item.trackQuantity === true) {
    inventoryItem.quantity = quantity;
  } else {
    inventoryItem.inStock = true;
  }

  const response = await fetch(`https://www.wixapis.com/stores/v3/inventory-items/${encodeURIComponent(item.id)}`, {
    method: 'PATCH',
    headers: wixHeaders(env),
    body: JSON.stringify({ inventoryItem, reason: 'MANUAL' })
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix inventory update ${item.id} failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data.inventoryItem || data;
}

async function restoreWixProductInventory(env, productId, inventoryQuantity) {
  let items = await searchWixInventoryItems(env, productId);
  let created = 0;

  if (!items.length) {
    const product = await fetchWixProduct(env, productId);
    const variants = product.variantsInfo?.variants || [];
    if (variants.length) {
      items = [];
      for (const variant of variants) {
        if (!variant.id) continue;
        items.push(await createWixInventoryItem(env, productId, variant.id));
        created++;
      }
    } else {
      items = [await createWixInventoryItem(env, productId, '')];
      created++;
    }
  }

  const updatedItems = [];
  for (const item of items) {
    updatedItems.push(await patchWixInventoryItemInStock(env, item, inventoryQuantity));
  }

  return {
    productId,
    created,
    updated: updatedItems.length,
    itemIds: updatedItems.map(item => item.id).filter(Boolean)
  };
}

async function updateWixLinkedAvailability(env, rawProduct, inventoryQuantity, cache = null) {
  if (!env.WIX_API_TOKEN || !env.WIX_SITE_ID) {
    return { status: 'skipped', reason: 'WIX_API_TOKEN or WIX_SITE_ID is not configured', products: [] };
  }
  const ids = await resolveWixProductIdsForPriceSync(env, rawProduct);
  if (!ids.length) return { status: 'skipped', reason: 'No linked Wix product found', products: [] };

  const products = [];
  for (const id of ids) {
    if (cache?.has(id)) {
      products.push(cache.get(id));
      continue;
    }
    const restored = await restoreWixProductInventory(env, id, inventoryQuantity);
    if (cache) cache.set(id, restored);
    products.push(restored);
  }
  return { status: 'updated', count: products.length, products };
}

async function restoreStandardStockFromR2(env, requestBody) {
  if (!env.BUCKET) throw new Error('BUCKET binding is not configured');

  const defaults = [
    { id: 25, price: '£49.99' },
    { id: 26, price: '£49.99' },
    { id: 34, price: '£89.99' }
  ];
  const delivery = String(requestBody.delivery || '7-12 Days').trim() || '7-12 Days';
  const inventoryQuantity = Number(requestBody.inventoryQuantity) > 0
    ? Math.floor(Number(requestBody.inventoryQuantity))
    : 100;
  const requestedProducts = Array.isArray(requestBody.products) && requestBody.products.length
    ? requestBody.products
    : defaults;

  const object = await env.BUCKET.get('products.json');
  if (!object) throw new Error('products.json was not found in R2');
  const payload = JSON.parse(await object.text());
  const list = Array.isArray(payload) ? payload : payload.products;
  if (!Array.isArray(list)) throw new Error('products.json is not an array');

  const updated = [];
  const skipped = [];
  const wixInventoryCache = new Map();
  for (const update of requestedProducts) {
    const rawProduct = list.find(item => String(item.id) === String(update.id));
    if (!rawProduct) {
      skipped.push({ id: update.id, reason: 'Product was not found' });
      continue;
    }

    const price = update.price || rawProduct.price;
    rawProduct.price = String(price);
    rawProduct.delivery = delivery;
    rawProduct.active = rawProduct.active !== false;
    rawProduct.archived = false;
    rawProduct.hidden = false;
    rawProduct.outOfStock = false;

    const result = {
      id: rawProduct.id,
      name: rawProduct.name || rawProduct.title || '',
      price: rawProduct.price,
      delivery,
      wixPrice: { status: 'skipped', reason: 'Not attempted', products: [] },
      wixInventory: { status: 'skipped', reason: 'Not attempted', products: [] }
    };

    const numericPrice = priceAmount(rawProduct.price);
    if (numericPrice) {
      try {
        result.wixPrice = await updateWixLinkedPrices(env, rawProduct, numericPrice);
      } catch (error) {
        result.wixPrice = { status: 'error', error: error.message, products: [] };
      }
    }

    try {
      result.wixInventory = await updateWixLinkedAvailability(env, rawProduct, inventoryQuantity, wixInventoryCache);
    } catch (error) {
      result.wixInventory = { status: 'error', error: error.message, products: [] };
    }

    rawProduct.stockRestore = {
      delivery,
      inventoryQuantity,
      result,
      updatedAt: new Date().toISOString()
    };
    updated.push(result);
  }

  await env.BUCKET.put('products.json', JSON.stringify(payload, null, 2) + '\n', {
    httpMetadata: { contentType: 'application/json' }
  });

  return {
    ok: true,
    delivery,
    inventoryQuantity,
    updated: updated.length,
    skipped: skipped.length,
    products: updated,
    skippedProducts: skipped,
    updatedAt: new Date().toISOString()
  };
}

async function syncLinkedPriceFromR2(env, requestBody) {
  if (!env.BUCKET) throw new Error('BUCKET binding is not configured');
  const productId = requestBody.productId;
  if (productId === undefined || productId === null || productId === '') throw new Error('Missing productId');
  const price = priceAmount(requestBody.price);
  if (!price) throw new Error('Missing or invalid numeric price');

  const object = await env.BUCKET.get('products.json');
  if (!object) throw new Error('products.json was not found in R2');
  const payload = JSON.parse(await object.text());
  const list = Array.isArray(payload) ? payload : payload.products;
  if (!Array.isArray(list)) throw new Error('products.json is not an array');
  const rawProduct = list.find(item => String(item.id) === String(productId));
  if (!rawProduct) throw new Error(`Product ${productId} was not found`);
  const product = normalizeStoredProduct({ ...rawProduct, price });

  const result = {
    ok: true,
    productId: product.id,
    price,
    shopify: { status: 'skipped', reason: 'Not attempted' },
    wix: { status: 'skipped', reason: 'Not attempted', products: [] },
    updatedAt: new Date().toISOString()
  };

  try {
    result.shopify = await updateShopifyLinkedPrice(env, rawProduct, product, price);
  } catch (error) {
    result.shopify = { status: 'error', error: error.message };
  }

  try {
    result.wix = await updateWixLinkedPrices(env, rawProduct, price);
  } catch (error) {
    result.wix = { status: 'error', error: error.message, products: [] };
  }

  rawProduct.price = requestBody.price;
  rawProduct.linkedPriceSync = result;
  await env.BUCKET.put('products.json', JSON.stringify(payload, null, 2) + '\n', {
    httpMetadata: { contentType: 'application/json' }
  });

  return result;
}

async function readProductsPayload(env) {
  if (!env.BUCKET) throw new Error('BUCKET binding is not configured');
  const object = await env.BUCKET.get('products.json');
  if (!object) throw new Error('products.json was not found in R2');
  const payload = JSON.parse(await object.text());
  const list = Array.isArray(payload) ? payload : payload.products;
  if (!Array.isArray(list)) throw new Error('products.json is not an array');
  return { payload, list };
}

async function writeProductsPayload(env, payload) {
  await env.BUCKET.put('products.json', JSON.stringify(payload, null, 2) + '\n', {
    httpMetadata: { contentType: 'application/json' }
  });
}

async function syncProductLinkedPrice(env, rawProduct, price, updatedAt = new Date().toISOString()) {
  const product = normalizeStoredProduct({ ...rawProduct, price });
  const result = {
    ok: true,
    productId: product.id,
    price,
    shopify: { status: 'skipped', reason: 'Not attempted' },
    wix: { status: 'skipped', reason: 'Not attempted', products: [] },
    updatedAt
  };

  try {
    result.shopify = await updateShopifyLinkedPrice(env, rawProduct, product, price);
  } catch (error) {
    result.shopify = { status: 'error', error: error.message };
  }

  try {
    result.wix = await updateWixLinkedPrices(env, rawProduct, price);
  } catch (error) {
    result.wix = { status: 'error', error: error.message, products: [] };
  }

  rawProduct.price = price;
  rawProduct.linkedPriceSync = result;
  return result;
}

function saleEndDate(requestBody, startsAt) {
  const explicit = Date.parse(requestBody.endsAt || requestBody.endAt || '');
  if (Number.isFinite(explicit) && explicit > startsAt.getTime()) return new Date(explicit);
  const hours = Number(requestBody.durationHours || requestBody.hours || 24);
  const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 14) : 24;
  return new Date(startsAt.getTime() + safeHours * 60 * 60 * 1000);
}

async function startTimedSaleFromR2(env, requestBody) {
  const productId = requestBody.productId;
  if (productId === undefined || productId === null || productId === '') throw new Error('Missing productId');
  const salePrice = priceAmount(requestBody.salePrice ?? requestBody.price);
  const regularPrice = priceAmount(requestBody.regularPrice ?? requestBody.afterPrice ?? requestBody.originalPrice);
  if (!salePrice) throw new Error('Missing or invalid salePrice');
  if (!regularPrice) throw new Error('Missing or invalid regularPrice');

  const { payload, list } = await readProductsPayload(env);
  const rawProduct = list.find(item => String(item.id) === String(productId));
  if (!rawProduct) throw new Error(`Product ${productId} was not found`);

  const now = new Date();
  const endsAt = saleEndDate(requestBody, now);
  const result = await syncProductLinkedPrice(env, rawProduct, salePrice, now.toISOString());

  rawProduct.originalPrice = regularPrice;
  rawProduct.timedSale = {
    active: true,
    label: String(requestBody.label || '24 hour deal').trim() || '24 hour deal',
    salePrice,
    regularPrice,
    startsAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    createdAt: now.toISOString(),
    lastSync: result
  };

  await writeProductsPayload(env, payload);
  return {
    ok: true,
    productId: rawProduct.id,
    name: rawProduct.name || rawProduct.title || '',
    salePrice,
    regularPrice,
    startsAt: rawProduct.timedSale.startsAt,
    endsAt: rawProduct.timedSale.endsAt,
    sync: result
  };
}

async function processExpiredTimedSales(env) {
  const { payload, list } = await readProductsPayload(env);
  const now = Date.now();
  const updatedAt = new Date(now).toISOString();
  const expired = [];
  const skipped = [];

  for (const rawProduct of list) {
    const sale = rawProduct && rawProduct.timedSale;
    if (!sale || sale.active === false) continue;
    const endMs = Date.parse(sale.endsAt || sale.endAt || '');
    if (!Number.isFinite(endMs)) {
      skipped.push({ id: rawProduct.id, reason: 'Timed sale has no valid endsAt' });
      continue;
    }
    if (endMs > now) continue;

    const regularPrice = priceAmount(sale.regularPrice || rawProduct.originalPrice);
    if (!regularPrice) {
      skipped.push({ id: rawProduct.id, reason: 'Timed sale has no valid regularPrice' });
      continue;
    }

    const result = await syncProductLinkedPrice(env, rawProduct, regularPrice, updatedAt);
    rawProduct.originalPrice = '';
    rawProduct.timedSale = {
      ...sale,
      active: false,
      expiredAt: updatedAt,
      lastSync: result
    };
    expired.push({
      id: rawProduct.id,
      name: rawProduct.name || rawProduct.title || '',
      price: regularPrice,
      sync: result
    });
  }

  if (expired.length) await writeProductsPayload(env, payload);
  return { ok: true, checked: list.length, expired: expired.length, products: expired, skipped, updatedAt };
}

async function ensureWixBackupForProduct(env, rawProduct, product, visibleTitle) {
  let wixBackup = rawProduct.wixBackupPlaceholder || null;
  if (hasUsableWixBackup(wixBackup)) return wixBackup;
  try {
    wixBackup = await createWixBackupProduct(env, product, visibleTitle);
  } catch (error) {
    wixBackup = { status: 'error', error: error.message };
  }
  rawProduct.wixBackupPlaceholder = wixBackup;
  return wixBackup;
}

async function switchCheckoutLinksFromR2(env, requestBody) {
  if (!env.BUCKET) throw new Error('BUCKET binding is not configured');
  const mode = String(requestBody.mode || '').toLowerCase();
  if (!['shopify', 'wix'].includes(mode)) throw new Error('Mode must be shopify or wix');

  const object = await env.BUCKET.get('products.json');
  if (!object) throw new Error('products.json was not found in R2');
  const payload = JSON.parse(await object.text());
  const list = Array.isArray(payload) ? payload : payload.products;
  if (!Array.isArray(list)) throw new Error('products.json is not an array');

  const productId = requestBody.productId;
  const targets = productId === undefined || productId === null || productId === ''
    ? list
    : list.filter(item => String(item.id) === String(productId));
  if (productId !== undefined && productId !== null && productId !== '' && !targets.length) {
    throw new Error(`Product ${productId} was not found`);
  }

  const updated = [];
  const skipped = [];
  for (const rawProduct of targets) {
    if (!requestBody.includeArchived && (rawProduct.active === false || rawProduct.archived === true || rawProduct.hidden === true)) {
      skipped.push({ id: rawProduct.id, name: rawProduct.name || rawProduct.title || '', reason: 'Product is hidden or archived' });
      continue;
    }

    const product = normalizeStoredProduct(rawProduct);
    rememberCheckoutLinks(rawProduct, env);

    if (!checkoutUrlForMode(rawProduct, env, 'wix') && requestBody.createMissingWixBackup !== false) {
      if (!product.title || !product.price) {
        if (mode === 'wix') {
          skipped.push({ id: product.id, name: product.title, reason: 'Missing product name or price for Wix backup' });
          continue;
        }
      } else {
        const visibleTitle = rawProduct.shopifyPlaceholder?.shopifyTitle || buildPlaceholderTitle(product);
        const wixBackup = await ensureWixBackupForProduct(env, rawProduct, product, visibleTitle);
        if (hasUsableWixBackup(wixBackup) && wixBackup.url) {
          rememberCheckoutLinks(rawProduct, env, { wixUrl: wixBackup.url });
        }
      }
    }

    const url = checkoutUrlForMode(rawProduct, env, mode);
    if (!url) {
      skipped.push({ id: product.id, name: product.title, reason: `No ${mode} checkout link saved` });
      continue;
    }

    rawProduct.link = url;
    const links = rememberCheckoutLinks(rawProduct, env, { active: mode });
    updated.push({
      id: product.id,
      name: product.title,
      link: url,
      active: links.active,
      shopify: links.shopify || '',
      wix: links.wix || ''
    });
  }

  await env.BUCKET.put('products.json', JSON.stringify(payload, null, 2) + '\n', {
    httpMetadata: { contentType: 'application/json' }
  });

  return {
    ok: true,
    mode,
    scope: productId === undefined || productId === null || productId === '' ? 'all' : 'single',
    updated: updated.length,
    skipped: skipped.length,
    products: updated,
    skippedProducts: skipped,
    updatedAt: new Date().toISOString()
  };
}

async function createShopifyPlaceholderFromR2(env, requestBody) {
  if (!env.BUCKET) throw new Error('BUCKET binding is not configured');
  const productId = requestBody.productId;
  if (productId === undefined || productId === null || productId === '') throw new Error('Missing productId');
  const object = await env.BUCKET.get('products.json');
  if (!object) throw new Error('products.json was not found in R2');
  const payload = JSON.parse(await object.text());
  const list = Array.isArray(payload) ? payload : payload.products;
  if (!Array.isArray(list)) throw new Error('products.json is not an array');
  const rawProduct = list.find(item => String(item.id) === String(productId));
  if (!rawProduct) throw new Error(`Product ${productId} was not found`);
  const product = normalizeStoredProduct(rawProduct);
  if (!product.active) throw new Error('Product is inactive');
  if (!product.title) throw new Error('Product is missing a name');
  if (!product.price) throw new Error('Product is missing a valid price');
  if (!product.image) throw new Error('Product is missing an image');
  rememberCheckoutLinks(rawProduct, env);

  const existing = await findExistingShopifyProduct(env, product);
  let status = 'created';
  const titleOverride = normalizePlaceholderTitleOverride(requestBody.shopifyTitleOverride || requestBody.shopifyTitle || requestBody.visibleTitle);
  let visibleTitle = existing?.title || titleOverride || buildPlaceholderTitle(product);
  let shopifyProduct;
  let uploadedFilename = '';

  if (existing) {
    status = 'existing';
    const activeProduct = await activateAndPublishShopifyProduct(env, existing.id);
    const shopifyVariants = await shopifyVariantMapForProduct(env, existing.id, product);
    shopifyProduct = {
      id: activeProduct.id || existing.id,
      title: activeProduct.title || existing.title,
      handle: activeProduct.handle || existing.handle,
      shopifyUrl: storefrontUrl(env, activeProduct.handle || existing.handle),
      shopifyVariants,
      variantCount: Object.keys(shopifyVariants || {}).length,
      productStatus: activeProduct.status || '',
      published: activeProduct.published
    };
  } else {
    const useExistingImage = requestBody.useExistingImage === true || rawProduct.grassBackground?.status === 'done';
    const upload = useExistingImage
      ? await uploadExistingProductImageToShopify(env, product)
      : await uploadProductImageToShopify(env, product, await generateBlankImage(env, product, sourceImageFromRequestBody(requestBody.sourceImage)));
    uploadedFilename = upload.filename;
    shopifyProduct = await createShopifyProduct(env, product, upload.resourceUrl, visibleTitle);
  }

  let wixBackup = rawProduct.wixBackupPlaceholder || null;
  if (requestBody.createWixBackup !== false && !hasUsableWixBackup(wixBackup)) {
    wixBackup = await ensureWixBackupForProduct(env, rawProduct, product, visibleTitle);
  }

  const shopifyUrl = shopifyProduct.shopifyUrl;
  rawProduct.link = shopifyUrl;
  rawProduct.shopifyVariants = shopifyProduct.shopifyVariants || {};
  rawProduct.shopifyVariantId = Object.values(rawProduct.shopifyVariants)[0] || '';
  rememberCheckoutLinks(rawProduct, env, {
    shopifyUrl,
    wixUrl: hasUsableWixBackup(wixBackup) ? wixBackup.url : '',
    active: 'shopify'
  });
  rawProduct.shopifyPlaceholder = {
    status,
    sourceId: product.id,
    sourceTitle: product.title,
    shopifyProductId: shopifyProduct.id,
    shopifyTitle: shopifyProduct.title,
    requestedShopifyTitle: titleOverride || '',
    shopifyUrl,
    uploadedFilename,
    sizes: shopifyProduct.sizes || inferSizes(product, env),
    variationName: shopifyProduct.variationName || product.variationName || '',
    variationValues: shopifyProduct.variationValues || product.variationValues || [],
    variantCount: shopifyProduct.variantCount || 0,
    variants: rawProduct.shopifyVariants,
    productStatus: shopifyProduct.productStatus || '',
    published: shopifyProduct.published || null,
    generatedAt: new Date().toISOString()
  };
  if (wixBackup) rawProduct.wixBackupPlaceholder = wixBackup;
  delete rawProduct.checkoutCreationError;
  rawProduct.active = true;
  rawProduct.archived = false;

  await env.BUCKET.put('products.json', JSON.stringify(payload, null, 2) + '\n', {
    httpMetadata: { contentType: 'application/json' }
  });

  return { ok: true, status, productId: product.id, shopifyUrl, shopify: rawProduct.shopifyPlaceholder, wixBackup, checkoutLinks: rawProduct.checkoutLinks };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processExpiredTimedSales(env));
  },

  async queue(batch, env) {
    for (const message of batch.messages || []) {
      const body = typeof message.body === 'string'
        ? (() => {
            try { return JSON.parse(message.body); } catch { return {}; }
          })()
        : (message.body || {});
      if (body.type !== 'esntls-grass-job-item' || !body.jobId || !body.itemId) {
        message.ack();
        continue;
      }

      try {
        await processGrassJobItem(env, body.jobId, body.itemId, Number(body.index || 0));
        message.ack();
      } catch (error) {
        message.retry({ delaySeconds: 30 });
      }
    }
  },

  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'POST' && parts[0] === 'shopify-order-webhook') {
      return handleShopifyOrderWebhook(req, env, ctx);
    }

    const adminAuthorized = req.headers.get('X-Admin-Secret') === env.ADMIN_SECRET;
    const serviceAuthorized = Boolean(
      env.ESNTLS_STORE_SERVICE_TOKEN &&
      req.headers.get('X-ESNTLS-Service-Token') === env.ESNTLS_STORE_SERVICE_TOKEN
    );
    if (!adminAuthorized && !serviceAuthorized) {
      return json({ error: 'Unauthorized' }, 401);
    }

    if (req.method === 'POST' && parts[0] === 'shopify-create-product') {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
      try {
        return json(await createShopifyPlaceholderFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'whatsapp-test-order') {
      let body;
      try { body = await req.json(); } catch (e) { body = {}; }
      try {
        const order = body.order || sampleShopifyOrderForWhatsappTest();
        return json(await sendShopifyOrderToWhatsApp(env, order, {
          dryRun: body.dryRun !== false,
          force: true,
          source: 'admin-test'
        }));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'GET' && parts[0] === 'whatsapp-order-log') {
      try {
        return json(await listWhatsappOrderLogs(env, url.searchParams.get('limit')));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'supplier-sheet-test-order') {
      let body;
      try { body = await req.json(); } catch (e) { body = {}; }
      try {
        const order = body.order || sampleShopifyOrderForWhatsappTest();
        return json(await processSupplierOrderWebhook(env, order, {
          dryRun: body.dryRun !== false,
          force: true,
          source: 'admin-sheet-test'
        }));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'GET' && parts[0] === 'supplier-order-log') {
      try {
        return json(await listSupplierOrderLogs(env, url.searchParams.get('limit')));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'supplier-sheet-sync-recent') {
      let body;
      try { body = await req.json(); } catch (e) { body = {}; }
      try {
        return json(await syncRecentSupplierOrdersToSheet(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'launch-b30-bundle') {
      try {
        return json(await launchB30BundleDiscount(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'launch-b22-bundle') {
      try {
        return json(await launchB22BundleDiscount(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'launch-air-pro-addon') {
      try {
        return json(await launchAirProAddonDiscount(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'launch-telegram-discount') {
      try {
        return json(await launchTelegramDiscount(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'launch-b30-telegram-discount') {
      try {
        return json(await launchB30TelegramDiscount(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'sync-linked-price') {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
      try {
        return json(await syncLinkedPriceFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'timed-sale') {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
      try {
        return json(await startTimedSaleFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'process-expired-sales') {
      try {
        return json(await processExpiredTimedSales(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'restore-standard-stock') {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
      try {
        return json(await restoreStandardStockFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'restore-b30-shopify-stock') {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
      try {
        return json(await restoreB30ShopifyStockFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'checkout-link-mode') {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
      try {
        return json(await switchCheckoutLinksFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'POST' && parts[0] === 'grass-preview') {
      let formData;
      try { formData = await req.formData(); } catch (e) { return json({ error: 'Invalid multipart form data' }, 400); }
      try {
        return json(await createGrassPreview(env, formData));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (parts[0] === 'grass-jobs') {
      if (req.method === 'POST' && !parts[1]) {
        let formData;
        try { formData = await req.formData(); } catch (e) { return json({ error: 'Invalid multipart form data' }, 400); }
        try {
          return await createGrassJob(req, env, formData, ctx);
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }

      if (req.method === 'GET' && !parts[1]) {
        try {
          return await getGrassJobs(req, env, ctx);
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }

      if (req.method === 'POST' && parts[1] === 'resume') {
        try {
          return await resumeGrassJobFromRequest(req, env, ctx);
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }

      if (req.method === 'POST' && parts[1] === 'work') {
        const body = await req.json().catch(() => ({}));
        const id = body.id || url.searchParams.get('id');
        if (!id) return json({ error: 'Missing background job id' }, 400);
        try {
          const job = await processNextGrassJobItem(env, id, { force: !!body.force });
          return json({ ok: true, job: publicGrassJob(job) });
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }

      if (req.method === 'POST' && parts[1] === 'retry-failed') {
        try {
          return await retryFailedGrassJob(req, env, ctx);
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }

      if (req.method === 'POST' && parts[1] === 'cancel') {
        try {
          return await cancelGrassJob(req, env);
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }
    }

    if (req.method === 'POST' && parts[0] === 'yupoo-images') {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
      try {
        return json(await listYupooImages(body.url, body.limit));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'GET' && parts[0] === 'yupoo-image') {
      try {
        return await proxyYupooImage(url.searchParams.get('url'));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'GET' && parts[0] === 'list') {
      const out = [];
      let cursor;
      do {
        const r = await env.BUCKET.list({ limit: 1000, cursor });
        out.push(...r.objects.map(o => ({
          key: o.key,
          url: PUBLIC_BASE + o.key,
          size: o.size,
          uploaded: o.uploaded
        })));
        cursor = r.truncated ? r.cursor : null;
      } while (cursor);
      return json({ objects: out });
    }

    if (req.method === 'POST' && parts[0] === 'copy-r2-object') {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
      try {
        return json(await copyR2Object(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    if (req.method === 'PUT' && parts[0] === 'upload') {
      const key = parts.slice(1).map(decodeURIComponent).join('/');
      if (!key) return json({ error: 'Missing key' }, 400);
      await env.BUCKET.put(key, req.body, {
        httpMetadata: { contentType: req.headers.get('Content-Type') || 'application/octet-stream' }
      });
      return json({ ok: true, key, url: PUBLIC_BASE + key });
    }

    if (req.method === 'DELETE' && parts[0] === 'delete') {
      const key = parts.slice(1).map(decodeURIComponent).join('/');
      if (!key) return json({ error: 'Missing key' }, 400);
      await env.BUCKET.delete(key);
      return json({ ok: true });
    }

    if (req.method === 'POST' && parts[0] === 'wix-sync') {
      if (!env.WIX_API_TOKEN) return json({ error: 'WIX_API_TOKEN env var not set' }, 500);
      if (!env.WIX_SITE_ID)   return json({ error: 'WIX_SITE_ID env var not set' }, 500);

      const all = [];
      let cursor = null;
      let pages = 0;
      do {
        const search = cursor
          ? { cursorPaging: { limit: 100, cursor } }
          : { cursorPaging: { limit: 100 } };
        const body = JSON.stringify({ search });
        const r = await fetch('https://www.wixapis.com/stores/v3/products/search', {
          method: 'POST',
          headers: {
            'Authorization': env.WIX_API_TOKEN,
            'wix-site-id': env.WIX_SITE_ID,
            'Content-Type': 'application/json'
          },
          body
        });
        if (!r.ok) {
          const t = await r.text().catch(() => '');
          return json({ error: 'Wix API ' + r.status, detail: t.slice(0, 500) }, 502);
        }
        const data = await r.json();
        for (const p of data.products || []) {
          all.push({
            id: p.id,
            name: (p.name || '').trim(),
            slug: p.slug,
            url: 'https://www.essentialsblanks.net/product-page/' + p.slug,
            image: (p.media && p.media.main && p.media.main.image && p.media.main.image.url) || '',
            priceMin:   (p.actualPriceRange    && p.actualPriceRange.minValue    && p.actualPriceRange.minValue.amount)    || '',
            priceMax:   (p.actualPriceRange    && p.actualPriceRange.maxValue    && p.actualPriceRange.maxValue.amount)    || '',
            compareMin: (p.compareAtPriceRange && p.compareAtPriceRange.minValue && p.compareAtPriceRange.minValue.amount) || '',
            visible: p.visible !== false,
            availability: (p.inventory && p.inventory.availabilityStatus) || ''
          });
        }
        cursor = (data.pagingMetadata && data.pagingMetadata.cursors && data.pagingMetadata.cursors.next) || null;
        pages++;
      } while (cursor && pages < 50);

      const payload = JSON.stringify({
        updatedAt: new Date().toISOString(),
        count: all.length,
        products: all
      });
      await env.BUCKET.put('wix-products.json', payload, {
        httpMetadata: { contentType: 'application/json' }
      });
      return json({ ok: true, count: all.length, updatedAt: new Date().toISOString() });
    }

    if (req.method === 'POST' && parts[0] === 'wix-orders-sync') {
      if (!env.WIX_API_TOKEN) return json({ error: 'WIX_API_TOKEN env var not set' }, 500);
      if (!env.WIX_SITE_ID)   return json({ error: 'WIX_SITE_ID env var not set' }, 500);

      const all = [];
      let cursor = null;
      let pages = 0;
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // last 90 days
      do {
        const search = cursor
          ? { cursorPaging: { limit: 50, cursor } }
          : { cursorPaging: { limit: 50 }, sort: [{ fieldName: 'createdDate', order: 'DESC' }] };
        const r = await fetch('https://www.wixapis.com/ecom/v1/orders/search', {
          method: 'POST',
          headers: {
            'Authorization': env.WIX_API_TOKEN,
            'wix-site-id': env.WIX_SITE_ID,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ search })
        });
        if (!r.ok) {
          const t = await r.text().catch(() => '');
          return json({ error: 'Wix Orders API ' + r.status, detail: t.slice(0, 500) }, 502);
        }
        const data = await r.json();
        let stopPaging = false;
        for (const o of data.orders || []) {
          if (new Date(o.createdDate) < cutoff) { stopPaging = true; break; }
          const ship = (o.recipientInfo && o.recipientInfo.address) || {};
          const contact = (o.recipientInfo && o.recipientInfo.contactDetails) || {};
          all.push({
            id: o.id,
            number: o.number,
            createdDate: o.createdDate,
            paymentStatus: o.paymentStatus,
            fulfillmentStatus: o.fulfillmentStatus,
            archived: !!o.archived,
            status: o.status,
            total: (o.priceSummary && o.priceSummary.total && o.priceSummary.total.amount) || '0.00',
            currency: o.currency,
            buyer: {
              name: ((contact.firstName || '') + ' ' + (contact.lastName || '')).trim(),
              email: (o.buyerInfo && o.buyerInfo.email) || '',
              phone: contact.phone || ''
            },
            shipping: {
              addressLine: ship.addressLine || '',
              city: ship.city || '',
              postalCode: ship.postalCode || '',
              country: ship.country || '',
              countryFullname: ship.countryFullname || ''
            },
            lineItems: (o.lineItems || []).map(li => ({
              productId: (li.catalogReference && li.catalogReference.catalogItemId) || '',
              productName: (li.productName && li.productName.original) || '',
              image: (li.image && li.image.url) || '',
              quantity: li.quantity || 1,
              price: (li.price && li.price.amount) || '0.00',
              options: (li.catalogReference && li.catalogReference.options && li.catalogReference.options.options) || {}
            }))
          });
        }
        if (stopPaging) break;
        cursor = (data.metadata && data.metadata.cursors && data.metadata.cursors.next) || null;
        pages++;
      } while (cursor && pages < 30);

      const payload = JSON.stringify({
        updatedAt: new Date().toISOString(),
        count: all.length,
        orders: all
      });
      await env.BUCKET.put('wix-orders.json', payload, {
        httpMetadata: { contentType: 'application/json' }
      });
      return json({ ok: true, count: all.length, updatedAt: new Date().toISOString() });
    }

    if (req.method === 'POST' && parts[0] === 'wix-create-product') {
      if (!env.WIX_API_TOKEN) return json({ error: 'WIX_API_TOKEN env var not set' }, 500);
      if (!env.WIX_SITE_ID)   return json({ error: 'WIX_SITE_ID env var not set' }, 500);

      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }

      const name = (body.name || '').trim();
      const priceAmount   = String(body.priceAmount   || '').replace(/[£$,\s]/g, '');
      const compareAmount = String(body.comparePriceAmount || '').replace(/[£$,\s]/g, '');
      const sizes   = Array.isArray(body.sizes)   ? body.sizes.map(s => String(s).trim()).filter(Boolean)   : [];
      const colours = Array.isArray(body.colours) ? body.colours.map(c => String(c).trim()).filter(Boolean) : [];

      if (!name) return json({ error: 'Missing name' }, 400);
      if (!priceAmount || isNaN(parseFloat(priceAmount))) {
        return json({ error: 'Missing or invalid price (expected a number like 89.99)' }, 400);
      }

      const variantPrice = { actualPrice: { amount: priceAmount } };
      if (compareAmount && !isNaN(parseFloat(compareAmount))) {
        variantPrice.compareAtPrice = { amount: compareAmount };
      }

      // Build options + variants from sizes/colours. Wix requires a variant entry for every combination.
      const options = [];
      if (sizes.length) {
        options.push({
          name: 'Size',
          optionRenderType: 'TEXT_CHOICES',
          choicesSettings: { choices: sizes.map(s => ({ choiceType: 'CHOICE_TEXT', name: s })) }
        });
      }
      if (colours.length) {
        options.push({
          name: 'Color',
          optionRenderType: 'TEXT_CHOICES',
          choicesSettings: { choices: colours.map(c => ({ choiceType: 'CHOICE_TEXT', name: c })) }
        });
      }
      const sizeList   = sizes.length   ? sizes   : [null];
      const colourList = colours.length ? colours : [null];
      const variants = [];
      for (const sz of sizeList) {
        for (const co of colourList) {
          const choices = [];
          if (sz) choices.push({ optionChoiceNames: { optionName: 'Size',  choiceName: sz, renderType: 'TEXT_CHOICES' } });
          if (co) choices.push({ optionChoiceNames: { optionName: 'Color', choiceName: co, renderType: 'TEXT_CHOICES' } });
          variants.push({
            visible: true,
            choices,
            price: variantPrice,
            physicalProperties: {}
          });
        }
      }

      const product = {
        name,
        visible: true,
        productType: 'PHYSICAL',
        physicalProperties: {},
        options,
        variantsInfo: { variants }
      };

      const r = await fetch('https://www.wixapis.com/stores/v3/products', {
        method: 'POST',
        headers: {
          'Authorization': env.WIX_API_TOKEN,
          'wix-site-id': env.WIX_SITE_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product })
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return json({ error: 'Wix API ' + r.status, detail: t.slice(0, 500) }, 502);
      }
      const data = await r.json();
      const p = data.product || {};
      const publicUrl = p.slug ? ('https://www.essentialsblanks.net/product-page/' + p.slug) : '';
      return json({ ok: true, id: p.id, slug: p.slug, name: p.name, url: publicUrl });
    }

    return json({ error: 'Not found' }, 404);
  }
};
