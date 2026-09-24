function base64UrlEncode(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlDecode(value) {
  const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(value || '').length + 3) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
async function hmacBytes(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}
async function createAdminSession(env) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ exp: Date.now() + 2 * 60 * 60 * 1000, nonce: crypto.randomUUID() })));
  const signature = base64UrlEncode(await hmacBytes(env.ADMIN_SESSION_SECRET || env.ADMIN_SECRET, payload));
  return payload + '.' + signature;
}
async function verifyAdminSession(env, token) {
  if (!token || !(env.ADMIN_SESSION_SECRET || env.ADMIN_SECRET)) return false;
  const [payload, signature] = String(token).split('.');
  if (!payload || !signature) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (!data.exp || Number(data.exp) <= Date.now()) return false;
    const expected = await hmacBytes(env.ADMIN_SESSION_SECRET || env.ADMIN_SECRET, payload);
    const supplied = base64UrlDecode(signature);
    if (supplied.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ supplied[i];
    return diff === 0;
  } catch {
    return false;
  }
}
function adminPassword(env) {
  return String(env.ADMIN_PASSWORD || env.ESNTLS_ADMIN_PASSWORD || env.ADMIN_PASS || '');
}


var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(raw || cooked.slice()) }));

// worker/r2-worker.js
var PUBLIC_BASE = "https://pub-43c9cf7fd2904289881c21839332521c.r2.dev/";
var DEFAULT_SUPPLIER_IMAGE_ROUTE_BASE = "https://esntls-r2.qmako41212.workers.dev/supplier-image/";
var DEFAULT_BACKGROUND_URL = "https://esntlsclub.com/img/esntls-blank-concrete-background.jpg";
var FALLBACK_BACKGROUND_URL = "https://raw.githubusercontent.com/qmako4/esntlsclub/main/img/esntls-blank-concrete-background.jpg";
var DEFAULT_GRASS_BACKGROUND_URL = "https://esntlsclub.com/img/esntls-grass-background.jpg";
var SHOPIFY_API_VERSION = "2026-04";
var YUPOO_IMPORT_LIMIT = 30;
var YUPOO_PAGE_CRAWL_LIMIT = 12;
var GRASS_JOB_ROOT = "studio-jobs/";
var GRASS_JOB_STALE_AFTER_MS = 2 * 60 * 1e3;
var GRASS_JOB_OPENAI_TIMEOUT_MS = 85 * 1e3;
var GRASS_JOB_FOREGROUND_TIMEOUT_MS = 180 * 1e3;
var GRASS_JOB_TERMINAL_STATUSES = ["complete", "partial", "failed", "cancelled"];
var WHATSAPP_ORDER_ROOT = "supplier-whatsapp/orders/";
var SUPPLIER_ORDER_ROOT = "supplier-orders/orders/";
var SUPPLIER_TRACKING_SYNC_ROOT = "supplier-tracking-sync/";
var SUPPLIER_TRACKING_LOCK_KEY = `${SUPPLIER_TRACKING_SYNC_ROOT}lock.json`;
var SUPPLIER_PORTAL_ORDER_ROOT = "supplier-portal/orders/";
var SUPPLIER_PORTAL_SYNC_ROOT = "supplier-portal/sync/";
var SUPPLIER_PORTAL_SYNC_LOCK_KEY = `${SUPPLIER_PORTAL_SYNC_ROOT}lock.json`;
var SUPPLIER_PORTAL_HIDDEN_ITEM_ROOT = "supplier-portal/hidden-items/";
var SUPPLIER_PORTAL_METROPOLIS_IMAGE_URL = "https://raw.githubusercontent.com/qmako4/esntlsclub/main/img/gel-runners-metropolis-grey.jpg";
var WHATSAPP_DEFAULT_GRAPH_VERSION = "v21.0";
var JSON_CONTENT_TYPE = "application/json; charset=utf-8";
var googleSheetsTokenCache = { cacheKey: "", accessToken: "", expiresAt: 0 };
var SUPPLIER_SHEET_COLS = {
  ORDER_DATE: 0,
  ORDER_NAME: 1,
  CUSTOMER_NAME: 2,
  ADDRESS_1: 3,
  ADDRESS_2: 4,
  CITY: 5,
  POSTCODE: 6,
  COUNTRY: 7,
  PRODUCT_IMAGE: 8,
  PRODUCT_IMAGE_URL: 9,
  PRODUCT_NAME: 10,
  OPTION: 11,
  QUANTITY: 12,
  SUPPLIER_STATUS: 13,
  TRACKING_NUMBER: 14,
  COURIER: 15,
  SUPPLIER_NOTES: 16,
  SHOPIFY_UPDATED: 17
};
var cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Session, X-Admin-Secret, X-ESNTLS-Service-Token, X-Supplier-Portal-Token",
  "Access-Control-Max-Age": "86400"
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
__name(json, "json");
var PRODUCT_SEARCH_QUERY = `
query ProductsBySourceTag($query: String!) {
  products(first: 1, query: $query) {
    nodes { id title handle tags }
  }
}`;
var PRODUCT_VARIANTS_QUERY = `
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
var PRODUCT_VARIANTS_BULK_UPDATE_MUTATION = `
mutation ProductVariantsBulkUpdateForPriceSync($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    product { id title handle }
    productVariants { id price }
    userErrors { field message }
  }
}`;
var RECENT_SUPPLIER_ORDERS_QUERY = `
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
var SHOPIFY_WEBHOOK_STATUS_QUERY = `
query SupplierWebhookStatus($topics: [WebhookSubscriptionTopic!]) {
  shop { name myshopifyDomain }
  webhookSubscriptions(first: 50, topics: $topics) {
    nodes { id topic uri format createdAt updatedAt }
  }
}`;
var SUPPLIER_TRACKING_ORDER_QUERY = `
query SupplierTrackingOrder($query: String!) {
  orders(first: 1, query: $query) {
    nodes {
      id
      name
      displayFulfillmentStatus
      fulfillable
      fulfillmentOrders(first: 20) {
        nodes {
          id
          status
          requestStatus
          lineItems(first: 50) {
            nodes {
              id
              remainingQuantity
              requiresShipping
              sku
              productTitle
              variantTitle
              lineItem {
                id
                name
                title
                sku
                quantity
                currentQuantity
                variantTitle
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
      }
    }
  }
}`;
var SUPPLIER_TRACKING_FULFILLMENT_MUTATION = `
mutation SupplierTrackingFulfillment($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment {
      id
      status
      trackingInfo { number company url }
    }
    userErrors { field message }
  }
}`;
var SHOPIFY_PAYMENTS_PAYOUTS_QUERY = `
query ShopifyPaymentsPayouts($first: Int!, $query: String, $reverse: Boolean!) {
  shop {
    name
    myshopifyDomain
  }
  shopifyPaymentsAccount {
    balance {
      amount
      currencyCode
    }
    payouts(first: $first, query: $query, reverse: $reverse, sortKey: ISSUED_AT) {
      nodes {
        id
        issuedAt
        net {
          amount
          currencyCode
        }
        status
        transactionType
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}`;
var PRODUCT_VARIANTS_STOCK_QUERY = `
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
var PRODUCT_VARIANTS_BULK_CREATE_STOCK_MUTATION = `
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
var PRODUCT_VARIANTS_POLICY_UPDATE_MUTATION = `
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
var STAGED_UPLOAD_MUTATION = `
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
var PRODUCT_SET_MUTATION = `
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
var PRODUCT_UPDATE_MEDIA_MUTATION = `
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
var PRODUCT_UPDATE_STATUS_MUTATION = `
mutation ProductUpdateStatus($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { id title handle status }
    userErrors { field message }
  }
}`;
var PUBLICATIONS_QUERY = `
query PublicationsForStorefront {
  publications(first: 20) { nodes { id name } }
}`;
var PUBLISHABLE_PUBLISH_MUTATION = `
mutation PublishProductToOnlineStore($id: ID!, $publicationId: ID!) {
  publishablePublish(id: $id, input: { publicationId: $publicationId }) {
    publishable { ... on Product { id title handle } }
    userErrors { field message }
  }
}`;
var DISCOUNT_BY_CODE_QUERY = `
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
var B30_DISCOUNT_CREATE_MUTATION = `
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
var B30_DISCOUNT_UPDATE_MUTATION = `
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
var BXGY_DISCOUNT_CREATE_MUTATION = `
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
var BXGY_DISCOUNT_UPDATE_MUTATION = `
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
var COLOR_PATTERNS = [
  [/black\s*(?:and|&|\+|\/)\s*white|white\s*(?:and|&|\+|\/)\s*black/i, "Black & White"],
  [/black\s*(?:and|&|\+|\/)\s*grey|grey\s*(?:and|&|\+|\/)\s*black|black\s*(?:and|&|\+|\/)\s*gray|gray\s*(?:and|&|\+|\/)\s*black/i, "Black & Grey"],
  [/grey\s*(?:and|&|\+|\/)\s*white|white\s*(?:and|&|\+|\/)\s*grey|gray\s*(?:and|&|\+|\/)\s*white|white\s*(?:and|&|\+|\/)\s*gray/i, "Grey & White"],
  [/blue\s*(?:and|&|\+|\/)?\s*lime|lime\s*(?:and|&|\+|\/)?\s*blue/i, "Blue Lime"],
  [/light\s*blue/i, "Light Blue"],
  [/dark\s*blue/i, "Dark Blue"],
  [/\bnavy\b/i, "Navy"],
  [/\bpink\b/i, "Pink"],
  [/\bbrown\b/i, "Brown"],
  [/\bbeige\b/i, "Beige"],
  [/\bcream\b/i, "Cream"],
  [/\bred\b/i, "Red"],
  [/\bgreen\b/i, "Green"],
  [/\blime\b/i, "Lime"],
  [/\bwhite\b/i, "White"],
  [/\bblack\b/i, "Black"],
  [/\bgr[ae]y\b/i, "Grey"],
  [/\bblue\b/i, "Blue"]
];
function productText(product) {
  return `${product.title || ""} ${product.categories.join(" ")}`;
}
__name(productText, "productText");
function stableNameIndex(value, count) {
  if (!count) return 0;
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = hash * 31 + text.charCodeAt(index) >>> 0;
  }
  return hash % count;
}
__name(stableNameIndex, "stableNameIndex");
function chooseNameVariant(product, variants) {
  const key = `${product?.id || ""}|${productText(product)}`;
  return variants[stableNameIndex(key, variants.length)];
}
__name(chooseNameVariant, "chooseNameVariant");
function inferPlaceholderColor(product) {
  const text = productText(product);
  const hit = COLOR_PATTERNS.find(([pattern]) => pattern.test(text));
  return hit ? hit[1] : "";
}
__name(inferPlaceholderColor, "inferPlaceholderColor");
function inferPlaceholderBase(product) {
  const text = productText(product).toLowerCase();
  if (/\b(sandals?|slides?|sliders?)\b/.test(text)) return /\b(slides?|sliders?)\b/.test(text) ? "Classic Slides" : "Classic Sandals";
  if (/\b(gel|kayano|asics)\b/.test(text)) return "Gel Runners";
  if (/\b(b30|gats?|technical)\b/.test(text)) return chooseNameVariant(product, ["Panelled Runners", "Retro Trainers", "Court Runners", "Low Trainers"]);
  if (/\b(b22|runner|sneakers?|trainers?|shoes?|footwear)\b/.test(text)) return chooseNameVariant(product, ["Runner Sneakers", "Court Trainers", "Everyday Runners", "Clean Trainers", "Panelled Sneakers"]);
  if (/\b(t-?shirt|tee|shirt)\b/.test(text)) return "Simple T-Shirt";
  if (/\b(shorts?)\b/.test(text)) return "Summer Shorts";
  if (/\b(tracksuit)\b/.test(text)) return "Core Tracksuit";
  if (/\b(parka)\b/.test(text)) return "Parka Jacket";
  if (/\b(puffer)\b/.test(text)) return "Puffer Jacket";
  if (/\b(jacket|windrunner|coat|outerwear|clothing)\b/.test(text)) return "Lightweight Jacket";
  if (/\b(watches?|timepieces?|datejust|daytona|submariner|oyster|gmt|rolex|cartier|patek|audemars|royal\s*oak)\b/.test(text)) return "Classic Watch";
  if (/\b(earphones?|earbuds?|headphones?|airpods?)\b/.test(text)) return "Essential Earphones";
  if (/\b(sunglasses?|glasses|shades)\b/.test(text)) return "Sunglasses";
  if (/\b(wallets?|card\s*holders?|cardholders?)\b/.test(text)) return "Card Holder";
  if (/\b(belts?)\b/.test(text)) return "Leather Belt";
  if (/\b(caps?|hats?|beanies?)\b/.test(text)) return "Cap";
  if (/\b(bracelets?|necklaces?|rings?|chains?|jewell?ery)\b/.test(text)) return "Jewellery Piece";
  if (/\b(messenger|bags?|backpacks?|totes?|duffles?|crossbody)\b/.test(text)) return "Messenger Bag";
  if (/\b(accessories?)\b/.test(text)) return "Essential Accessory";
  return "Select Piece";
}
__name(inferPlaceholderBase, "inferPlaceholderBase");
function buildPlaceholderTitle(product) {
  const base = inferPlaceholderBase(product);
  const color = inferPlaceholderColor(product);
  return color ? `The ${base} - ${color}` : `The ${base}`;
}
__name(buildPlaceholderTitle, "buildPlaceholderTitle");
function normalizePlaceholderTitleOverride(value) {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  if (!title) return "";
  if (title.length < 3) throw new Error("Shopify name must be at least 3 characters");
  if (title.length > 80) throw new Error("Shopify name must be 80 characters or less");
  return title;
}
__name(normalizePlaceholderTitleOverride, "normalizePlaceholderTitleOverride");
function slugify(value) {
  return String(value || "product").toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
__name(slugify, "slugify");
function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}
__name(splitList, "splitList");
function isDefaultClothingSizeList(value) {
  const clothing = /* @__PURE__ */ new Set(["XS", "S", "M", "L", "XL"]);
  const sizes = splitList(value).map((size) => size.toUpperCase());
  return sizes.length > 0 && sizes.every((size) => clothing.has(size));
}
__name(isDefaultClothingSizeList, "isDefaultClothingSizeList");
function productLooksLikeFootwear(product) {
  const text = `${product.title || ""} ${product.categories.join(" ")}`.toLowerCase();
  return /\b(sandals?|slides?|sliders?|trainers?|sneakers?|shoes?|footwear|gats?|b22|b30|asics|gel|kayano|saucony)\b/.test(text);
}
__name(productLooksLikeFootwear, "productLooksLikeFootwear");
function uniqueList(values) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const value of values || []) {
    const clean = String(value || "").replace(/\s+/g, " ").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}
__name(uniqueList, "uniqueList");
function splitOptionValues(value) {
  if (Array.isArray(value) || typeof value === "string") return uniqueList(splitList(value));
  return [];
}
__name(splitOptionValues, "splitOptionValues");
function cleanOptionName(value, fallback = "Style") {
  const name = String(value || "").replace(/\s+/g, " ").trim().slice(0, 30);
  return name || fallback;
}
__name(cleanOptionName, "cleanOptionName");
function priceAmount(value) {
  const cleaned = String(value || "").replace(/[£$,\s]/g, "");
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]).toFixed(2) : "";
}
__name(priceAmount, "priceAmount");
function normalizeStoredProduct(raw) {
  const title = raw.name || raw.title || raw.productName || "";
  const categories = splitList(raw.category || raw.categories);
  const image = raw.image || raw.imageUrl || raw.featuredImage || raw.thumbnail || raw.images?.[0]?.url || raw.images?.[0] || "";
  const variationValues = splitOptionValues(raw.variationValues ?? raw.variations ?? raw.variantValues ?? raw.colours ?? raw.colors);
  const variationName = variationValues.length ? cleanOptionName(raw.variationName || raw.variantOptionName || raw.optionName || raw.optionLabel, "Style") : "";
  return {
    id: raw.id || raw.productId || raw.slug || slugify(title),
    title,
    price: priceAmount(raw.price || raw.price_gbp || raw.sale_price_gbp),
    link: raw.link || "",
    image,
    sizes: splitList(raw.sizes || raw.size || raw.availableSizes),
    variationName,
    variationValues,
    categories,
    active: raw.active !== false,
    raw
  };
}
__name(normalizeStoredProduct, "normalizeStoredProduct");
function inferSizes(product, env) {
  if (productLooksLikeFootwear(product) && (!product.sizes.length || isDefaultClothingSizeList(product.sizes))) {
    return splitList(env.DEFAULT_FOOTWEAR_SIZES || "UK 5,UK 6,UK 7,UK 8,UK 9,UK 10,UK 11,UK 12");
  }
  if (product.sizes.length) return product.sizes;
  const text = `${product.title || ""} ${product.categories.join(" ")}`.toLowerCase();
  if (/\b(t-?shirts?|tees?|shirts?|shorts?|jackets?|tracksuits?|hoodies?|clothing|tops?|parkas?|puffers?|coats?|casablanca)\b/.test(text)) {
    return splitList(env.DEFAULT_CLOTHING_SIZES || "XS,S,M,L,XL");
  }
  if (/\b(watches?|timepieces?|datejust|daytona|submariner|oyster|gmt|rolex|cartier|patek|audemars|royal\s*oak|earphones?|earbuds?|headphones?|airpods?|sunglasses?|glasses|shades|wallets?|card\s*holders?|cardholders?|belts?|caps?|hats?|beanies?|bracelets?|necklaces?|rings?|chains?|jewell?ery|messenger|bags?|backpacks?|totes?|duffles?|crossbody|accessories?)\b/.test(text)) {
    return splitList(env.DEFAULT_ACCESSORY_SIZES || "One Size");
  }
  return splitList(env.DEFAULT_SIZES || "One Size");
}
__name(inferSizes, "inferSizes");
function buildProductVariantPlan(product, env) {
  const sizes = uniqueList(inferSizes(product, env));
  const variationValues = splitOptionValues(product.variationValues);
  let variationName = variationValues.length ? cleanOptionName(product.variationName, "Style") : "";
  if (variationName.toLowerCase() === "size") variationName = "Style";
  const productOptions = [];
  if (sizes.length) {
    productOptions.push({ name: "Size", position: 1, values: sizes.map((size) => ({ name: size })) });
  }
  if (variationValues.length) {
    productOptions.push({
      name: variationName,
      position: productOptions.length + 1,
      values: variationValues.map((value) => ({ name: value }))
    });
  }
  const sizeList = sizes.length ? sizes : [null];
  const variationList = variationValues.length ? variationValues : [null];
  const variants = [];
  for (const size of sizeList) {
    for (const variation of variationList) {
      const optionValues = [];
      const skuParts = ["ESNTLS", slugify(product.id)];
      if (size) {
        optionValues.push({ optionName: "Size", name: size });
        skuParts.push(slugify(size).toUpperCase());
      }
      if (variation) {
        optionValues.push({ optionName: variationName, name: variation });
        skuParts.push(slugify(variation).toUpperCase());
      }
      variants.push({
        optionValues,
        price: product.price,
        sku: skuParts.join("-")
      });
    }
  }
  return { sizes, variationName, variationValues, productOptions, variants };
}
__name(buildProductVariantPlan, "buildProductVariantPlan");
function numericShopifyVariantId(value) {
  const match = String(value || "").match(/(\d+)(?:\D*)$/);
  return match ? match[1] : "";
}
__name(numericShopifyVariantId, "numericShopifyVariantId");
function shopifyVariantKey(optionValues) {
  return (optionValues || []).map((optionValue) => optionValue.name).filter(Boolean).join("|") || "Default";
}
__name(shopifyVariantKey, "shopifyVariantKey");
function buildShopifyVariantMap(shopifyVariants, variantPlan) {
  const nodes = Array.isArray(shopifyVariants) ? shopifyVariants : [];
  const map = {};
  const planned = variantPlan?.variants || [];
  nodes.forEach((node) => {
    const id = numericShopifyVariantId(node?.id);
    if (!id) return;
    const title = String(node?.title || "").trim();
    if (title && title.toLowerCase() !== "default title") {
      map[title] = id;
      const normalizedTitle = title.split(/\s*\/\s*/).filter(Boolean).join("|");
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
  nodes.forEach((node) => {
    const id = numericShopifyVariantId(node?.id);
    if (id) map[node.title || "Default"] = id;
  });
  return map;
}
__name(buildShopifyVariantMap, "buildShopifyVariantMap");
async function shopifyVariantMapForProduct(env, productId, sourceProduct) {
  const variantPlan = buildProductVariantPlan(sourceProduct, env);
  const data = await shopifyGraphql(env, PRODUCT_VARIANTS_QUERY, { id: productId });
  return buildShopifyVariantMap(data.product?.variants?.nodes || [], variantPlan);
}
__name(shopifyVariantMapForProduct, "shopifyVariantMapForProduct");
function shopifyVariantSize(node) {
  const selected = (node?.selectedOptions || []).find((option) => /^size$/i.test(String(option?.name || "")));
  return String(selected?.value || node?.title || "").replace(/\s+/g, " ").trim();
}
__name(shopifyVariantSize, "shopifyVariantSize");
function buildShopifyVariantMapFromNodes(nodes) {
  const map = {};
  for (const node of nodes || []) {
    const id = numericShopifyVariantId(node?.id);
    const size = shopifyVariantSize(node);
    if (id && size && size.toLowerCase() !== "default title") map[size] = id;
  }
  return map;
}
__name(buildShopifyVariantMapFromNodes, "buildShopifyVariantMapFromNodes");
function productIsB30(rawProduct) {
  const text = `${rawProduct?.name || rawProduct?.title || ""} ${rawProduct?.brand || ""} ${rawProduct?.category || rawProduct?.categories || ""}`.toLowerCase();
  return /\bb30\b/.test(text);
}
__name(productIsB30, "productIsB30");
function shopifyProductIdForRawProduct(rawProduct) {
  return rawProduct?.shopifyPlaceholder?.shopifyProductId || rawProduct?.shopifyProductId || "";
}
__name(shopifyProductIdForRawProduct, "shopifyProductIdForRawProduct");
async function restoreB30ShopifyStockFromR2(env, requestBody = {}) {
  const { payload, list } = await readProductsPayload(env);
  const requestedSizes = uniqueList(splitList(requestBody.sizes || env.DEFAULT_FOOTWEAR_SIZES || "UK 5,UK 6,UK 7,UK 8,UK 9,UK 10,UK 11,UK 12"));
  const sizes = requestedSizes.length ? requestedSizes : ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11", "UK 12"];
  const inventoryPolicy = String(requestBody.inventoryPolicy || "CONTINUE").toUpperCase() === "DENY" ? "DENY" : "CONTINUE";
  const createMissing = requestBody.createMissing !== false;
  const dryRun = requestBody.dryRun === true;
  const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const products = [];
  const skipped = [];
  for (const rawProduct of list) {
    if (!productIsB30(rawProduct)) continue;
    const shopifyProductId = shopifyProductIdForRawProduct(rawProduct);
    if (!shopifyProductId) {
      skipped.push({ id: rawProduct.id, name: rawProduct.name || rawProduct.title || "", reason: "Missing linked Shopify product ID" });
      continue;
    }
    const product = normalizeStoredProduct({ ...rawProduct, sizes });
    const data = await shopifyGraphql(env, PRODUCT_VARIANTS_STOCK_QUERY, { id: shopifyProductId });
    const shopifyProduct = data.product;
    if (!shopifyProduct) {
      skipped.push({ id: rawProduct.id, name: product.title, reason: "Shopify product was not found" });
      continue;
    }
    const variants = shopifyProduct.variants?.nodes || [];
    const bySize = /* @__PURE__ */ new Map();
    for (const variant of variants) {
      const size = shopifyVariantSize(variant);
      if (size) bySize.set(size.toLowerCase(), variant);
    }
    const missingSizes = sizes.filter((size) => !bySize.has(size.toLowerCase()));
    const created = [];
    if (createMissing && missingSizes.length && !dryRun) {
      const createData = await shopifyGraphql(env, PRODUCT_VARIANTS_BULK_CREATE_STOCK_MUTATION, {
        productId: shopifyProduct.id,
        variants: missingSizes.map((size) => ({
          optionValues: [{ optionName: "Size", name: size }],
          price: product.price,
          inventoryItem: { sku: `ESNTLS-${slugify(product.id)}-${slugify(size).toUpperCase()}` },
          inventoryPolicy
        }))
      });
      const result = createData.productVariantsBulkCreate;
      if (result.userErrors.length) throw new Error(`Shopify B30 variant create failed for ${product.title}: ${JSON.stringify(result.userErrors)}`);
      created.push(...result.productVariants || []);
      for (const variant of created) {
        const size = shopifyVariantSize(variant);
        if (size) bySize.set(size.toLowerCase(), variant);
      }
    }
    const targets = sizes.map((size) => bySize.get(size.toLowerCase())).filter(Boolean);
    const needsPolicyUpdate = targets.filter((variant) => variant.inventoryPolicy !== inventoryPolicy);
    const policyUpdated = [];
    if (needsPolicyUpdate.length && !dryRun) {
      const updateData = await shopifyGraphql(env, PRODUCT_VARIANTS_POLICY_UPDATE_MUTATION, {
        productId: shopifyProduct.id,
        variants: needsPolicyUpdate.map((variant) => ({ id: variant.id, inventoryPolicy }))
      });
      const result = updateData.productVariantsBulkUpdate;
      if (result.userErrors.length) throw new Error(`Shopify B30 stock policy update failed for ${product.title}: ${JSON.stringify(result.userErrors)}`);
      policyUpdated.push(...result.productVariants || []);
      for (const variant of policyUpdated) {
        const size = shopifyVariantSize(variant);
        if (size) bySize.set(size.toLowerCase(), variant);
      }
    }
    const refreshedData = dryRun ? { product: shopifyProduct } : await shopifyGraphql(env, PRODUCT_VARIANTS_STOCK_QUERY, { id: shopifyProduct.id });
    const refreshedProduct = refreshedData.product || shopifyProduct;
    const refreshedVariants = refreshedProduct.variants?.nodes || [];
    const variantMap = buildShopifyVariantMapFromNodes(refreshedVariants);
    if (!dryRun) {
      rawProduct.sizes = sizes;
      rawProduct.shopifyVariants = variantMap;
      rawProduct.shopifyVariantId = Object.values(variantMap)[0] || rawProduct.shopifyVariantId || "";
      rawProduct.delivery = rawProduct.delivery || "7-12 Days";
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
        created: created.map((variant) => ({ id: numericShopifyVariantId(variant.id), title: variant.title || shopifyVariantSize(variant) })),
        policyUpdated: policyUpdated.map((variant) => ({ id: numericShopifyVariantId(variant.id), title: variant.title || shopifyVariantSize(variant) })),
        updatedAt
      };
    }
    products.push({
      id: rawProduct.id,
      name: product.title,
      shopifyTitle: refreshedProduct.title,
      shopifyUrl: storefrontUrl(env, refreshedProduct.handle),
      missingBefore: missingSizes,
      created: created.map((variant) => ({ id: numericShopifyVariantId(variant.id), title: variant.title || shopifyVariantSize(variant) })),
      policyUpdated: policyUpdated.map((variant) => ({ id: numericShopifyVariantId(variant.id), title: variant.title || shopifyVariantSize(variant) })),
      variants: variantMap
    });
  }
  if (!dryRun) await writeProductsPayload(env, payload);
  return { ok: true, dryRun, inventoryPolicy, sizes, updated: products.length, skipped: skipped.length, products, skippedProducts: skipped, updatedAt };
}
__name(restoreB30ShopifyStockFromR2, "restoreB30ShopifyStockFromR2");
function sourceTags(product) {
  return [
    "ESNTLS-BLANK-WORKFLOW",
    `ESNTLS-ID-${product.id}`,
    `ESNTLS-SOURCE-ID-${product.id}`,
    `ESNTLS-SOURCE-TITLE-${slugify(product.title)}`,
    ...product.categories
  ].filter(Boolean);
}
__name(sourceTags, "sourceTags");
function shopifyStoreDomain(env) {
  if (!env.SHOPIFY_STORE_DOMAIN) throw new Error("SHOPIFY_STORE_DOMAIN env var not set");
  return env.SHOPIFY_STORE_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
__name(shopifyStoreDomain, "shopifyStoreDomain");
function storefrontUrl(env, handle) {
  return `https://${shopifyStoreDomain(env)}/products/${handle}`;
}
__name(storefrontUrl, "storefrontUrl");
function extractShopifyHandle(value, env) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const storeHost = shopifyStoreDomain(env).replace(/^www\./, "").toLowerCase();
    const isShopify = host === storeHost || host.endsWith(".myshopify.com");
    if (!isShopify) return "";
    const match = url.pathname.match(/\/products\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}
__name(extractShopifyHandle, "extractShopifyHandle");
function extractWixSlug(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!/essentialsblanks\.net$/i.test(url.hostname.replace(/^www\./, ""))) return "";
    const match = url.pathname.match(/\/product-page\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}
__name(extractWixSlug, "extractWixSlug");
function isShopifyCheckoutUrl(value, env) {
  return !!extractShopifyHandle(value, env);
}
__name(isShopifyCheckoutUrl, "isShopifyCheckoutUrl");
function isWixCheckoutUrl(value) {
  return !!extractWixSlug(value);
}
__name(isWixCheckoutUrl, "isWixCheckoutUrl");
function hasUsableWixBackup(backup) {
  return !!(backup && (backup.url || backup.id) && backup.status !== "error" && backup.status !== "skipped");
}
__name(hasUsableWixBackup, "hasUsableWixBackup");
function getCheckoutLinks(rawProduct, env) {
  const existing = rawProduct.checkoutLinks && typeof rawProduct.checkoutLinks === "object" ? { ...rawProduct.checkoutLinks } : {};
  const currentLink = rawProduct.link || "";
  if (!existing.shopify) {
    const shopifyUrl = rawProduct.shopifyPlaceholder?.shopifyUrl || rawProduct.shopifyUrl || "";
    if (shopifyUrl) existing.shopify = shopifyUrl;
  }
  if (!existing.shopify && currentLink && isShopifyCheckoutUrl(currentLink, env)) {
    existing.shopify = currentLink;
  }
  if (!existing.originalWix && currentLink && isWixCheckoutUrl(currentLink)) {
    existing.originalWix = currentLink;
  }
  if (!existing.wix) {
    const wixUrl = rawProduct.wixBackupPlaceholder?.url || rawProduct.wixLink || rawProduct.wixUrl || existing.originalWix || "";
    if (wixUrl) existing.wix = wixUrl;
  }
  if (!existing.active) {
    existing.active = isShopifyCheckoutUrl(currentLink, env) ? "shopify" : isWixCheckoutUrl(currentLink) ? "wix" : "";
  }
  return existing;
}
__name(getCheckoutLinks, "getCheckoutLinks");
function rememberCheckoutLinks(rawProduct, env, updates = {}) {
  const links = getCheckoutLinks(rawProduct, env);
  if (updates.shopifyUrl) links.shopify = updates.shopifyUrl;
  if (updates.wixUrl) links.wix = updates.wixUrl;
  if (updates.originalWix && !links.originalWix) links.originalWix = updates.originalWix;
  if (updates.active) links.active = updates.active;
  links.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  rawProduct.checkoutLinks = links;
  return links;
}
__name(rememberCheckoutLinks, "rememberCheckoutLinks");
function checkoutUrlForMode(rawProduct, env, mode) {
  const links = getCheckoutLinks(rawProduct, env);
  if (mode === "shopify") {
    return rawProduct.shopifyPlaceholder?.shopifyUrl || links.shopify || (isShopifyCheckoutUrl(rawProduct.link, env) ? rawProduct.link : "");
  }
  if (mode === "wix") {
    return rawProduct.wixBackupPlaceholder?.url || links.wix || links.originalWix || (isWixCheckoutUrl(rawProduct.link) ? rawProduct.link : "");
  }
  return "";
}
__name(checkoutUrlForMode, "checkoutUrlForMode");
function buildDescriptionHtml() {
  return [
    "<p><strong>Blank item = original item.</strong></p>",
    "<p><strong>Buy the blank item shown at checkout. You'll receive the original item you selected.</strong></p>"
  ].join("");
}
__name(buildDescriptionHtml, "buildDescriptionHtml");
function shopifyOrderDisplayName(order) {
  return String(order?.name || order?.order_number || order?.id || "").replace(/\s+/g, " ").trim();
}
__name(shopifyOrderDisplayName, "shopifyOrderDisplayName");
function shopifyOrderId(order) {
  return String(order?.admin_graphql_api_id || order?.id || shopifyOrderDisplayName(order) || "").trim();
}
__name(shopifyOrderId, "shopifyOrderId");
function supplierWhatsappOrderKey(order, deliveryId = "") {
  const stable = shopifyOrderId(order) || deliveryId || crypto.randomUUID();
  return `${WHATSAPP_ORDER_ROOT}${slugify(stable)}.json`;
}
__name(supplierWhatsappOrderKey, "supplierWhatsappOrderKey");
function safeMessageLine(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}
__name(safeMessageLine, "safeMessageLine");
function normalizeTitleKey(value) {
  return safeMessageLine(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
__name(normalizeTitleKey, "normalizeTitleKey");
function normalizeShopifyNumericId(value) {
  return numericShopifyVariantId(value);
}
__name(normalizeShopifyNumericId, "normalizeShopifyNumericId");
function shopifyLineItems(order) {
  if (Array.isArray(order?.line_items)) return order.line_items;
  if (Array.isArray(order?.lineItems)) return order.lineItems;
  if (Array.isArray(order?.lineItems?.nodes)) return order.lineItems.nodes;
  if (Array.isArray(order?.lineItems?.edges)) {
    return order.lineItems.edges.map((edge) => edge?.node).filter(Boolean);
  }
  return [];
}
__name(shopifyLineItems, "shopifyLineItems");
function shopifyLineItemSku(lineItem) {
  return safeMessageLine(lineItem?.sku || lineItem?.variant?.sku || lineItem?.node?.sku || "");
}
__name(shopifyLineItemSku, "shopifyLineItemSku");
function shopifySourceIdFromSku(lineItem) {
  const sku = shopifyLineItemSku(lineItem);
  const match = sku.match(/^ESNTLS[-_]?0*([0-9]+)(?:[-_]|$)/i);
  return match ? String(Number(match[1])) : "";
}
__name(shopifySourceIdFromSku, "shopifySourceIdFromSku");
function linkedShopifyProductIds(rawProduct) {
  const placeholder = rawProduct?.shopifyPlaceholder || {};
  return uniqueList([
    rawProduct?.shopifyProductId,
    placeholder.shopifyProductId,
    rawProduct?.shopify?.productId
  ].map(normalizeShopifyNumericId).filter(Boolean));
}
__name(linkedShopifyProductIds, "linkedShopifyProductIds");
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
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    for (const value of Object.values(map)) {
      const id = normalizeShopifyNumericId(value);
      if (id) ids.push(id);
    }
  }
  return uniqueList(ids);
}
__name(linkedShopifyVariantIds, "linkedShopifyVariantIds");
function linkedShopifyTitleKeys(rawProduct) {
  const placeholder = rawProduct?.shopifyPlaceholder || {};
  return uniqueList([
    rawProduct?.shopifyTitle,
    placeholder.shopifyTitle,
    placeholder.title,
    rawProduct?.blankTitle
  ].map(normalizeTitleKey).filter(Boolean));
}
__name(linkedShopifyTitleKeys, "linkedShopifyTitleKeys");
function resolveEsntlsProductForShopifyLineItem(lineItem, products) {
  const skuSourceId = shopifySourceIdFromSku(lineItem);
  if (skuSourceId) {
    const match = products.find((product) => String(product.raw?.id || product.id) === skuSourceId);
    if (match) return match;
  }
  const productId = normalizeShopifyNumericId(lineItem?.product_id || lineItem?.productId || lineItem?.product?.id);
  const variantId = normalizeShopifyNumericId(lineItem?.variant_id || lineItem?.variantId || lineItem?.variant?.id);
  const titleKey = normalizeTitleKey(lineItem?.title || lineItem?.product_title || lineItem?.productTitle || "");
  if (productId) {
    const match = products.find((product) => linkedShopifyProductIds(product.raw).includes(productId));
    if (match) return match;
  }
  if (variantId) {
    const match = products.find((product) => linkedShopifyVariantIds(product.raw).includes(variantId));
    if (match) return match;
  }
  if (titleKey) {
    const match = products.find((product) => linkedShopifyTitleKeys(product.raw).includes(titleKey));
    if (match) return match;
  }
  return null;
}
__name(resolveEsntlsProductForShopifyLineItem, "resolveEsntlsProductForShopifyLineItem");
function isSupplierWhatsappExcludedItem(lineItem, product) {
  const sku = shopifyLineItemSku(lineItem);
  if (/^ESNTLS[-_]?0*54(?:[-_]|$)/i.test(sku)) return true;
  const sourceId = String(product?.raw?.id || product?.id || "").trim();
  if (sourceId === "54") return true;
  const text = normalizeTitleKey([
    product?.title,
    product?.raw?.name,
    lineItem?.title,
    lineItem?.name,
    lineItem?.product_title,
    lineItem?.variant_title,
    product?.raw?.shopifyPlaceholder?.shopifyTitle
  ].filter(Boolean).join(" "));
  return /\bair pro\b/.test(text) || /\bclassic essentials earphones\b/.test(text);
}
__name(isSupplierWhatsappExcludedItem, "isSupplierWhatsappExcludedItem");
function optionLooksLikeSize(value) {
  const text = safeMessageLine(value).toUpperCase();
  return /^(UK\s*)?\d{1,2}(?:\.\d)?$/.test(text) || /^UK\s*\d{1,2}(?:\.\d)?$/.test(text) || /^(XXS|XS|S|M|L|XL|XXL|XXXL|ONE SIZE|OS|OSFA)$/.test(text);
}
__name(optionLooksLikeSize, "optionLooksLikeSize");
function normalizeSupplierOption(value) {
  const text = safeMessageLine(value);
  if (!text || /^default title$/i.test(text)) return "";
  const ukMatch = text.match(/^UK\s*([0-9]{1,2}(?:\.\d)?)$/i) || text.match(/^([0-9]{1,2}(?:\.\d)?)$/);
  if (ukMatch) return `UK ${ukMatch[1]}`;
  return text;
}
__name(normalizeSupplierOption, "normalizeSupplierOption");
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
    if (!value || name.startsWith("_")) continue;
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
__name(lineItemOptionParts, "lineItemOptionParts");
function fallbackShopifyLineItemTitle(lineItem) {
  const title = safeMessageLine(lineItem?.title || lineItem?.product_title || lineItem?.productTitle || lineItem?.name);
  const variant = safeMessageLine(lineItem?.variant_title || lineItem?.variantTitle);
  if (title && variant && title.toLowerCase().endsWith(` - ${variant}`.toLowerCase())) {
    return title.slice(0, -variant.length - 3).trim();
  }
  return title || "Unknown item";
}
__name(fallbackShopifyLineItemTitle, "fallbackShopifyLineItemTitle");
function formatSupplierLineItem(lineItem, product) {
  const title = safeMessageLine(product?.title || product?.raw?.name || fallbackShopifyLineItemTitle(lineItem));
  const titleKey = normalizeTitleKey(title);
  const optionParts = lineItemOptionParts(lineItem).filter((option) => {
    if (optionLooksLikeSize(option)) return true;
    const optionKey = normalizeTitleKey(option);
    return optionKey && !titleKey.includes(optionKey);
  });
  const quantity = Math.max(1, Number(lineItem?.quantity || lineItem?.current_quantity || 1));
  const base = [title, ...optionParts].filter(Boolean).join(" - ");
  return quantity > 1 ? `${base} x${quantity}` : base;
}
__name(formatSupplierLineItem, "formatSupplierLineItem");
function shippingAddressLines(order) {
  const shipping = order?.shipping_address || order?.shippingAddress || {};
  const name = safeMessageLine(
    shipping.name || [shipping.first_name || shipping.firstName, shipping.last_name || shipping.lastName].filter(Boolean).join(" ")
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
__name(shippingAddressLines, "shippingAddressLines");
function shippingAddressFields(order) {
  const shipping = order?.shipping_address || order?.shippingAddress || {};
  return {
    name: safeMessageLine(
      shipping.name || [shipping.first_name || shipping.firstName, shipping.last_name || shipping.lastName].filter(Boolean).join(" ")
    ),
    address1: safeMessageLine(shipping.address1),
    address2: safeMessageLine(shipping.address2),
    city: safeMessageLine(shipping.city),
    province: safeMessageLine(shipping.province || shipping.province_code || shipping.provinceCode),
    postcode: safeMessageLine(shipping.zip || shipping.postal_code || shipping.postalCode),
    country: safeMessageLine(shipping.country || shipping.country_name || shipping.countryName || shipping.countryFullName || shipping.country_code)
  };
}
__name(shippingAddressFields, "shippingAddressFields");
function r2PublicUrlForKey(key) {
  const cleanKey = safeMessageLine(key).replace(/^\/+/, "");
  return cleanKey ? `${PUBLIC_BASE}${cleanKey}` : "";
}
__name(r2PublicUrlForKey, "r2PublicUrlForKey");
function cleanSupplierImageKey(value) {
  const key = safeMessageLine(value).replace(/^\/+/, "");
  if (!key || key.includes("..") || key.includes("\\")) return "";
  return key;
}
__name(cleanSupplierImageKey, "cleanSupplierImageKey");
function encodeR2KeyPath(key) {
  const cleanKey = cleanSupplierImageKey(key);
  return cleanKey ? cleanKey.split("/").map(encodeURIComponent).join("/") : "";
}
__name(encodeR2KeyPath, "encodeR2KeyPath");
function supplierImageRouteBase(env) {
  const configured = safeMessageLine(env?.SUPPLIER_IMAGE_ROUTE_BASE || DEFAULT_SUPPLIER_IMAGE_ROUTE_BASE).replace(/\/+$/, "");
  return configured ? `${configured}/` : DEFAULT_SUPPLIER_IMAGE_ROUTE_BASE;
}
__name(supplierImageRouteBase, "supplierImageRouteBase");
function r2KeyFromImageUrl(value) {
  const image = safeMessageLine(value);
  if (!image) return "";
  if (image.startsWith(PUBLIC_BASE)) {
    return cleanSupplierImageKey(decodeURIComponent(image.slice(PUBLIC_BASE.length).split(/[?#]/)[0]));
  }
  try {
    const parsed = new URL(image);
    if (/^(www\.)?esntlsclub\.com$/i.test(parsed.hostname) && parsed.pathname.startsWith("/media/")) {
      return cleanSupplierImageKey(decodeURIComponent(parsed.pathname.slice("/media/".length)));
    }
    if (/^esntls-r2\.qmako41212\.workers\.dev$/i.test(parsed.hostname) && parsed.pathname.startsWith("/supplier-image/")) {
      return cleanSupplierImageKey(decodeURIComponent(parsed.pathname.slice("/supplier-image/".length)));
    }
  } catch {
  }
  if (image.startsWith("/media/")) {
    return cleanSupplierImageKey(decodeURIComponent(image.slice("/media/".length).split(/[?#]/)[0]));
  }
  return "";
}
__name(r2KeyFromImageUrl, "r2KeyFromImageUrl");
function supplierSheetImageUrlForR2Key(env, key) {
  const encoded = encodeR2KeyPath(key);
  return encoded ? `${supplierImageRouteBase(env)}${encoded}` : "";
}
__name(supplierSheetImageUrlForR2Key, "supplierSheetImageUrlForR2Key");
function supplierSheetImageUrlFromSource(env, value) {
  const image = safeMessageLine(value);
  const key = r2KeyFromImageUrl(image);
  return key ? supplierSheetImageUrlForR2Key(env, key) : image;
}
__name(supplierSheetImageUrlFromSource, "supplierSheetImageUrlFromSource");
function supplierImageSourceUrl(value) {
  const image = safeMessageLine(value);
  if (!image) return "";
  if (image.startsWith(PUBLIC_BASE)) return image;
  if (/^https?:\/\//i.test(image)) {
    try {
      const parsed = new URL(image);
      if (/^(www\.)?esntlsclub\.com$/i.test(parsed.hostname) && parsed.pathname.startsWith("/media/")) {
        return r2PublicUrlForKey(decodeURIComponent(parsed.pathname.slice("/media/".length)));
      }
    } catch {
      return image;
    }
    return image;
  }
  if (image.startsWith("/media/")) return r2PublicUrlForKey(image.slice("/media/".length));
  if (image.startsWith("/")) return `https://esntlsclub.com${image}`;
  return r2PublicUrlForKey(image);
}
__name(supplierImageSourceUrl, "supplierImageSourceUrl");
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
function extensionFromUrlOrContentType(sourceUrl, contentType) {
  try {
    const pathname = new URL(sourceUrl).pathname;
    const ext = pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  } catch {
  }
  return extensionForContentType(contentType);
}
__name(extensionFromUrlOrContentType, "extensionFromUrlOrContentType");
async function mirrorSupplierSheetImage(env, sourceUrl, product) {
  if (!sourceUrl || sourceUrl.startsWith(PUBLIC_BASE) || !/^https?:\/\//i.test(sourceUrl)) return sourceUrl || "";
  if (!env.BUCKET) return "";
  const hash = (await sha256Hex(sourceUrl)).slice(0, 24);
  const productId = slugify(product?.raw?.id || product?.id || "unmatched") || "unmatched";
  const initialKey = `supplier-sheet-images/${productId}-${hash}`;
  const existing = await env.BUCKET.list({ prefix: initialKey, limit: 1 });
  const existingKey = existing.objects?.[0]?.key;
  if (existingKey) return r2PublicUrlForKey(existingKey);
  const response = await fetch(sourceUrl, {
    headers: { "User-Agent": "ESNTLS supplier sheet image sync" }
  });
  if (!response.ok) return "";
  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) return "";
  const key = `${initialKey}.${extensionFromUrlOrContentType(sourceUrl, contentType)}`;
  await env.BUCKET.put(key, await response.arrayBuffer(), {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" }
  });
  return r2PublicUrlForKey(key);
}
__name(mirrorSupplierSheetImage, "mirrorSupplierSheetImage");
async function firstSupplierSheetImageUrl(env, product, lineItem) {
  const raw = product?.raw || {};
  const candidates = [
    product?.image,
    raw.image,
    raw.imageUrl,
    raw.featuredImage,
    raw.thumbnail,
    raw.img,
    Array.isArray(raw.images) ? raw.images[0] : "",
    Array.isArray(raw.imgs) ? raw.imgs[0] : "",
    Array.isArray(raw.media) ? raw.media[0]?.url || raw.media[0] : "",
    lineItem?.image?.src,
    lineItem?.image?.url,
    lineItem?.variant?.image?.url
  ];
  for (const candidate of candidates) {
    const sourceUrl = supplierImageSourceUrl(candidate);
    if (!sourceUrl) continue;
    const image = await mirrorSupplierSheetImage(env, sourceUrl, product);
    if (image) return supplierSheetImageUrlFromSource(env, image);
  }
  return "";
}
__name(firstSupplierSheetImageUrl, "firstSupplierSheetImageUrl");
function esntlsProductPageUrl(product) {
  const id = product?.raw?.id || product?.id;
  return id ? `https://esntlsclub.com/product.html?id=${encodeURIComponent(id)}` : "";
}
__name(esntlsProductPageUrl, "esntlsProductPageUrl");
function sheetString(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").trim();
}
__name(sheetString, "sheetString");
function googleSheetFormulaString(value) {
  return String(value || "").replace(/"/g, '""');
}
__name(googleSheetFormulaString, "googleSheetFormulaString");
function googleImageFormula(imageUrl) {
  if (!imageUrl) return "";
  const escaped = googleSheetFormulaString(imageUrl);
  return `=IFERROR(IMAGE("${escaped}",4,96,96),"Image unavailable")`;
}
__name(googleImageFormula, "googleImageFormula");
function supplierOrderLogKey(order, deliveryId = "") {
  const stable = shopifyOrderId(order) || deliveryId || crypto.randomUUID();
  return `${SUPPLIER_ORDER_ROOT}${slugify(stable)}.json`;
}
__name(supplierOrderLogKey, "supplierOrderLogKey");
function supplierPortalBusinessId(value) {
  return slugify(value || "esntlsclub") || "esntlsclub";
}
__name(supplierPortalBusinessId, "supplierPortalBusinessId");
function supplierPortalOrderKey(orderName, businessId = "esntlsclub") {
  const stable = safeMessageLine(orderName) || crypto.randomUUID();
  const business = supplierPortalBusinessId(businessId);
  const keyBase = business === "esntlsclub" ? stable : `${business}-${stable}`;
  return `${SUPPLIER_PORTAL_ORDER_ROOT}${slugify(keyBase)}.json`;
}
__name(supplierPortalOrderKey, "supplierPortalOrderKey");
function supplierPortalItemKey(lineItem, product, index) {
  const stable = safeMessageLine(
    lineItem?.admin_graphql_api_id || lineItem?.id || lineItem?.variant_id || lineItem?.variantId || [product?.raw?.id || product?.id || "item", fallbackShopifyLineItemTitle(lineItem), index + 1].join("-")
  );
  return slugify(stable) || `item-${index + 1}`;
}
__name(supplierPortalItemKey, "supplierPortalItemKey");
function supplierPortalAddressLines(shipping) {
  return [
    shipping.name,
    shipping.address1,
    shipping.address2,
    shipping.city,
    shipping.province,
    shipping.postcode,
    shipping.country
  ].map(safeMessageLine).filter(Boolean);
}
__name(supplierPortalAddressLines, "supplierPortalAddressLines");
function supplierPortalOrderStatus(items) {
  const visibleItems = Array.isArray(items) ? items : [];
  if (!visibleItems.length) return "empty";
  const shipped = visibleItems.filter((item) => /^yes\b|^already\b/i.test(safeMessageLine(item.shopifyUpdated)));
  if (shipped.length === visibleItems.length) return "fulfilled";
  if (shipped.length) return "partial";
  return "open";
}
__name(supplierPortalOrderStatus, "supplierPortalOrderStatus");
function supplierPortalLineItemIds(lineItem) {
  return {
    shopifyLineItemId: safeMessageLine(lineItem?.admin_graphql_api_id || lineItem?.id),
    shopifyProductId: normalizeShopifyNumericId(lineItem?.product_id || lineItem?.productId || lineItem?.product?.id || lineItem?.variant?.product?.id),
    shopifyVariantId: normalizeShopifyNumericId(lineItem?.variant_id || lineItem?.variantId || lineItem?.variant?.id)
  };
}
__name(supplierPortalLineItemIds, "supplierPortalLineItemIds");
async function buildSupplierSheetRows(env, order) {
  const { list } = await readProductsPayload(env);
  const products = list.map((raw) => {
    const normalized = normalizeStoredProduct(raw);
    return { ...normalized, raw };
  });
  const shipping = shippingAddressFields(order);
  if (!shipping.name && !shipping.address1) throw new Error("Order is missing a shipping address");
  const orderDate = sheetString(order?.created_at || order?.createdAt || (/* @__PURE__ */ new Date()).toISOString());
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
      "",
      productTitle,
      optionParts.join(" - "),
      quantity,
      "New",
      "",
      "",
      product ? "" : "Check item match",
      "No"
    ]);
  }
  return { rows, excludedLineItems, unresolvedLineItems };
}
__name(buildSupplierSheetRows, "buildSupplierSheetRows");
async function buildSupplierPortalOrder(env, order, products = null) {
  const productList = products || (await readProductsPayload(env)).list.map((raw) => {
    const normalized = normalizeStoredProduct(raw);
    return { ...normalized, raw };
  });
  const shipping = shippingAddressFields(order);
  if (!shipping.name && !shipping.address1) throw new Error("Order is missing a shipping address");
  const orderDate = sheetString(order?.created_at || order?.createdAt || (/* @__PURE__ */ new Date()).toISOString());
  const orderName = shopifyOrderDisplayName(order);
  const items = [];
  const excludedLineItems = [];
  const unresolvedLineItems = [];
  let index = 0;
  for (const lineItem of shopifyLineItems(order)) {
    const product = resolveEsntlsProductForShopifyLineItem(lineItem, productList);
    if (isSupplierWhatsappExcludedItem(lineItem, product)) {
      excludedLineItems.push(fallbackShopifyLineItemTitle(lineItem));
      index++;
      continue;
    }
    const optionParts = lineItemOptionParts(lineItem);
    const quantity = Math.max(1, Number(lineItem?.quantity || lineItem?.current_quantity || 1));
    const productTitle = safeMessageLine(product?.title || product?.raw?.name || fallbackShopifyLineItemTitle(lineItem));
    const imageUrl = await firstSupplierSheetImageUrl(env, product, lineItem);
    if (!product) unresolvedLineItems.push(fallbackShopifyLineItemTitle(lineItem));
    items.push({
      itemKey: supplierPortalItemKey(lineItem, product, index),
      sourceProductId: safeMessageLine(product?.raw?.id || product?.id),
      productName: productTitle,
      option: optionParts.join(" - "),
      quantity,
      imageUrl,
      productPageUrl: "",
      ...supplierPortalLineItemIds(lineItem),
      supplierStatus: "New",
      trackingNumber: "",
      courier: "",
      supplierNotes: product ? "" : "Check item match",
      shopifyUpdated: "No",
      shopifyFulfillmentId: "",
      trackingUpdatedAt: ""
    });
    index++;
  }
  return {
    key: supplierPortalOrderKey(orderName, "esntlsclub"),
    businessId: "esntlsclub",
    businessName: "ESNTLS Club",
    orderId: shopifyOrderId(order),
    orderName,
    orderNumber: orderNameNumber(order),
    orderDate,
    shipping,
    addressLines: supplierPortalAddressLines(shipping),
    items,
    status: supplierPortalOrderStatus(items),
    excludedLineItems,
    unresolvedLineItems,
    sourceUpdatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(buildSupplierPortalOrder, "buildSupplierPortalOrder");
function supplierPortalMergeItem(incoming, existingItems) {
  const existing = existingItems.find((item) => item.itemKey === incoming.itemKey) || existingItems.find((item) => {
    return normalizeTitleKey(item.productName) === normalizeTitleKey(incoming.productName) && normalizeTitleKey(item.option) === normalizeTitleKey(incoming.option);
  });
  if (!existing) return incoming;
  return {
    ...incoming,
    itemKey: existing.itemKey || incoming.itemKey,
    sourceProductId: incoming.sourceProductId || existing.sourceProductId || "",
    productName: incoming.productName || existing.productName || "",
    option: incoming.option || existing.option || "",
    quantity: incoming.quantity || existing.quantity || 1,
    imageUrl: incoming.imageUrl || existing.imageUrl || "",
    productPageUrl: "",
    shopifyLineItemId: incoming.shopifyLineItemId || existing.shopifyLineItemId || "",
    shopifyProductId: incoming.shopifyProductId || existing.shopifyProductId || "",
    shopifyVariantId: incoming.shopifyVariantId || existing.shopifyVariantId || "",
    supplierStatus: existing.supplierStatus || incoming.supplierStatus,
    trackingNumber: existing.trackingNumber || incoming.trackingNumber,
    courier: existing.courier || incoming.courier,
    supplierNotes: existing.supplierNotes || incoming.supplierNotes,
    shopifyUpdated: existing.shopifyUpdated || incoming.shopifyUpdated,
    shopifyFulfillmentId: existing.shopifyFulfillmentId || incoming.shopifyFulfillmentId,
    trackingUpdatedAt: existing.trackingUpdatedAt || incoming.trackingUpdatedAt
  };
}
__name(supplierPortalMergeItem, "supplierPortalMergeItem");
function mergeSupplierPortalOrder(existing, incoming, options = {}) {
  const existingItems = Array.isArray(existing?.items) ? existing.items : [];
  const items = incoming.items.map((item) => supplierPortalMergeItem(item, existingItems));
  const mergedItems = options.preserveUnmatchedExisting ? [
    ...items,
    ...existingItems.filter((existingItem) => {
      return !items.some((item) => {
        return item.itemKey === existingItem.itemKey || normalizeTitleKey(item.productName) === normalizeTitleKey(existingItem.productName) && normalizeTitleKey(item.option) === normalizeTitleKey(existingItem.option);
      });
    })
  ] : items;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    ...incoming,
    key: existing?.key || incoming.key,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastShopifySyncAt: now,
    items: mergedItems,
    status: supplierPortalOrderStatus(mergedItems)
  };
}
__name(mergeSupplierPortalOrder, "mergeSupplierPortalOrder");
async function readSupplierPortalOrder(env, orderNameOrKey) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const value = safeMessageLine(orderNameOrKey);
  const key = value.startsWith(SUPPLIER_PORTAL_ORDER_ROOT) ? value : supplierPortalOrderKey(value);
  const object = await env.BUCKET.get(key);
  if (!object) return null;
  const order = JSON.parse(await object.text());
  return { ...order, key };
}
__name(readSupplierPortalOrder, "readSupplierPortalOrder");
async function writeSupplierPortalOrder(env, order) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const key = order.key || supplierPortalOrderKey(order.orderName, order.businessId || "esntlsclub");
  const payload = {
    ...order,
    key,
    status: supplierPortalOrderStatus(order.items),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await env.BUCKET.put(key, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: JSON_CONTENT_TYPE }
  });
  return payload;
}
__name(writeSupplierPortalOrder, "writeSupplierPortalOrder");
function supplierPortalHiddenItemKey(orderName, itemKey = "", businessId = "esntlsclub") {
  const business = supplierPortalBusinessId(businessId);
  const orderPart = slugify(business === "esntlsclub" ? orderName || "order" : `${business}-${orderName || "order"}`);
  const itemPart = slugify(itemKey || crypto.randomUUID());
  return `${SUPPLIER_PORTAL_HIDDEN_ITEM_ROOT}${orderPart}-${itemPart}.json`;
}
__name(supplierPortalHiddenItemKey, "supplierPortalHiddenItemKey");
function supplierPortalHiddenItemPrefix(orderName, businessId = "esntlsclub") {
  const business = supplierPortalBusinessId(businessId);
  const orderPart = slugify(business === "esntlsclub" ? orderName || "order" : `${business}-${orderName || "order"}`);
  return `${SUPPLIER_PORTAL_HIDDEN_ITEM_ROOT}${orderPart}-`;
}
__name(supplierPortalHiddenItemPrefix, "supplierPortalHiddenItemPrefix");
function supplierPortalHiddenItemMatches(hidden, item) {
  if (!hidden || !item) return false;
  if (safeMessageLine(hidden.itemKey) && safeMessageLine(hidden.itemKey) === safeMessageLine(item.itemKey)) return true;
  return normalizeTitleKey(hidden.productName) === normalizeTitleKey(item.productName) && normalizeTitleKey(hidden.option) === normalizeTitleKey(item.option);
}
__name(supplierPortalHiddenItemMatches, "supplierPortalHiddenItemMatches");
async function listSupplierPortalHiddenItems(env, orderNameOrOrder, businessId = "esntlsclub") {
  if (!env.BUCKET) return [];
  const orderName = typeof orderNameOrOrder === "object" ? orderNameOrOrder?.orderName : orderNameOrOrder;
  const business = typeof orderNameOrOrder === "object" ? orderNameOrOrder?.businessId || businessId : businessId;
  const prefix = supplierPortalHiddenItemPrefix(orderName, business);
  const listed = await env.BUCKET.list({ prefix, limit: 1e3 });
  const hidden = [];
  for (const object of listed.objects || []) {
    const stored = await env.BUCKET.get(object.key);
    if (!stored) continue;
    try {
      hidden.push({ ...JSON.parse(await stored.text()), key: object.key });
    } catch {
    }
  }
  return hidden;
}
__name(listSupplierPortalHiddenItems, "listSupplierPortalHiddenItems");
async function applySupplierPortalHiddenItems(env, order) {
  const hiddenItems = await listSupplierPortalHiddenItems(env, order);
  if (!hiddenItems.length) return order;
  const items = (order.items || []).filter((item) => {
    return !hiddenItems.some((hidden) => supplierPortalHiddenItemMatches(hidden, item));
  });
  return {
    ...order,
    items,
    hiddenItems: uniqueList([
      ...Array.isArray(order.hiddenItems) ? order.hiddenItems : [],
      ...hiddenItems.map((hidden) => [hidden.productName, hidden.option].filter(Boolean).join(" - "))
    ]),
    status: supplierPortalOrderStatus(items)
  };
}
__name(applySupplierPortalHiddenItems, "applySupplierPortalHiddenItems");
async function writeSupplierPortalHiddenItem(env, order, item, requestBody = {}) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const record = {
    businessId: supplierPortalBusinessId(order.businessId || "esntlsclub"),
    businessName: safeMessageLine(order.businessName || "ESNTLS Club"),
    orderName: safeMessageLine(order.orderName),
    orderKey: safeMessageLine(order.key),
    itemKey: safeMessageLine(item.itemKey),
    productName: safeMessageLine(item.productName),
    option: safeMessageLine(item.option),
    reason: safeMessageLine(requestBody.reason || "Removed from supplier portal"),
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const key = supplierPortalHiddenItemKey(record.orderName, record.itemKey || `${record.productName}-${record.option}`, record.businessId);
  await env.BUCKET.put(key, JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: JSON_CONTENT_TYPE }
  });
  return { ...record, key };
}
__name(writeSupplierPortalHiddenItem, "writeSupplierPortalHiddenItem");
async function hideSupplierPortalItem(env, requestBody = {}) {
  const orderKey = safeMessageLine(requestBody.orderKey || requestBody.key || requestBody.orderName);
  if (!orderKey) throw new Error("Missing order key");
  const order = await readSupplierPortalOrder(env, orderKey);
  if (!order) throw new Error("Supplier portal order was not found");
  const itemKey = safeMessageLine(requestBody.itemKey);
  const productName = safeMessageLine(requestBody.productName);
  const option = safeMessageLine(requestBody.option);
  const matches = (order.items || []).filter((item) => {
    if (itemKey && safeMessageLine(item.itemKey) === itemKey) return true;
    if (!productName) return false;
    return normalizeTitleKey(item.productName) === normalizeTitleKey(productName) && (!option || normalizeTitleKey(item.option) === normalizeTitleKey(option));
  });
  if (!matches.length) throw new Error("Matching portal item was not found");
  const hidden = [];
  for (const item of matches) {
    hidden.push(await writeSupplierPortalHiddenItem(env, order, item, requestBody));
  }
  const hiddenKeys = new Set(matches.map((item) => safeMessageLine(item.itemKey)));
  const remainingItems = (order.items || []).filter((item) => !hiddenKeys.has(safeMessageLine(item.itemKey)));
  if (!remainingItems.length) {
    await env.BUCKET.delete(order.key);
  } else {
    await writeSupplierPortalOrder(env, {
      ...order,
      items: remainingItems,
      hiddenItems: uniqueList([
        ...Array.isArray(order.hiddenItems) ? order.hiddenItems : [],
        ...hidden.map((item) => [item.productName, item.option].filter(Boolean).join(" - "))
      ]),
      status: supplierPortalOrderStatus(remainingItems)
    });
  }
  return {
    ok: true,
    status: "hidden",
    orderName: order.orderName,
    hiddenCount: hidden.length,
    remainingItems: remainingItems.length
  };
}
__name(hideSupplierPortalItem, "hideSupplierPortalItem");
async function upsertSupplierPortalOrder(env, order, options = {}) {
  const incoming = await applySupplierPortalHiddenItems(env, await buildSupplierPortalOrder(env, order, options.products || null));
  if (!incoming.items.length) {
    return {
      ok: true,
      status: "skipped",
      reason: "No supplier portal items after exclusions",
      orderName: incoming.orderName,
      excludedLineItems: incoming.excludedLineItems
    };
  }
  const existing = await readSupplierPortalOrder(env, incoming.key);
  const merged = mergeSupplierPortalOrder(existing, incoming);
  merged.source = options.source || merged.source || "shopify";
  const saved = await writeSupplierPortalOrder(env, merged);
  return {
    ok: true,
    status: existing ? "updated" : "created",
    orderName: saved.orderName,
    itemCount: saved.items.length,
    key: saved.key
  };
}
__name(upsertSupplierPortalOrder, "upsertSupplierPortalOrder");
async function listSupplierPortalOrders(env, limit = 100) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const safeLimit = Math.max(1, Math.min(300, Number(limit || 100)));
  const orders = [];
  let cursor = void 0;
  while (orders.length < safeLimit) {
    const listed = await env.BUCKET.list({
      prefix: SUPPLIER_PORTAL_ORDER_ROOT,
      limit: Math.min(1e3, safeLimit - orders.length),
      cursor
    });
    for (const object of listed.objects || []) {
      const stored = await env.BUCKET.get(object.key);
      if (!stored) continue;
      try {
        const order = JSON.parse(await stored.text());
        orders.push({
          ...order,
          key: object.key,
          uploaded: object.uploaded
        });
      } catch {
        orders.push({ key: object.key, status: "unreadable", items: [] });
      }
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  orders.sort((a, b) => {
    const byDate = String(b.orderDate || b.createdAt || b.uploaded || "").localeCompare(String(a.orderDate || a.createdAt || a.uploaded || ""));
    if (byDate) return byDate;
    const byNumber = Number(b.orderNumber || 0) - Number(a.orderNumber || 0);
    if (byNumber) return byNumber;
    return String(b.businessId || "").localeCompare(String(a.businessId || ""));
  });
  return orders.slice(0, safeLimit);
}
__name(listSupplierPortalOrders, "listSupplierPortalOrders");
async function buildSupplierWhatsappOrder(env, order) {
  const { list } = await readProductsPayload(env);
  const products = list.map((raw) => {
    const normalized = normalizeStoredProduct(raw);
    return { ...normalized, raw };
  });
  const address = shippingAddressLines(order);
  if (!address.length) throw new Error("Order is missing a shipping address");
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
      message: "",
      sentLineItems,
      excludedLineItems,
      skipReason: "No supplier line items after exclusions"
    };
  }
  return {
    orderName: shopifyOrderDisplayName(order),
    message: [...address, "", ...sentLineItems].join("\n"),
    sentLineItems,
    excludedLineItems,
    skipReason: ""
  };
}
__name(buildSupplierWhatsappOrder, "buildSupplierWhatsappOrder");
function normalizeWhatsappNumber(value) {
  return String(value || "").replace(/[^\d]/g, "").replace(/^00/, "");
}
__name(normalizeWhatsappNumber, "normalizeWhatsappNumber");
function whatsappRecipients(env) {
  const recipients = [
    ...splitList(env.WHATSAPP_SUPPLIER_TO),
    ...splitList(env.WHATSAPP_OWNER_TO)
  ].map(normalizeWhatsappNumber).filter(Boolean);
  return uniqueList(recipients);
}
__name(whatsappRecipients, "whatsappRecipients");
function maskWhatsappRecipient(value) {
  const number = normalizeWhatsappNumber(value);
  if (number.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, number.length - 4))}${number.slice(-4)}`;
}
__name(maskWhatsappRecipient, "maskWhatsappRecipient");
async function hmacSha256Base64(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return bytesToBase64(new Uint8Array(signature));
}
__name(hmacSha256Base64, "hmacSha256Base64");
function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
__name(bytesToBase64, "bytesToBase64");
function base64ToBytes(value) {
  try {
    const binary = atob(String(value || "").trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array();
  }
}
__name(base64ToBytes, "base64ToBytes");
function base64UrlEncodeBytes(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64UrlEncodeBytes, "base64UrlEncodeBytes");
function base64UrlEncodeJson(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}
__name(base64UrlEncodeJson, "base64UrlEncodeJson");
function pemToArrayBuffer(pem) {
  const normalized = String(pem || "").replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const bytes = base64ToBytes(normalized);
  if (!bytes.length) throw new Error("GOOGLE_PRIVATE_KEY is not a valid private key");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
__name(pemToArrayBuffer, "pemToArrayBuffer");
async function signGoogleJwt(unsignedJwt, privateKeyPem) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt)
  );
  return base64UrlEncodeBytes(new Uint8Array(signature));
}
__name(signGoogleJwt, "signGoogleJwt");
async function getGoogleSheetsAccessToken(env) {
  const email = safeMessageLine(env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = String(env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!email) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL env var not set");
  if (!privateKey) throw new Error("GOOGLE_PRIVATE_KEY env var not set");
  const now = Math.floor(Date.now() / 1e3);
  const cacheKey = `${email}:${privateKey.slice(-48)}`;
  if (googleSheetsTokenCache.cacheKey === cacheKey && googleSheetsTokenCache.accessToken && googleSheetsTokenCache.expiresAt > now + 60) {
    return googleSheetsTokenCache.accessToken;
  }
  const unsignedJwt = [
    base64UrlEncodeJson({ alg: "RS256", typ: "JWT" }),
    base64UrlEncodeJson({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    })
  ].join(".");
  const assertion = `${unsignedJwt}.${await signGoogleJwt(unsignedJwt, privateKey)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
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
__name(getGoogleSheetsAccessToken, "getGoogleSheetsAccessToken");
function googleSheetsTabName(env) {
  return sheetString(env.SUPPLIER_SHEET_TAB || "Orders") || "Orders";
}
__name(googleSheetsTabName, "googleSheetsTabName");
function googleSheetsA1SheetName(tabName) {
  const name = googleSheetFormulaString(tabName);
  return /^[A-Za-z0-9_]+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}
__name(googleSheetsA1SheetName, "googleSheetsA1SheetName");
function supplierSheetConfigured(env) {
  return Boolean(env.GOOGLE_SUPPLIER_SHEET_ID && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY);
}
__name(supplierSheetConfigured, "supplierSheetConfigured");
function supplierWhatsappEnabled(env) {
  return /^true$/i.test(String(env.SUPPLIER_WHATSAPP_ENABLED || "").trim());
}
__name(supplierWhatsappEnabled, "supplierWhatsappEnabled");
async function appendRowsToSupplierGoogleSheet(env, rows) {
  if (!rows.length) return { status: "skipped", reason: "No supplier rows to append" };
  const sheetId = safeMessageLine(env.GOOGLE_SUPPLIER_SHEET_ID);
  if (!sheetId) throw new Error("GOOGLE_SUPPLIER_SHEET_ID env var not set");
  const accessToken = await getGoogleSheetsAccessToken(env);
  const range = `${googleSheetsA1SheetName(googleSheetsTabName(env))}!A:R`;
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      majorDimension: "ROWS",
      values: rows
    })
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.error) {
    throw new Error(`Google Sheets append failed: ${JSON.stringify(data.error || data)}`);
  }
  return {
    status: "appended",
    spreadsheetId: sheetId,
    tab: googleSheetsTabName(env),
    rowCount: rows.length,
    updatedRange: data.updates?.updatedRange || ""
  };
}
__name(appendRowsToSupplierGoogleSheet, "appendRowsToSupplierGoogleSheet");
async function getSupplierGoogleSheetValues(env, range, options = {}) {
  const sheetId = safeMessageLine(env.GOOGLE_SUPPLIER_SHEET_ID);
  if (!sheetId) throw new Error("GOOGLE_SUPPLIER_SHEET_ID env var not set");
  const params = new URLSearchParams();
  if (options.valueRenderOption) params.set("valueRenderOption", options.valueRenderOption);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}${suffix}`;
  const response = await fetch(endpoint, {
    headers: { "Authorization": `Bearer ${await getGoogleSheetsAccessToken(env)}` }
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.error) {
    throw new Error(`Google Sheets read failed: ${JSON.stringify(data.error || data)}`);
  }
  return data;
}
__name(getSupplierGoogleSheetValues, "getSupplierGoogleSheetValues");
async function batchUpdateSupplierGoogleSheetValues(env, updates, valueInputOption = "USER_ENTERED") {
  if (!updates.length) return { status: "skipped", rowCount: 0 };
  const sheetId = safeMessageLine(env.GOOGLE_SUPPLIER_SHEET_ID);
  if (!sheetId) throw new Error("GOOGLE_SUPPLIER_SHEET_ID env var not set");
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchUpdate`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${await getGoogleSheetsAccessToken(env)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      valueInputOption,
      data: updates
    })
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.error) {
    throw new Error(`Google Sheets update failed: ${JSON.stringify(data.error || data)}`);
  }
  return {
    status: "updated",
    rowCount: updates.length,
    totalUpdatedCells: data.totalUpdatedCells || 0
  };
}
__name(batchUpdateSupplierGoogleSheetValues, "batchUpdateSupplierGoogleSheetValues");
function supplierTrackingSyncEnabled(env) {
  return !/^false$/i.test(String(env.SUPPLIER_TRACKING_SYNC_ENABLED || "true").trim());
}
__name(supplierTrackingSyncEnabled, "supplierTrackingSyncEnabled");
function supplierTrackingCell(row, index) {
  return sheetString(Array.isArray(row) ? row[index] : "");
}
__name(supplierTrackingCell, "supplierTrackingCell");
function supplierTrackingStatusAllowsUpdate(value) {
  const text = safeMessageLine(value).toLowerCase();
  return !text || text === "no" || text === "pending" || text === "ready" || text === "retry";
}
__name(supplierTrackingStatusAllowsUpdate, "supplierTrackingStatusAllowsUpdate");
function splitTrackingNumbers(value) {
  return uniqueList(String(value || "").split(/[\r\n,;]+/).map(safeMessageLine).filter(Boolean));
}
__name(splitTrackingNumbers, "splitTrackingNumbers");
function normalizeTrackingCompany(value) {
  const text = safeMessageLine(value);
  const key = normalizeTitleKey(text);
  const known = {
    "china post": "China Post",
    "dhl": "DHL",
    "dpd": "DPD",
    "evri": "Evri",
    "fedex": "FedEx",
    "hermes": "Evri",
    "parcelforce": "Parcelforce",
    "royal mail": "Royal Mail",
    "ups": "UPS",
    "usps": "USPS",
    "yodel": "Yodel"
  };
  return known[key] || text;
}
__name(normalizeTrackingCompany, "normalizeTrackingCompany");
function supplierTrackingRowsFromValues(values) {
  const rows = [];
  for (let index = 1; index < (values || []).length; index++) {
    const row = values[index] || [];
    const orderName = supplierTrackingCell(row, SUPPLIER_SHEET_COLS.ORDER_NAME);
    const trackingNumbers = splitTrackingNumbers(supplierTrackingCell(row, SUPPLIER_SHEET_COLS.TRACKING_NUMBER));
    const shopifyUpdated = supplierTrackingCell(row, SUPPLIER_SHEET_COLS.SHOPIFY_UPDATED);
    if (!orderName || !trackingNumbers.length || !supplierTrackingStatusAllowsUpdate(shopifyUpdated)) continue;
    rows.push({
      rowNumber: index + 1,
      orderName,
      productName: supplierTrackingCell(row, SUPPLIER_SHEET_COLS.PRODUCT_NAME),
      option: supplierTrackingCell(row, SUPPLIER_SHEET_COLS.OPTION),
      quantity: Math.max(1, Number(supplierTrackingCell(row, SUPPLIER_SHEET_COLS.QUANTITY) || 1)),
      supplierStatus: supplierTrackingCell(row, SUPPLIER_SHEET_COLS.SUPPLIER_STATUS),
      trackingNumbers,
      courier: normalizeTrackingCompany(supplierTrackingCell(row, SUPPLIER_SHEET_COLS.COURIER))
    });
  }
  return rows;
}
__name(supplierTrackingRowsFromValues, "supplierTrackingRowsFromValues");
function supplierSheetImageUrlFromCell(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const imageFormula = text.match(/IMAGE\s*\(\s*"((?:[^"]|"")*)"/i);
  const quotedUrl = text.match(/"(https?:\/\/(?:[^"]|"")+)"/i);
  const bareUrl = text.match(/https?:\/\/[^\s")]+/i);
  const raw = imageFormula?.[1] || quotedUrl?.[1] || bareUrl?.[0] || "";
  const url = safeMessageLine(raw.replace(/""/g, '"'));
  return /^https?:\/\//i.test(url) ? url : "";
}
__name(supplierSheetImageUrlFromCell, "supplierSheetImageUrlFromCell");
async function supplierPortalSheetImageUrl(env, row) {
  const sourceUrl = supplierSheetImageUrlFromCell(row.raw[SUPPLIER_SHEET_COLS.PRODUCT_IMAGE]) || supplierSheetImageUrlFromCell(row.raw[SUPPLIER_SHEET_COLS.PRODUCT_IMAGE_URL]);
  if (!sourceUrl) return "";
  const key = r2KeyFromImageUrl(sourceUrl);
  if (key) return supplierSheetImageUrlForR2Key(env, key);
  const source = supplierImageSourceUrl(sourceUrl);
  if (!source) return "";
  const mirrored = await mirrorSupplierSheetImage(env, source, {
    id: `sheet-${row.rowNumber}`,
    raw: { id: `sheet-${row.rowNumber}` }
  }).catch(() => "");
  return supplierSheetImageUrlFromSource(env, mirrored || source);
}
__name(supplierPortalSheetImageUrl, "supplierPortalSheetImageUrl");
async function supplierPortalSheetRowsFromValues(env, values) {
  const rows = [];
  for (let index = 1; index < (values || []).length; index++) {
    const raw = values[index] || [];
    const orderName = supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.ORDER_NAME);
    const productName = supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.PRODUCT_NAME);
    if (!orderName || !productName) continue;
    const row = {
      raw,
      rowNumber: index + 1,
      orderDate: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.ORDER_DATE),
      orderName,
      customerName: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.CUSTOMER_NAME),
      address1: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.ADDRESS_1),
      address2: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.ADDRESS_2),
      city: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.CITY),
      postcode: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.POSTCODE),
      country: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.COUNTRY),
      productName,
      option: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.OPTION),
      quantity: Math.max(1, Number(supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.QUANTITY) || 1)),
      supplierStatus: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.SUPPLIER_STATUS) || "New",
      trackingNumber: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.TRACKING_NUMBER),
      courier: normalizeTrackingCompany(supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.COURIER)),
      supplierNotes: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.SUPPLIER_NOTES),
      shopifyUpdated: supplierTrackingCell(raw, SUPPLIER_SHEET_COLS.SHOPIFY_UPDATED) || "No",
      imageUrl: ""
    };
    row.imageUrl = await supplierPortalSheetImageUrl(env, row);
    rows.push(row);
  }
  return rows;
}
__name(supplierPortalSheetRowsFromValues, "supplierPortalSheetRowsFromValues");
function groupSupplierPortalSheetRows(rows) {
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = normalizeTitleKey(row.orderName);
    if (!grouped.has(key)) grouped.set(key, { orderName: row.orderName, rows: [] });
    grouped.get(key).rows.push(row);
  }
  return [...grouped.values()];
}
__name(groupSupplierPortalSheetRows, "groupSupplierPortalSheetRows");
function supplierPortalOrderFromSheetGroup(group) {
  const first = group.rows[0] || {};
  const shipping = {
    name: first.customerName || "",
    address1: first.address1 || "",
    address2: first.address2 || "",
    city: first.city || "",
    province: "",
    postcode: first.postcode || "",
    country: first.country || ""
  };
  const items = group.rows.map((row) => ({
    itemKey: `sheet-row-${row.rowNumber}`,
    sourceProductId: "",
    productName: row.productName,
    option: row.option,
    quantity: row.quantity,
    imageUrl: row.imageUrl,
    productPageUrl: "",
    shopifyLineItemId: "",
    shopifyProductId: "",
    shopifyVariantId: "",
    supplierStatus: row.supplierStatus || "New",
    trackingNumber: row.trackingNumber || "",
    courier: row.courier || "",
    supplierNotes: row.supplierNotes || "",
    shopifyUpdated: row.shopifyUpdated || "No",
    shopifyFulfillmentId: "",
    trackingUpdatedAt: row.trackingNumber ? (/* @__PURE__ */ new Date()).toISOString() : ""
  }));
  return {
    key: supplierPortalOrderKey(group.orderName),
    orderId: group.orderName,
    orderName: group.orderName,
    orderNumber: orderNameNumber({ name: group.orderName }),
    orderDate: first.orderDate || "",
    shipping,
    addressLines: supplierPortalAddressLines(shipping),
    items,
    status: supplierPortalOrderStatus(items),
    excludedLineItems: [],
    unresolvedLineItems: [],
    source: "google-sheet-import",
    sourceUpdatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(supplierPortalOrderFromSheetGroup, "supplierPortalOrderFromSheetGroup");
function groupSupplierTrackingRows(rows) {
  const grouped = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = row.orderName.toLowerCase();
    if (!grouped.has(key)) grouped.set(key, { orderName: row.orderName, rows: [] });
    grouped.get(key).rows.push(row);
  }
  return [...grouped.values()];
}
__name(groupSupplierTrackingRows, "groupSupplierTrackingRows");
function shopifyOrderSearchQuery(orderName) {
  const clean = safeMessageLine(orderName);
  const numeric = clean.match(/\d+/)?.[0];
  return numeric ? `name:${numeric}` : clean.replace(/["\\]/g, " ");
}
__name(shopifyOrderSearchQuery, "shopifyOrderSearchQuery");
function supplierTrackingTimestamp() {
  return `${(/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
__name(supplierTrackingTimestamp, "supplierTrackingTimestamp");
function supplierTrackingStatusUpdate(env, rowNumber, value) {
  const tab = googleSheetsA1SheetName(googleSheetsTabName(env));
  return {
    range: `${tab}!R${rowNumber}`,
    majorDimension: "ROWS",
    values: [[sheetString(value).slice(0, 240)]]
  };
}
__name(supplierTrackingStatusUpdate, "supplierTrackingStatusUpdate");
function trackingInfoForSupplierRows(rows) {
  const numbers = uniqueList(rows.flatMap((row) => row.trackingNumbers || []));
  if (!numbers.length) throw new Error("Tracking number is missing");
  const couriers = uniqueList(rows.map((row) => row.courier).filter(Boolean));
  const trackingInfo = numbers.length === 1 ? { number: numbers[0] } : { numbers };
  if (couriers.length === 1) trackingInfo.company = couriers[0];
  return trackingInfo;
}
__name(trackingInfoForSupplierRows, "trackingInfoForSupplierRows");
function supplierTrackingOptionParts(value) {
  return uniqueList(String(value || "").split(/\s+-\s+|\/|,|[\r\n]+/).map(normalizeSupplierOption).filter(Boolean));
}
__name(supplierTrackingOptionParts, "supplierTrackingOptionParts");
function fulfillmentTrackingLineItem(line) {
  const lineItem = line?.lineItem || {};
  const productTitle = safeMessageLine(line?.productTitle);
  const variantTitle = safeMessageLine(line?.variantTitle || lineItem.variantTitle || lineItem.variant_title);
  return {
    ...lineItem,
    sku: lineItem.sku || line?.sku || "",
    title: lineItem.title || productTitle,
    name: lineItem.name || [productTitle, variantTitle].filter(Boolean).join(" - "),
    variantTitle,
    variant_title: variantTitle,
    quantity: lineItem.quantity || line?.totalQuantity || 1,
    currentQuantity: lineItem.currentQuantity || line?.remainingQuantity || 1,
    current_quantity: lineItem.currentQuantity || line?.remainingQuantity || 1
  };
}
__name(fulfillmentTrackingLineItem, "fulfillmentTrackingLineItem");
function supplierTrackingLineTitleKeys(lineItem, product, fulfillmentLine) {
  return uniqueList([
    product?.title,
    product?.raw?.name,
    product?.raw?.title,
    fallbackShopifyLineItemTitle(lineItem),
    lineItem?.title,
    lineItem?.name,
    fulfillmentLine?.productTitle
  ].map(normalizeTitleKey).filter(Boolean));
}
__name(supplierTrackingLineTitleKeys, "supplierTrackingLineTitleKeys");
function supplierTrackingTitleMatchesRow(row, lineItem, product, fulfillmentLine) {
  const target = normalizeTitleKey(row.productName);
  if (!target) return false;
  return supplierTrackingLineTitleKeys(lineItem, product, fulfillmentLine).some((key) => {
    if (!key) return false;
    return key === target || key.includes(target) || target.includes(key);
  });
}
__name(supplierTrackingTitleMatchesRow, "supplierTrackingTitleMatchesRow");
function supplierTrackingOptionMatchesRow(row, lineItem) {
  const targets = supplierTrackingOptionParts(row.option).map(normalizeTitleKey).filter(Boolean);
  if (!targets.length) return true;
  const candidates = uniqueList([
    ...lineItemOptionParts(lineItem),
    lineItem?.variantTitle,
    lineItem?.variant_title
  ].map(normalizeSupplierOption).filter(Boolean)).map(normalizeTitleKey).filter(Boolean);
  if (!candidates.length) return true;
  return targets.every((target) => candidates.some((candidate) => {
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  }));
}
__name(supplierTrackingOptionMatchesRow, "supplierTrackingOptionMatchesRow");
function supplierTrackingLineMatchesRows(lineItem, product, fulfillmentLine, rows) {
  return rows.filter((row) => {
    return supplierTrackingTitleMatchesRow(row, lineItem, product, fulfillmentLine) && supplierTrackingOptionMatchesRow(row, lineItem);
  });
}
__name(supplierTrackingLineMatchesRows, "supplierTrackingLineMatchesRows");
function fulfillmentOrderCanBeFulfilled(fulfillmentOrder) {
  const status = safeMessageLine(fulfillmentOrder?.status).toUpperCase();
  if (!status) return true;
  return !["CANCELLED", "CLOSED", "INCOMPLETE", "ON_HOLD"].includes(status);
}
__name(fulfillmentOrderCanBeFulfilled, "fulfillmentOrderCanBeFulfilled");
function buildSupplierTrackingFulfillmentInput(order, rows, products) {
  const lineCandidates = [];
  const selected = [];
  const selectedIds = /* @__PURE__ */ new Set();
  for (const fulfillmentOrder of order?.fulfillmentOrders?.nodes || []) {
    if (!fulfillmentOrderCanBeFulfilled(fulfillmentOrder)) continue;
    for (const fulfillmentLine of fulfillmentOrder?.lineItems?.nodes || []) {
      const remainingQuantity = Number(fulfillmentLine?.remainingQuantity || 0);
      if (!remainingQuantity || fulfillmentLine?.requiresShipping === false) continue;
      const lineItem = fulfillmentTrackingLineItem(fulfillmentLine);
      const product = resolveEsntlsProductForShopifyLineItem(lineItem, products);
      if (isSupplierWhatsappExcludedItem(lineItem, product)) continue;
      const matchingRows = supplierTrackingLineMatchesRows(lineItem, product, fulfillmentLine, rows);
      const candidate = {
        fulfillmentOrderId: fulfillmentOrder.id,
        lineItemId: fulfillmentLine.id,
        quantity: Math.max(1, remainingQuantity),
        matchingRows
      };
      lineCandidates.push(candidate);
      if (matchingRows.length && !selectedIds.has(candidate.lineItemId)) {
        selectedIds.add(candidate.lineItemId);
        selected.push(candidate);
      }
    }
  }
  if (!selected.length && lineCandidates.length === 1 && rows.length === 1) {
    selected.push(lineCandidates[0]);
    selectedIds.add(lineCandidates[0].lineItemId);
  }
  const byFulfillmentOrder = /* @__PURE__ */ new Map();
  for (const item of selected) {
    if (!byFulfillmentOrder.has(item.fulfillmentOrderId)) byFulfillmentOrder.set(item.fulfillmentOrderId, []);
    byFulfillmentOrder.get(item.fulfillmentOrderId).push({
      id: item.lineItemId,
      quantity: item.quantity
    });
  }
  return {
    lineItemsByFulfillmentOrder: [...byFulfillmentOrder.entries()].map(([fulfillmentOrderId, fulfillmentOrderLineItems]) => ({
      fulfillmentOrderId,
      fulfillmentOrderLineItems
    })),
    matchedLineItems: selected.length,
    candidateLineItems: lineCandidates.length
  };
}
__name(buildSupplierTrackingFulfillmentInput, "buildSupplierTrackingFulfillmentInput");
async function acquireSupplierTrackingSyncLock(env, source = "manual") {
  if (!env.BUCKET) return { ok: true, runId: crypto.randomUUID(), release: /* @__PURE__ */ __name(async () => {
  }, "release") };
  const now = Date.now();
  const existing = await env.BUCKET.get(SUPPLIER_TRACKING_LOCK_KEY);
  if (existing) {
    try {
      const lock = JSON.parse(await existing.text());
      if (lock.startedAt && now - Number(lock.startedAt) < 90 * 1e3) {
        return { ok: false, reason: "Tracking sync is already running", lock };
      }
    } catch {
    }
  }
  const runId = crypto.randomUUID();
  await env.BUCKET.put(SUPPLIER_TRACKING_LOCK_KEY, JSON.stringify({
    runId,
    source,
    startedAt: now,
    startedAtIso: new Date(now).toISOString()
  }, null, 2), { httpMetadata: { contentType: JSON_CONTENT_TYPE } });
  return {
    ok: true,
    runId,
    release: /* @__PURE__ */ __name(async () => {
      try {
        const current = await env.BUCKET.get(SUPPLIER_TRACKING_LOCK_KEY);
        if (!current) return;
        const lock = JSON.parse(await current.text());
        if (lock.runId === runId) await env.BUCKET.delete(SUPPLIER_TRACKING_LOCK_KEY);
      } catch {
      }
    }, "release")
  };
}
__name(acquireSupplierTrackingSyncLock, "acquireSupplierTrackingSyncLock");
async function writeSupplierTrackingSyncLog(env, record) {
  if (!env.BUCKET) return;
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const key = `${SUPPLIER_TRACKING_SYNC_ROOT}${stamp}-${crypto.randomUUID()}.json`;
  try {
    await env.BUCKET.put(key, JSON.stringify(record, null, 2), {
      httpMetadata: { contentType: JSON_CONTENT_TYPE }
    });
  } catch (error) {
    console.error("supplier_tracking_log_failed", error);
  }
}
__name(writeSupplierTrackingSyncLog, "writeSupplierTrackingSyncLog");
async function runSupplierTrackingSync(env, requestBody = {}) {
  if (!supplierSheetConfigured(env)) {
    return {
      ok: false,
      status: "not_configured",
      reason: "Set GOOGLE_SUPPLIER_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY"
    };
  }
  const dryRun = requestBody.dryRun !== false;
  const source = safeMessageLine(requestBody.source || "admin");
  const scanLimit = clampInteger(requestBody.scanLimit || env.SUPPLIER_TRACKING_SCAN_LIMIT, 500, 10, 2e3);
  const orderLimit = clampInteger(requestBody.limit || env.SUPPLIER_TRACKING_SYNC_LIMIT, 10, 1, 50);
  const tab = googleSheetsA1SheetName(googleSheetsTabName(env));
  const range = `${tab}!A1:R${scanLimit + 1}`;
  const sheet = await getSupplierGoogleSheetValues(env, range, { valueRenderOption: "FORMATTED_VALUE" });
  const candidateRows = supplierTrackingRowsFromValues(sheet.values || []);
  const groups = groupSupplierTrackingRows(candidateRows).slice(0, orderLimit);
  const productsPayload = await readProductsPayload(env).catch(() => ({ list: [] }));
  const products = (productsPayload.list || []).map((raw) => {
    const normalized = normalizeStoredProduct(raw);
    return { ...normalized, raw };
  });
  const results = [];
  const sheetUpdates = [];
  for (const group of groups) {
    let rowStatus = "";
    try {
      const orderData = await shopifyGraphql(env, SUPPLIER_TRACKING_ORDER_QUERY, {
        query: shopifyOrderSearchQuery(group.orderName)
      });
      const order = orderData?.orders?.nodes?.[0];
      if (!order) throw new Error(`Shopify order ${group.orderName} was not found`);
      const trackingInfo = trackingInfoForSupplierRows(group.rows);
      const fulfillmentLines = buildSupplierTrackingFulfillmentInput(order, group.rows, products);
      if (!fulfillmentLines.lineItemsByFulfillmentOrder.length) {
        rowStatus = `Already fulfilled or no matching lines - ${supplierTrackingTimestamp()}`;
        results.push({
          orderName: group.orderName,
          status: "skipped",
          reason: "Already fulfilled or no matching fulfillment lines",
          rows: group.rows.map((row) => row.rowNumber),
          candidateLineItems: fulfillmentLines.candidateLineItems
        });
      } else if (dryRun) {
        rowStatus = `Dry run - ready to update ${supplierTrackingTimestamp()}`;
        results.push({
          orderName: group.orderName,
          status: "dry-run",
          rows: group.rows.map((row) => row.rowNumber),
          trackingNumbers: trackingInfo.numbers || [trackingInfo.number],
          courier: trackingInfo.company || "",
          matchedLineItems: fulfillmentLines.matchedLineItems
        });
      } else {
        const fulfillment = {
          trackingInfo,
          notifyCustomer: /^true$/i.test(String(env.SUPPLIER_TRACKING_NOTIFY_CUSTOMER || "").trim()),
          lineItemsByFulfillmentOrder: fulfillmentLines.lineItemsByFulfillmentOrder
        };
        const data = await shopifyGraphql(env, SUPPLIER_TRACKING_FULFILLMENT_MUTATION, { fulfillment });
        const userErrors = data?.fulfillmentCreate?.userErrors || [];
        if (userErrors.length) {
          throw new Error(userErrors.map((error) => error.message).join("; "));
        }
        rowStatus = `Yes - ${supplierTrackingTimestamp()}`;
        results.push({
          orderName: group.orderName,
          status: "fulfilled",
          rows: group.rows.map((row) => row.rowNumber),
          trackingNumbers: trackingInfo.numbers || [trackingInfo.number],
          courier: trackingInfo.company || "",
          fulfillmentId: data?.fulfillmentCreate?.fulfillment?.id || "",
          matchedLineItems: fulfillmentLines.matchedLineItems
        });
      }
    } catch (error) {
      rowStatus = `Failed: ${safeMessageLine(error.message).slice(0, 180)}`;
      results.push({
        orderName: group.orderName,
        status: "failed",
        rows: group.rows.map((row) => row.rowNumber),
        error: error.message
      });
    }
    if (!dryRun && rowStatus) {
      for (const row of group.rows) {
        sheetUpdates.push(supplierTrackingStatusUpdate(env, row.rowNumber, rowStatus));
      }
    }
  }
  const sheetUpdate = !dryRun ? await batchUpdateSupplierGoogleSheetValues(env, sheetUpdates) : { status: "dry-run", rowCount: 0 };
  const summary = {
    ok: true,
    status: dryRun ? "dry-run" : "complete",
    dryRun,
    source,
    scannedRows: Math.max(0, (sheet.values || []).length - 1),
    candidateRows: candidateRows.length,
    candidateOrders: groupSupplierTrackingRows(candidateRows).length,
    processedOrders: groups.length,
    fulfilledOrders: results.filter((result) => result.status === "fulfilled").length,
    failedOrders: results.filter((result) => result.status === "failed").length,
    skippedOrders: results.filter((result) => result.status === "skipped").length,
    sheetUpdate,
    results
  };
  await writeSupplierTrackingSyncLog(env, {
    ...summary,
    results: results.map((result) => ({
      orderName: result.orderName,
      status: result.status,
      rows: result.rows,
      error: result.error || "",
      reason: result.reason || ""
    })),
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  return summary;
}
__name(runSupplierTrackingSync, "runSupplierTrackingSync");
async function syncSupplierTrackingFromSheet(env, requestBody = {}) {
  const dryRun = requestBody.dryRun !== false;
  let lock = null;
  if (!dryRun) {
    lock = await acquireSupplierTrackingSyncLock(env, requestBody.source || "admin");
    if (!lock.ok) {
      return { ok: true, status: "skipped", reason: lock.reason || "Tracking sync is already running" };
    }
  }
  try {
    return await runSupplierTrackingSync(env, requestBody);
  } finally {
    if (lock?.release) await lock.release();
  }
}
__name(syncSupplierTrackingFromSheet, "syncSupplierTrackingFromSheet");
async function checkShopifyWebhookStatus(env, expectedUri) {
  const data = await shopifyGraphql(env, SHOPIFY_WEBHOOK_STATUS_QUERY, { topics: ["ORDERS_CREATE"] });
  const webhooks = data?.webhookSubscriptions?.nodes || [];
  const expected = safeMessageLine(expectedUri);
  return {
    ok: true,
    shop: data?.shop || null,
    expectedUri: expected,
    installed: expected ? webhooks.some((webhook) => safeMessageLine(webhook.uri) === expected) : webhooks.length > 0,
    webhookCount: webhooks.length,
    webhooks
  };
}
__name(checkShopifyWebhookStatus, "checkShopifyWebhookStatus");
function secureStringEqual(a, b) {
  return constantTimeEqualBytes(
    new TextEncoder().encode(String(a || "")),
    new TextEncoder().encode(String(b || ""))
  );
}
__name(secureStringEqual, "secureStringEqual");
function supplierPortalToken(env) {
  return safeMessageLine(env.SUPPLIER_PORTAL_TOKEN);
}
__name(supplierPortalToken, "supplierPortalToken");
function supplierPortalAuthorized(req, url, env) {
  const expected = supplierPortalToken(env);
  if (!expected) return { ok: false, status: 500, error: "SUPPLIER_PORTAL_TOKEN is not configured" };
  const adminSecret = safeMessageLine(env.ADMIN_SECRET);
  const suppliedAdmin = safeMessageLine(req.headers.get("X-Admin-Secret"));
  if (adminSecret && suppliedAdmin && secureStringEqual(suppliedAdmin, adminSecret)) return { ok: true };
  const supplied = safeMessageLine(
    req.headers.get("X-Supplier-Portal-Token") || url.searchParams.get("token") || url.searchParams.get("t")
  );
  if (!supplied || !secureStringEqual(supplied, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
__name(supplierPortalAuthorized, "supplierPortalAuthorized");
function supplierPortalHtmlResponse() {
  return new Response(SUPPLIER_PORTAL_HTML, {
    headers: {
      ...cors,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
__name(supplierPortalHtmlResponse, "supplierPortalHtmlResponse");
function supplierPortalPublicItem(item) {
  const productName = safeMessageLine(item?.productName);
  const imageUrl = /gel runners.*metropolis grey|metropolis grey.*gel runners/i.test(productName) ? SUPPLIER_PORTAL_METROPOLIS_IMAGE_URL : safeMessageLine(item?.imageUrl);
  return {
    ...item,
    imageUrl,
    productPageUrl: ""
  };
}
__name(supplierPortalPublicItem, "supplierPortalPublicItem");
function supplierPortalPublicOrder(order) {
  return {
    ...order,
    items: (Array.isArray(order?.items) ? order.items : []).map(supplierPortalPublicItem)
  };
}
__name(supplierPortalPublicOrder, "supplierPortalPublicOrder");
async function handleSupplierPortalApi(req, env, ctx, parts, url) {
  const authorized = supplierPortalAuthorized(req, url, env);
  if (!authorized.ok) return json({ error: authorized.error }, authorized.status);
  const action = parts[1] || "orders";
  if (req.method === "GET" && action === "orders") {
    if (url.searchParams.get("sync") === "1") {
      await syncAllSupplierOrdersToPortal(env, { source: "portal-refresh" });
    }
    const limit = clampInteger(url.searchParams.get("limit"), 100, 1, 300);
    const status = safeMessageLine(url.searchParams.get("status")).toLowerCase();
    const query = normalizeTitleKey(url.searchParams.get("q"));
    let orders = await listSupplierPortalOrders(env, limit);
    if (status && status !== "all") {
      orders = orders.filter((order) => safeMessageLine(order.status).toLowerCase() === status);
    }
    if (query) {
      orders = orders.filter((order) => normalizeTitleKey([
        order.orderName,
        ...order.addressLines || [],
        ...(order.items || []).flatMap((item) => [item.productName, item.option, item.trackingNumber])
      ].join(" ")).includes(query));
    }
    orders = orders.map(supplierPortalPublicOrder);
    return json({ ok: true, count: orders.length, orders, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
  if (req.method === "POST" && action === "sync") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }
    return json(await syncAllSupplierOrdersToPortal(env, { ...body, source: "portal-manual-sync" }));
  }
  if (req.method === "POST" && action === "tracking") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: "Invalid JSON body" }, 400);
    }
    try {
      return json(await updateSupplierPortalTracking(env, body));
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  }
  return json({ error: "Not found" }, 404);
}
__name(handleSupplierPortalApi, "handleSupplierPortalApi");
var _a;
var SUPPLIER_PORTAL_HTML = String.raw(_a || (_a = __template([`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>ESNTLS Supplier Portal</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f2eb;
      --ink: #171714;
      --muted: #6d695f;
      --line: #ddd6c8;
      --card: #fffdf8;
      --green: #47a447;
      --dark: #11110f;
      --warn: #9a5b00;
      --bad: #a32121;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Arial, Helvetica, sans-serif;
      letter-spacing: 0;
    }
    button, input, select, textarea { font: inherit; }
    button {
      border: 0;
      border-radius: 999px;
      background: var(--dark);
      color: #fff;
      min-height: 44px;
      padding: 0 18px;
      font-weight: 800;
      cursor: pointer;
    }
    button.secondary { background: transparent; color: var(--ink); border: 1px solid var(--line); }
    button:disabled { opacity: .55; cursor: wait; }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      border-radius: 14px;
      min-height: 44px;
      padding: 10px 12px;
      outline: none;
    }
    textarea { min-height: 74px; resize: vertical; }
    .shell { max-width: 1120px; margin: 0 auto; padding: 18px; }
    .top {
      position: sticky;
      top: 0;
      z-index: 5;
      background: rgba(245,242,235,.94);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--line);
    }
    .top-inner {
      max-width: 1120px;
      margin: 0 auto;
      padding: 14px 18px;
      display: grid;
      gap: 12px;
      grid-template-columns: 1fr auto auto auto;
      align-items: center;
    }
    h1 { margin: 0; font-size: 22px; line-height: 1.05; }
    .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
    .lang-btn { min-width: 98px; }
    .filters { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; margin: 18px 0; }
    .status-tabs {
      display: grid;
      grid-template-columns: repeat(2, minmax(130px, 1fr));
      gap: 8px;
    }
    .status-tab {
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      border-radius: 999px;
      min-height: 44px;
      padding: 0 16px;
      font-weight: 900;
      box-shadow: none;
    }
    .status-tab.active {
      background: var(--dark);
      border-color: var(--dark);
      color: #fff;
      box-shadow: 0 10px 24px rgba(20,18,12,.12);
    }
    .status-tab[data-status="fulfilled"].active {
      background: #145f22;
      border-color: #145f22;
    }
    .login {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .login-card {
      width: min(420px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 22px;
      box-shadow: 0 16px 50px rgba(20,18,12,.08);
    }
    .login-card h1 { margin-bottom: 8px; }
    .login-card form { display: grid; gap: 12px; margin-top: 18px; }
    .orders { display: grid; gap: 22px; }
    .order-section { display: grid; gap: 12px; }
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 2px;
    }
    .section-title {
      margin: 0;
      font-size: 18px;
      line-height: 1.1;
      font-weight: 900;
    }
    .section-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 30px;
      border-radius: 999px;
      padding: 5px 11px;
      background: #ede7da;
      color: var(--ink);
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }
    .section-orders { display: grid; gap: 14px; }
    .order {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 22px;
      overflow: hidden;
      box-shadow: 0 10px 34px rgba(20,18,12,.06);
    }
    .order-head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 16px;
      border-bottom: 1px solid var(--line);
    }
    .order-title { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 18px; font-weight: 900; }
    .business-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 5px 9px;
      background: #171714;
      color: #fff;
      font-size: 11px;
      line-height: 1;
      text-transform: uppercase;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 7px 11px;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      background: #ede7da;
      color: var(--ink);
      white-space: nowrap;
    }
    .badge.fulfilled { background: #dff1df; color: #145f22; }
    .badge.partial { background: #fff0cd; color: var(--warn); }
    .badge.failed { background: #ffe0df; color: var(--bad); }
    .address {
      padding: 0 16px 14px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }
    .items { display: grid; gap: 0; }
    .item {
      display: grid;
      grid-template-columns: 116px 1fr;
      gap: 14px;
      padding: 16px;
      border-top: 1px solid var(--line);
    }
    .photo {
      width: 116px;
      aspect-ratio: 1;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: #ebe6dc;
      object-fit: cover;
    }
    .photo-link { display: block; width: 116px; color: inherit; text-decoration: none; }
    .photo-link .photo { display: block; }
    .item-main { display: grid; gap: 10px; }
    .item-title { color: inherit; font-weight: 900; line-height: 1.2; text-decoration: none; }
    a.item-title { text-decoration: underline; text-underline-offset: 3px; }
    .item-meta { color: var(--muted); font-size: 13px; }
    .tracking-grid {
      display: grid;
      grid-template-columns: 1.25fr .85fr auto;
      gap: 10px;
      align-items: end;
    }
    .field label { display: block; font-size: 12px; font-weight: 800; margin: 0 0 5px; color: var(--muted); }
    .status-line { color: var(--muted); font-size: 12px; min-height: 16px; }
    .empty {
      text-align: center;
      padding: 50px 18px;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 22px;
      background: rgba(255,253,248,.5);
    }
    .hidden { display: none !important; }
    @media (max-width: 740px) {
      .shell { padding: 12px; }
      .top-inner { grid-template-columns: 1fr; }
      .top-inner button { width: 100%; }
      .filters { grid-template-columns: 1fr; }
      .order-head { grid-template-columns: 1fr; }
      .item { grid-template-columns: 92px 1fr; gap: 11px; padding: 13px; }
      .photo { width: 92px; border-radius: 15px; }
      .photo-link { width: 92px; }
      .tracking-grid { grid-template-columns: 1fr; }
      button { width: 100%; }
    }
  </style>
</head>
<body>
  <section id="login" class="login hidden">
    <div class="login-card">
      <h1 id="loginTitle">ESNTLS Supplier</h1>
      <div id="loginSub" class="sub">Enter the supplier access token to view orders.</div>
      <form id="loginForm">
        <input id="tokenInput" type="password" autocomplete="current-password" placeholder="Access token">
        <button id="loginBtn" type="submit">Open Orders</button>
      </form>
      <div id="loginError" class="status-line"></div>
    </div>
  </section>

  <main id="app" class="hidden">
    <div class="top">
      <div class="top-inner">
        <div>
          <h1 id="portalTitle">ESNTLS Supplier Portal</h1>
          <div id="summary" class="sub">Loading orders...</div>
        </div>
        <button id="langBtn" class="secondary lang-btn" type="button">\u4E2D\u6587</button>
        <button id="syncBtn" type="button">Sync Orders</button>
        <button id="logoutBtn" class="secondary" type="button">Logout</button>
      </div>
    </div>
    <div class="shell">
      <div class="filters">
        <input id="searchInput" type="search" placeholder="Search order, name, item, tracking">
        <div id="statusTabs" class="status-tabs" role="group" aria-label="Order status">
          <button id="statusUnfulfilled" class="status-tab active" type="button" data-status="unfulfilled" aria-pressed="true">Unfulfilled</button>
          <button id="statusFulfilled" class="status-tab" type="button" data-status="fulfilled" aria-pressed="false">Fulfilled</button>
        </div>
      </div>
      <section id="orders" class="orders"></section>
    </div>
  </main>

  <script>
    (function () {
      var TOKEN_KEY = "esntls_supplier_portal_token";
      var LANG_KEY = "esntls_supplier_portal_lang";
      var state = { orders: [], loading: false, activeStatus: "unfulfilled" };
      var params = new URLSearchParams(location.search);
      var passedToken = params.get("t") || params.get("token");
      var passedLang = params.get("lang");
      if (passedLang === "zh" || passedLang === "en") {
        localStorage.setItem(LANG_KEY, passedLang);
      }
      if (passedToken) {
        localStorage.setItem(TOKEN_KEY, passedToken);
        history.replaceState(null, "", location.pathname);
      }

      var login = document.getElementById("login");
      var app = document.getElementById("app");
      var ordersEl = document.getElementById("orders");
      var summaryEl = document.getElementById("summary");
      var loginError = document.getElementById("loginError");
      var searchInput = document.getElementById("searchInput");
      var statusTabs = document.getElementById("statusTabs");
      var langBtn = document.getElementById("langBtn");

      var copy = {
        en: {
          loginTitle: "ESNTLS Supplier",
          loginSub: "Enter the supplier access token to view orders.",
          tokenPlaceholder: "Access token",
          loginBtn: "Open Orders",
          portalTitle: "ESNTLS Supplier Portal",
          loading: "Loading orders...",
          syncing: "Syncing Shopify orders...",
          syncBtn: "Sync Orders",
          logoutBtn: "Logout",
          langBtn: "\u4E2D\u6587",
          searchPlaceholder: "Search order, name, item, tracking",
          statusTabsLabel: "Order status",
          all: "All orders",
          unfulfilled: "Unfulfilled",
          open: "Open",
          partial: "Partial",
          fulfilled: "Fulfilled",
          unfulfilledOrders: "Unfulfilled orders",
          fulfilledOrders: "Fulfilled orders",
          selectedOrders: "Selected orders",
          failed: "Failed",
          empty: "Empty",
          noOrders: "No orders found.",
          tracking: "Tracking number",
          trackingPlaceholder: "Paste tracking number",
          courier: "Courier",
          courierPlaceholder: "Optional",
          save: "Save",
          saving: "Saving",
          qty: "Qty",
          noUpdate: "No Shopify update yet",
          tokenRejected: "Token not accepted.",
          addTracking: "Add a tracking number first.",
          summary: function (total, shown) { return total + " orders saved. " + shown + " shown."; }
        },
        zh: {
          loginTitle: "ESNTLS \u4F9B\u5E94\u5546",
          loginSub: "\u8BF7\u8F93\u5165\u4F9B\u5E94\u5546\u8BBF\u95EE\u53E3\u4EE4\u67E5\u770B\u8BA2\u5355\u3002",
          tokenPlaceholder: "\u8BBF\u95EE\u53E3\u4EE4",
          loginBtn: "\u6253\u5F00\u8BA2\u5355",
          portalTitle: "ESNTLS \u4F9B\u5E94\u5546\u540E\u53F0",
          loading: "\u6B63\u5728\u52A0\u8F7D\u8BA2\u5355...",
          syncing: "\u6B63\u5728\u540C\u6B65 Shopify \u8BA2\u5355...",
          syncBtn: "\u540C\u6B65\u8BA2\u5355",
          logoutBtn: "\u9000\u51FA",
          langBtn: "English",
          searchPlaceholder: "\u641C\u7D22\u8BA2\u5355\u3001\u59D3\u540D\u3001\u5546\u54C1\u3001\u7269\u6D41\u5355\u53F7",
          statusTabsLabel: "\u8BA2\u5355\u72B6\u6001",
          all: "\u5168\u90E8\u8BA2\u5355",
          unfulfilled: "\u672A\u5B8C\u6210",
          open: "\u5F85\u5904\u7406",
          partial: "\u90E8\u5206\u5B8C\u6210",
          fulfilled: "\u5DF2\u53D1\u8D27",
          unfulfilledOrders: "\u672A\u5B8C\u6210\u8BA2\u5355",
          fulfilledOrders: "\u5DF2\u5B8C\u6210\u8BA2\u5355",
          selectedOrders: "\u7B5B\u9009\u8BA2\u5355",
          failed: "\u5931\u8D25",
          empty: "\u7A7A\u8BA2\u5355",
          noOrders: "\u6CA1\u6709\u627E\u5230\u8BA2\u5355\u3002",
          tracking: "\u7269\u6D41\u5355\u53F7",
          trackingPlaceholder: "\u7C98\u8D34\u7269\u6D41\u5355\u53F7",
          courier: "\u5FEB\u9012\u516C\u53F8",
          courierPlaceholder: "\u53EF\u9009",
          save: "\u4FDD\u5B58",
          saving: "\u4FDD\u5B58\u4E2D",
          qty: "\u6570\u91CF",
          noUpdate: "\u5C1A\u672A\u66F4\u65B0 Shopify",
          tokenRejected: "\u8BBF\u95EE\u53E3\u4EE4\u9519\u8BEF\u3002",
          addTracking: "\u8BF7\u5148\u586B\u5199\u7269\u6D41\u5355\u53F7\u3002",
          summary: function (total, shown) { return "\u5DF2\u4FDD\u5B58 " + total + " \u4E2A\u8BA2\u5355\uFF0C\u5F53\u524D\u663E\u793A " + shown + " \u4E2A\u3002"; }
        }
      };

      function token() { return localStorage.getItem(TOKEN_KEY) || ""; }
      function currentLang() { return localStorage.getItem(LANG_KEY) === "zh" ? "zh" : "en"; }
      function t(key) { return (copy[currentLang()] && copy[currentLang()][key]) || copy.en[key] || key; }
      function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
      }
      function updateStaticText() {
        var lang = currentLang();
        document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
        setText("loginTitle", t("loginTitle"));
        setText("loginSub", t("loginSub"));
        setText("loginBtn", t("loginBtn"));
        setText("portalTitle", t("portalTitle"));
        setText("syncBtn", t("syncBtn"));
        setText("logoutBtn", t("logoutBtn"));
        setText("langBtn", t("langBtn"));
        setText("statusUnfulfilled", t("unfulfilled"));
        setText("statusFulfilled", t("fulfilled"));
        statusTabs.setAttribute("aria-label", t("statusTabsLabel"));
        document.getElementById("tokenInput").placeholder = t("tokenPlaceholder");
        searchInput.placeholder = t("searchPlaceholder");
      }
      function updateStatusButtons() {
        statusTabs.querySelectorAll("[data-status]").forEach(function (button) {
          var active = button.getAttribute("data-status") === state.activeStatus;
          button.classList.toggle("active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        });
      }
      function statusLabel(value) {
        var key = String(value || "open").toLowerCase();
        return t(key) || value || t("open");
      }
      function escapeHtml(value) {
        return String(value || "").replace(/[&<>"']/g, function (char) {
          return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", """: "&quot;", "'": "&#39;" })[char];
        });
      }
      function escapeAttr(value) { return escapeHtml(value); }
      function showApp() {
        login.classList.toggle("hidden", Boolean(token()));
        app.classList.toggle("hidden", !token());
      }
      async function api(path, options) {
        var response = await fetch("/supplier-portal-api/" + path, Object.assign({
          cache: "no-store",
          headers: { "X-Supplier-Portal-Token": token(), "Content-Type": "application/json" }
        }, options || {}));
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok || data.error) throw new Error(data.error || "Request failed");
        return data;
      }
      function filteredOrders() {
        var q = (searchInput.value || "").toLowerCase().trim();
        var status = state.activeStatus;
        return state.orders.filter(function (order) {
          var orderStatus = String(order.status || "open").toLowerCase();
          if (status === "unfulfilled" && orderStatus === "fulfilled") return false;
          if (status === "fulfilled" && orderStatus !== "fulfilled") return false;
          if (!q) return true;
          return [
            order.businessName,
            order.orderName,
            (order.addressLines || []).join(" "),
            (order.items || []).map(function (item) {
              return [item.productName, item.option, item.trackingNumber].join(" ");
            }).join(" ")
          ].join(" ").toLowerCase().indexOf(q) !== -1;
        });
      }
      function sectionHtml(title, orders) {
        return '<section class="order-section">' +
          '<div class="section-head"><h2 class="section-title">' + escapeHtml(title) + '</h2><span class="section-count">' + orders.length + '</span></div>' +
          '<div class="section-orders">' + orders.map(renderOrder).join("") + '</div>' +
        '</section>';
      }
      function renderOrder(order) {
        var items = (order.items || []).map(function (item) {
          var productUrl = item.productPageUrl || "";
          var imgInner = item.imageUrl ? '<img class="photo" src="' + escapeAttr(item.imageUrl) + '" alt="">' : '<div class="photo"></div>';
          var img = imgInner;
          var title = '<div class="item-title">' + escapeHtml(item.productName) + '</div>';
          var meta = [item.option, item.quantity ? t("qty") + " " + item.quantity : ""].filter(Boolean).join(" / ");
          return '<div class="item" data-order-key="' + escapeAttr(order.key) + '" data-item-key="' + escapeAttr(item.itemKey) + '">' +
            img +
            '<div class="item-main">' +
              '<div>' + title + '<div class="item-meta">' + escapeHtml(meta) + '</div></div>' +
              '<div class="tracking-grid">' +
                '<div class="field"><label>' + escapeHtml(t("tracking")) + '</label><input data-field="tracking" value="' + escapeAttr(item.trackingNumber || "") + '" placeholder="' + escapeAttr(t("trackingPlaceholder")) + '"></div>' +
                '<div class="field"><label>' + escapeHtml(t("courier")) + '</label><input data-field="courier" value="' + escapeAttr(item.courier || "") + '" placeholder="' + escapeAttr(t("courierPlaceholder")) + '"></div>' +
                '<button type="button" data-action="save">' + escapeHtml(t("save")) + '</button>' +
              '</div>' +
              '<div class="status-line">' + escapeHtml(item.shopifyUpdated || t("noUpdate")) + '</div>' +
            '</div>' +
          '</div>';
        }).join("");
        var businessName = order.businessName || "ESNTLS Club";
        var sub = [businessName, order.orderDate || ""].filter(Boolean).join(" / ");
        return '<article class="order">' +
          '<div class="order-head"><div><div class="order-title"><span class="business-badge">' + escapeHtml(businessName) + '</span><span>' + escapeHtml(order.orderName || "Order") + '</span></div><div class="sub">' + escapeHtml(sub) + '</div></div><span class="badge ' + escapeAttr(order.status || "open") + '">' + escapeHtml(statusLabel(order.status)) + '</span></div>' +
          '<div class="address">' + escapeHtml((order.addressLines || []).join("\\n")).replace(/\\n/g, "<br>") + '</div>' +
          '<div class="items">' + items + '</div>' +
        '</article>';
      }
      function render() {
        updateStaticText();
        updateStatusButtons();
        var orders = filteredOrders();
        summaryEl.textContent = t("summary")(state.orders.length, orders.length);
        if (!orders.length) {
          ordersEl.innerHTML = '<div class="empty">' + escapeHtml(t("noOrders")) + '</div>';
          return;
        }
        var sectionTitle = state.activeStatus === "fulfilled" ? t("fulfilledOrders") : t("unfulfilledOrders");
        ordersEl.innerHTML = sectionHtml(sectionTitle || t("selectedOrders"), orders);
      }
      async function loadOrders(sync) {
        if (!token()) { showApp(); return; }
        updateStaticText();
        summaryEl.textContent = sync ? t("syncing") : t("loading");
        try {
          var data = await api("orders?limit=300&_=" + Date.now() + (sync ? "&sync=1" : ""));
          state.orders = data.orders || [];
          showApp();
          render();
        } catch (error) {
          if (/unauthorized/i.test(error.message)) {
            localStorage.removeItem(TOKEN_KEY);
            loginError.textContent = t("tokenRejected");
            showApp();
          } else {
            summaryEl.textContent = error.message;
          }
        }
      }
      document.getElementById("loginForm").addEventListener("submit", function (event) {
        event.preventDefault();
        localStorage.setItem(TOKEN_KEY, document.getElementById("tokenInput").value.trim());
        loadOrders(false);
      });
      document.getElementById("logoutBtn").addEventListener("click", function () {
        localStorage.removeItem(TOKEN_KEY);
        showApp();
      });
      document.getElementById("syncBtn").addEventListener("click", function () { loadOrders(true); });
      langBtn.addEventListener("click", function () {
        localStorage.setItem(LANG_KEY, currentLang() === "zh" ? "en" : "zh");
        updateStaticText();
        render();
      });
      searchInput.addEventListener("input", render);
      statusTabs.addEventListener("click", function (event) {
        var button = event.target.closest("[data-status]");
        if (!button) return;
        state.activeStatus = button.getAttribute("data-status") || "unfulfilled";
        render();
      });
      ordersEl.addEventListener("click", async function (event) {
        var button = event.target.closest("[data-action='save']");
        if (!button) return;
        var item = button.closest(".item");
        var tracking = item.querySelector("[data-field='tracking']").value.trim();
        var courier = item.querySelector("[data-field='courier']").value.trim();
        if (!tracking) return alert(t("addTracking"));
        button.disabled = true;
        button.textContent = t("saving");
        try {
          await api("tracking", {
            method: "POST",
            body: JSON.stringify({
              orderKey: item.getAttribute("data-order-key"),
              itemKey: item.getAttribute("data-item-key"),
              trackingNumber: tracking,
              courier: courier
            })
          });
          await loadOrders(false);
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = t("save");
        }
      });
      updateStaticText();
      showApp();
      loadOrders(false);
    })();
  <\/script>
</body>
</html>`], [`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>ESNTLS Supplier Portal</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f2eb;
      --ink: #171714;
      --muted: #6d695f;
      --line: #ddd6c8;
      --card: #fffdf8;
      --green: #47a447;
      --dark: #11110f;
      --warn: #9a5b00;
      --bad: #a32121;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Arial, Helvetica, sans-serif;
      letter-spacing: 0;
    }
    button, input, select, textarea { font: inherit; }
    button {
      border: 0;
      border-radius: 999px;
      background: var(--dark);
      color: #fff;
      min-height: 44px;
      padding: 0 18px;
      font-weight: 800;
      cursor: pointer;
    }
    button.secondary { background: transparent; color: var(--ink); border: 1px solid var(--line); }
    button:disabled { opacity: .55; cursor: wait; }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      border-radius: 14px;
      min-height: 44px;
      padding: 10px 12px;
      outline: none;
    }
    textarea { min-height: 74px; resize: vertical; }
    .shell { max-width: 1120px; margin: 0 auto; padding: 18px; }
    .top {
      position: sticky;
      top: 0;
      z-index: 5;
      background: rgba(245,242,235,.94);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--line);
    }
    .top-inner {
      max-width: 1120px;
      margin: 0 auto;
      padding: 14px 18px;
      display: grid;
      gap: 12px;
      grid-template-columns: 1fr auto auto auto;
      align-items: center;
    }
    h1 { margin: 0; font-size: 22px; line-height: 1.05; }
    .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
    .lang-btn { min-width: 98px; }
    .filters { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; margin: 18px 0; }
    .status-tabs {
      display: grid;
      grid-template-columns: repeat(2, minmax(130px, 1fr));
      gap: 8px;
    }
    .status-tab {
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      border-radius: 999px;
      min-height: 44px;
      padding: 0 16px;
      font-weight: 900;
      box-shadow: none;
    }
    .status-tab.active {
      background: var(--dark);
      border-color: var(--dark);
      color: #fff;
      box-shadow: 0 10px 24px rgba(20,18,12,.12);
    }
    .status-tab[data-status="fulfilled"].active {
      background: #145f22;
      border-color: #145f22;
    }
    .login {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .login-card {
      width: min(420px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 22px;
      box-shadow: 0 16px 50px rgba(20,18,12,.08);
    }
    .login-card h1 { margin-bottom: 8px; }
    .login-card form { display: grid; gap: 12px; margin-top: 18px; }
    .orders { display: grid; gap: 22px; }
    .order-section { display: grid; gap: 12px; }
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 2px;
    }
    .section-title {
      margin: 0;
      font-size: 18px;
      line-height: 1.1;
      font-weight: 900;
    }
    .section-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 30px;
      border-radius: 999px;
      padding: 5px 11px;
      background: #ede7da;
      color: var(--ink);
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }
    .section-orders { display: grid; gap: 14px; }
    .order {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 22px;
      overflow: hidden;
      box-shadow: 0 10px 34px rgba(20,18,12,.06);
    }
    .order-head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 16px;
      border-bottom: 1px solid var(--line);
    }
    .order-title { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 18px; font-weight: 900; }
    .business-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 5px 9px;
      background: #171714;
      color: #fff;
      font-size: 11px;
      line-height: 1;
      text-transform: uppercase;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 7px 11px;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      background: #ede7da;
      color: var(--ink);
      white-space: nowrap;
    }
    .badge.fulfilled { background: #dff1df; color: #145f22; }
    .badge.partial { background: #fff0cd; color: var(--warn); }
    .badge.failed { background: #ffe0df; color: var(--bad); }
    .address {
      padding: 0 16px 14px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }
    .items { display: grid; gap: 0; }
    .item {
      display: grid;
      grid-template-columns: 116px 1fr;
      gap: 14px;
      padding: 16px;
      border-top: 1px solid var(--line);
    }
    .photo {
      width: 116px;
      aspect-ratio: 1;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: #ebe6dc;
      object-fit: cover;
    }
    .photo-link { display: block; width: 116px; color: inherit; text-decoration: none; }
    .photo-link .photo { display: block; }
    .item-main { display: grid; gap: 10px; }
    .item-title { color: inherit; font-weight: 900; line-height: 1.2; text-decoration: none; }
    a.item-title { text-decoration: underline; text-underline-offset: 3px; }
    .item-meta { color: var(--muted); font-size: 13px; }
    .tracking-grid {
      display: grid;
      grid-template-columns: 1.25fr .85fr auto;
      gap: 10px;
      align-items: end;
    }
    .field label { display: block; font-size: 12px; font-weight: 800; margin: 0 0 5px; color: var(--muted); }
    .status-line { color: var(--muted); font-size: 12px; min-height: 16px; }
    .empty {
      text-align: center;
      padding: 50px 18px;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 22px;
      background: rgba(255,253,248,.5);
    }
    .hidden { display: none !important; }
    @media (max-width: 740px) {
      .shell { padding: 12px; }
      .top-inner { grid-template-columns: 1fr; }
      .top-inner button { width: 100%; }
      .filters { grid-template-columns: 1fr; }
      .order-head { grid-template-columns: 1fr; }
      .item { grid-template-columns: 92px 1fr; gap: 11px; padding: 13px; }
      .photo { width: 92px; border-radius: 15px; }
      .photo-link { width: 92px; }
      .tracking-grid { grid-template-columns: 1fr; }
      button { width: 100%; }
    }
  </style>
</head>
<body>
  <section id="login" class="login hidden">
    <div class="login-card">
      <h1 id="loginTitle">ESNTLS Supplier</h1>
      <div id="loginSub" class="sub">Enter the supplier access token to view orders.</div>
      <form id="loginForm">
        <input id="tokenInput" type="password" autocomplete="current-password" placeholder="Access token">
        <button id="loginBtn" type="submit">Open Orders</button>
      </form>
      <div id="loginError" class="status-line"></div>
    </div>
  </section>

  <main id="app" class="hidden">
    <div class="top">
      <div class="top-inner">
        <div>
          <h1 id="portalTitle">ESNTLS Supplier Portal</h1>
          <div id="summary" class="sub">Loading orders...</div>
        </div>
        <button id="langBtn" class="secondary lang-btn" type="button">\u4E2D\u6587</button>
        <button id="syncBtn" type="button">Sync Orders</button>
        <button id="logoutBtn" class="secondary" type="button">Logout</button>
      </div>
    </div>
    <div class="shell">
      <div class="filters">
        <input id="searchInput" type="search" placeholder="Search order, name, item, tracking">
        <div id="statusTabs" class="status-tabs" role="group" aria-label="Order status">
          <button id="statusUnfulfilled" class="status-tab active" type="button" data-status="unfulfilled" aria-pressed="true">Unfulfilled</button>
          <button id="statusFulfilled" class="status-tab" type="button" data-status="fulfilled" aria-pressed="false">Fulfilled</button>
        </div>
      </div>
      <section id="orders" class="orders"></section>
    </div>
  </main>

  <script>
    (function () {
      var TOKEN_KEY = "esntls_supplier_portal_token";
      var LANG_KEY = "esntls_supplier_portal_lang";
      var state = { orders: [], loading: false, activeStatus: "unfulfilled" };
      var params = new URLSearchParams(location.search);
      var passedToken = params.get("t") || params.get("token");
      var passedLang = params.get("lang");
      if (passedLang === "zh" || passedLang === "en") {
        localStorage.setItem(LANG_KEY, passedLang);
      }
      if (passedToken) {
        localStorage.setItem(TOKEN_KEY, passedToken);
        history.replaceState(null, "", location.pathname);
      }

      var login = document.getElementById("login");
      var app = document.getElementById("app");
      var ordersEl = document.getElementById("orders");
      var summaryEl = document.getElementById("summary");
      var loginError = document.getElementById("loginError");
      var searchInput = document.getElementById("searchInput");
      var statusTabs = document.getElementById("statusTabs");
      var langBtn = document.getElementById("langBtn");

      var copy = {
        en: {
          loginTitle: "ESNTLS Supplier",
          loginSub: "Enter the supplier access token to view orders.",
          tokenPlaceholder: "Access token",
          loginBtn: "Open Orders",
          portalTitle: "ESNTLS Supplier Portal",
          loading: "Loading orders...",
          syncing: "Syncing Shopify orders...",
          syncBtn: "Sync Orders",
          logoutBtn: "Logout",
          langBtn: "\u4E2D\u6587",
          searchPlaceholder: "Search order, name, item, tracking",
          statusTabsLabel: "Order status",
          all: "All orders",
          unfulfilled: "Unfulfilled",
          open: "Open",
          partial: "Partial",
          fulfilled: "Fulfilled",
          unfulfilledOrders: "Unfulfilled orders",
          fulfilledOrders: "Fulfilled orders",
          selectedOrders: "Selected orders",
          failed: "Failed",
          empty: "Empty",
          noOrders: "No orders found.",
          tracking: "Tracking number",
          trackingPlaceholder: "Paste tracking number",
          courier: "Courier",
          courierPlaceholder: "Optional",
          save: "Save",
          saving: "Saving",
          qty: "Qty",
          noUpdate: "No Shopify update yet",
          tokenRejected: "Token not accepted.",
          addTracking: "Add a tracking number first.",
          summary: function (total, shown) { return total + " orders saved. " + shown + " shown."; }
        },
        zh: {
          loginTitle: "ESNTLS \u4F9B\u5E94\u5546",
          loginSub: "\u8BF7\u8F93\u5165\u4F9B\u5E94\u5546\u8BBF\u95EE\u53E3\u4EE4\u67E5\u770B\u8BA2\u5355\u3002",
          tokenPlaceholder: "\u8BBF\u95EE\u53E3\u4EE4",
          loginBtn: "\u6253\u5F00\u8BA2\u5355",
          portalTitle: "ESNTLS \u4F9B\u5E94\u5546\u540E\u53F0",
          loading: "\u6B63\u5728\u52A0\u8F7D\u8BA2\u5355...",
          syncing: "\u6B63\u5728\u540C\u6B65 Shopify \u8BA2\u5355...",
          syncBtn: "\u540C\u6B65\u8BA2\u5355",
          logoutBtn: "\u9000\u51FA",
          langBtn: "English",
          searchPlaceholder: "\u641C\u7D22\u8BA2\u5355\u3001\u59D3\u540D\u3001\u5546\u54C1\u3001\u7269\u6D41\u5355\u53F7",
          statusTabsLabel: "\u8BA2\u5355\u72B6\u6001",
          all: "\u5168\u90E8\u8BA2\u5355",
          unfulfilled: "\u672A\u5B8C\u6210",
          open: "\u5F85\u5904\u7406",
          partial: "\u90E8\u5206\u5B8C\u6210",
          fulfilled: "\u5DF2\u53D1\u8D27",
          unfulfilledOrders: "\u672A\u5B8C\u6210\u8BA2\u5355",
          fulfilledOrders: "\u5DF2\u5B8C\u6210\u8BA2\u5355",
          selectedOrders: "\u7B5B\u9009\u8BA2\u5355",
          failed: "\u5931\u8D25",
          empty: "\u7A7A\u8BA2\u5355",
          noOrders: "\u6CA1\u6709\u627E\u5230\u8BA2\u5355\u3002",
          tracking: "\u7269\u6D41\u5355\u53F7",
          trackingPlaceholder: "\u7C98\u8D34\u7269\u6D41\u5355\u53F7",
          courier: "\u5FEB\u9012\u516C\u53F8",
          courierPlaceholder: "\u53EF\u9009",
          save: "\u4FDD\u5B58",
          saving: "\u4FDD\u5B58\u4E2D",
          qty: "\u6570\u91CF",
          noUpdate: "\u5C1A\u672A\u66F4\u65B0 Shopify",
          tokenRejected: "\u8BBF\u95EE\u53E3\u4EE4\u9519\u8BEF\u3002",
          addTracking: "\u8BF7\u5148\u586B\u5199\u7269\u6D41\u5355\u53F7\u3002",
          summary: function (total, shown) { return "\u5DF2\u4FDD\u5B58 " + total + " \u4E2A\u8BA2\u5355\uFF0C\u5F53\u524D\u663E\u793A " + shown + " \u4E2A\u3002"; }
        }
      };

      function token() { return localStorage.getItem(TOKEN_KEY) || ""; }
      function currentLang() { return localStorage.getItem(LANG_KEY) === "zh" ? "zh" : "en"; }
      function t(key) { return (copy[currentLang()] && copy[currentLang()][key]) || copy.en[key] || key; }
      function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
      }
      function updateStaticText() {
        var lang = currentLang();
        document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
        setText("loginTitle", t("loginTitle"));
        setText("loginSub", t("loginSub"));
        setText("loginBtn", t("loginBtn"));
        setText("portalTitle", t("portalTitle"));
        setText("syncBtn", t("syncBtn"));
        setText("logoutBtn", t("logoutBtn"));
        setText("langBtn", t("langBtn"));
        setText("statusUnfulfilled", t("unfulfilled"));
        setText("statusFulfilled", t("fulfilled"));
        statusTabs.setAttribute("aria-label", t("statusTabsLabel"));
        document.getElementById("tokenInput").placeholder = t("tokenPlaceholder");
        searchInput.placeholder = t("searchPlaceholder");
      }
      function updateStatusButtons() {
        statusTabs.querySelectorAll("[data-status]").forEach(function (button) {
          var active = button.getAttribute("data-status") === state.activeStatus;
          button.classList.toggle("active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        });
      }
      function statusLabel(value) {
        var key = String(value || "open").toLowerCase();
        return t(key) || value || t("open");
      }
      function escapeHtml(value) {
        return String(value || "").replace(/[&<>"']/g, function (char) {
          return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\"": "&quot;", "'": "&#39;" })[char];
        });
      }
      function escapeAttr(value) { return escapeHtml(value); }
      function showApp() {
        login.classList.toggle("hidden", Boolean(token()));
        app.classList.toggle("hidden", !token());
      }
      async function api(path, options) {
        var response = await fetch("/supplier-portal-api/" + path, Object.assign({
          cache: "no-store",
          headers: { "X-Supplier-Portal-Token": token(), "Content-Type": "application/json" }
        }, options || {}));
        var data = await response.json().catch(function () { return {}; });
        if (!response.ok || data.error) throw new Error(data.error || "Request failed");
        return data;
      }
      function filteredOrders() {
        var q = (searchInput.value || "").toLowerCase().trim();
        var status = state.activeStatus;
        return state.orders.filter(function (order) {
          var orderStatus = String(order.status || "open").toLowerCase();
          if (status === "unfulfilled" && orderStatus === "fulfilled") return false;
          if (status === "fulfilled" && orderStatus !== "fulfilled") return false;
          if (!q) return true;
          return [
            order.businessName,
            order.orderName,
            (order.addressLines || []).join(" "),
            (order.items || []).map(function (item) {
              return [item.productName, item.option, item.trackingNumber].join(" ");
            }).join(" ")
          ].join(" ").toLowerCase().indexOf(q) !== -1;
        });
      }
      function sectionHtml(title, orders) {
        return '<section class="order-section">' +
          '<div class="section-head"><h2 class="section-title">' + escapeHtml(title) + '</h2><span class="section-count">' + orders.length + '</span></div>' +
          '<div class="section-orders">' + orders.map(renderOrder).join("") + '</div>' +
        '</section>';
      }
      function renderOrder(order) {
        var items = (order.items || []).map(function (item) {
          var productUrl = item.productPageUrl || "";
          var imgInner = item.imageUrl ? '<img class="photo" src="' + escapeAttr(item.imageUrl) + '" alt="">' : '<div class="photo"></div>';
          var img = imgInner;
          var title = '<div class="item-title">' + escapeHtml(item.productName) + '</div>';
          var meta = [item.option, item.quantity ? t("qty") + " " + item.quantity : ""].filter(Boolean).join(" / ");
          return '<div class="item" data-order-key="' + escapeAttr(order.key) + '" data-item-key="' + escapeAttr(item.itemKey) + '">' +
            img +
            '<div class="item-main">' +
              '<div>' + title + '<div class="item-meta">' + escapeHtml(meta) + '</div></div>' +
              '<div class="tracking-grid">' +
                '<div class="field"><label>' + escapeHtml(t("tracking")) + '</label><input data-field="tracking" value="' + escapeAttr(item.trackingNumber || "") + '" placeholder="' + escapeAttr(t("trackingPlaceholder")) + '"></div>' +
                '<div class="field"><label>' + escapeHtml(t("courier")) + '</label><input data-field="courier" value="' + escapeAttr(item.courier || "") + '" placeholder="' + escapeAttr(t("courierPlaceholder")) + '"></div>' +
                '<button type="button" data-action="save">' + escapeHtml(t("save")) + '</button>' +
              '</div>' +
              '<div class="status-line">' + escapeHtml(item.shopifyUpdated || t("noUpdate")) + '</div>' +
            '</div>' +
          '</div>';
        }).join("");
        var businessName = order.businessName || "ESNTLS Club";
        var sub = [businessName, order.orderDate || ""].filter(Boolean).join(" / ");
        return '<article class="order">' +
          '<div class="order-head"><div><div class="order-title"><span class="business-badge">' + escapeHtml(businessName) + '</span><span>' + escapeHtml(order.orderName || "Order") + '</span></div><div class="sub">' + escapeHtml(sub) + '</div></div><span class="badge ' + escapeAttr(order.status || "open") + '">' + escapeHtml(statusLabel(order.status)) + '</span></div>' +
          '<div class="address">' + escapeHtml((order.addressLines || []).join("\\\\n")).replace(/\\\\n/g, "<br>") + '</div>' +
          '<div class="items">' + items + '</div>' +
        '</article>';
      }
      function render() {
        updateStaticText();
        updateStatusButtons();
        var orders = filteredOrders();
        summaryEl.textContent = t("summary")(state.orders.length, orders.length);
        if (!orders.length) {
          ordersEl.innerHTML = '<div class="empty">' + escapeHtml(t("noOrders")) + '</div>';
          return;
        }
        var sectionTitle = state.activeStatus === "fulfilled" ? t("fulfilledOrders") : t("unfulfilledOrders");
        ordersEl.innerHTML = sectionHtml(sectionTitle || t("selectedOrders"), orders);
      }
      async function loadOrders(sync) {
        if (!token()) { showApp(); return; }
        updateStaticText();
        summaryEl.textContent = sync ? t("syncing") : t("loading");
        try {
          var data = await api("orders?limit=300&_=" + Date.now() + (sync ? "&sync=1" : ""));
          state.orders = data.orders || [];
          showApp();
          render();
        } catch (error) {
          if (/unauthorized/i.test(error.message)) {
            localStorage.removeItem(TOKEN_KEY);
            loginError.textContent = t("tokenRejected");
            showApp();
          } else {
            summaryEl.textContent = error.message;
          }
        }
      }
      document.getElementById("loginForm").addEventListener("submit", function (event) {
        event.preventDefault();
        localStorage.setItem(TOKEN_KEY, document.getElementById("tokenInput").value.trim());
        loadOrders(false);
      });
      document.getElementById("logoutBtn").addEventListener("click", function () {
        localStorage.removeItem(TOKEN_KEY);
        showApp();
      });
      document.getElementById("syncBtn").addEventListener("click", function () { loadOrders(true); });
      langBtn.addEventListener("click", function () {
        localStorage.setItem(LANG_KEY, currentLang() === "zh" ? "en" : "zh");
        updateStaticText();
        render();
      });
      searchInput.addEventListener("input", render);
      statusTabs.addEventListener("click", function (event) {
        var button = event.target.closest("[data-status]");
        if (!button) return;
        state.activeStatus = button.getAttribute("data-status") || "unfulfilled";
        render();
      });
      ordersEl.addEventListener("click", async function (event) {
        var button = event.target.closest("[data-action='save']");
        if (!button) return;
        var item = button.closest(".item");
        var tracking = item.querySelector("[data-field='tracking']").value.trim();
        var courier = item.querySelector("[data-field='courier']").value.trim();
        if (!tracking) return alert(t("addTracking"));
        button.disabled = true;
        button.textContent = t("saving");
        try {
          await api("tracking", {
            method: "POST",
            body: JSON.stringify({
              orderKey: item.getAttribute("data-order-key"),
              itemKey: item.getAttribute("data-item-key"),
              trackingNumber: tracking,
              courier: courier
            })
          });
          await loadOrders(false);
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = t("save");
        }
      });
      updateStaticText();
      showApp();
      loadOrders(false);
    })();
  <\/script>
</body>
</html>`])));
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
__name(constantTimeEqualBytes, "constantTimeEqualBytes");
async function verifyShopifyWebhookRequest(req, rawBody, env) {
  const secret = env.SHOPIFY_WEBHOOK_SECRET || env.SHOPIFY_CLIENT_SECRET || "";
  if (!secret) {
    return { ok: false, status: 500, error: "SHOPIFY_WEBHOOK_SECRET or SHOPIFY_CLIENT_SECRET is not configured" };
  }
  const supplied = req.headers.get("X-Shopify-Hmac-Sha256") || "";
  if (!supplied) return { ok: false, status: 401, error: "Missing Shopify HMAC" };
  const expected = base64ToBytes(await hmacSha256Base64(secret, rawBody));
  const actual = base64ToBytes(supplied);
  if (!constantTimeEqualBytes(expected, actual)) {
    return { ok: false, status: 401, error: "Invalid Shopify HMAC" };
  }
  return { ok: true };
}
__name(verifyShopifyWebhookRequest, "verifyShopifyWebhookRequest");
async function handleShopifyOrderWebhook(req, env, ctx) {
  const rawBody = await req.arrayBuffer();
  const verification = await verifyShopifyWebhookRequest(req, rawBody, env);
  if (!verification.ok) return json({ error: verification.error }, verification.status);
  let order;
  try {
    order = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return json({ error: "Invalid Shopify webhook JSON" }, 400);
  }
  const deliveryId = req.headers.get("X-Shopify-Webhook-Id") || "";
  ctx.waitUntil(
    processSupplierOrderWebhook(env, order, {
      deliveryId,
      source: "shopify-orders-create-webhook",
      force: false,
      dryRun: false
    }).catch((error) => logSupplierOrderError(env, order, error, { deliveryId, source: "shopify-orders-create-webhook" }))
  );
  return json({ ok: true, accepted: true, orderName: shopifyOrderDisplayName(order) || null }, 202);
}
__name(handleShopifyOrderWebhook, "handleShopifyOrderWebhook");
async function processSupplierOrderWebhook(env, order, options = {}) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const key = supplierOrderLogKey(order, options.deliveryId);
  if (!options.force) {
    const existing = await env.BUCKET.get(key);
    if (existing) {
      return { ok: true, status: "skipped", reason: "Order already processed", key };
    }
  }
  const built = await buildSupplierSheetRows(env, order);
  const baseRecord = {
    orderId: shopifyOrderId(order),
    orderName: shopifyOrderDisplayName(order),
    source: options.source || "manual",
    deliveryId: options.deliveryId || "",
    rowCount: built.rows.length,
    excludedLineItems: built.excludedLineItems,
    unresolvedLineItems: built.unresolvedLineItems,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (!built.rows.length) {
    if (options.dryRun !== false) {
      return {
        ok: true,
        status: "skipped",
        reason: "No supplier line items after exclusions",
        key,
        orderName: baseRecord.orderName,
        rowCount: 0,
        excludedLineItems: built.excludedLineItems,
        unresolvedLineItems: built.unresolvedLineItems
      };
    }
    await writeSupplierOrderLog(env, key, { ...baseRecord, status: "skipped", reason: "No supplier line items after exclusions" });
    return { ok: true, status: "skipped", reason: "No supplier line items after exclusions", key };
  }
  if (options.dryRun !== false) {
    return {
      ok: true,
      status: "dry-run",
      key,
      orderName: baseRecord.orderName,
      rowCount: built.rows.length,
      rows: built.rows,
      excludedLineItems: built.excludedLineItems,
      unresolvedLineItems: built.unresolvedLineItems
    };
  }
  const portal = await upsertSupplierPortalOrder(env, order, {
    source: options.source || "supplier-order-webhook"
  }).catch((error) => ({ status: "error", error: error.message }));
  const sheet = supplierSheetConfigured(env) ? await appendRowsToSupplierGoogleSheet(env, built.rows).catch((error) => ({ status: "error", error: error.message })) : {
    status: "not_configured",
    reason: "Set GOOGLE_SUPPLIER_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY"
  };
  const whatsapp = supplierWhatsappEnabled(env) ? await sendShopifyOrderToWhatsApp(env, order, {
    deliveryId: options.deliveryId,
    source: options.source || "supplier-order-webhook",
    dryRun: false,
    force: true
  }) : { status: "disabled" };
  const status = sheet.status === "appended" || portal.status === "created" || portal.status === "updated" ? "recorded" : "not_configured";
  await writeSupplierOrderLog(env, key, {
    ...baseRecord,
    status,
    portal,
    sheet,
    whatsapp,
    appendedAt: sheet.status === "appended" ? (/* @__PURE__ */ new Date()).toISOString() : ""
  });
  return {
    ok: status === "recorded",
    status,
    key,
    orderName: baseRecord.orderName,
    rowCount: built.rows.length,
    portal,
    sheet,
    whatsapp,
    excludedLineItems: built.excludedLineItems,
    unresolvedLineItems: built.unresolvedLineItems
  };
}
__name(processSupplierOrderWebhook, "processSupplierOrderWebhook");
function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}
__name(clampInteger, "clampInteger");
function orderNameNumber(order) {
  const match = String(order?.name || order?.order_number || order?.number || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}
__name(orderNameNumber, "orderNameNumber");
function graphOrderLineItemToWebhookLineItem(lineItem) {
  const variant = lineItem?.variant || {};
  const product = lineItem?.product || variant.product || {};
  const imageUrl = safeMessageLine(lineItem?.image?.url);
  return {
    admin_graphql_api_id: lineItem?.id || "",
    id: lineItem?.id || "",
    title: lineItem?.title || lineItem?.name || "",
    name: lineItem?.name || lineItem?.title || "",
    sku: lineItem?.sku || variant.sku || "",
    quantity: lineItem?.quantity,
    current_quantity: lineItem?.currentQuantity,
    variant_title: lineItem?.variantTitle || variant.title || "",
    product_id: product.id || "",
    variant_id: variant.id || "",
    image: imageUrl ? { src: imageUrl, url: imageUrl } : void 0,
    product,
    variant,
    selectedOptions: variant.selectedOptions || [],
    properties: Array.isArray(lineItem?.customAttributes) ? lineItem.customAttributes.map((attribute) => ({
      name: attribute?.key || "",
      value: attribute?.value || ""
    })) : []
  };
}
__name(graphOrderLineItemToWebhookLineItem, "graphOrderLineItemToWebhookLineItem");
function graphOrderToWebhookOrder(order) {
  const shipping = order?.shippingAddress || {};
  return {
    admin_graphql_api_id: order?.id || "",
    id: order?.id || "",
    name: order?.name || "",
    created_at: order?.createdAt || "",
    financial_status: order?.displayFinancialStatus || "",
    fulfillment_status: order?.displayFulfillmentStatus || "",
    shipping_address: {
      name: shipping.name || "",
      address1: shipping.address1 || "",
      address2: shipping.address2 || "",
      city: shipping.city || "",
      province: shipping.province || "",
      country: shipping.country || "",
      zip: shipping.zip || ""
    },
    line_items: (order?.lineItems?.nodes || []).map(graphOrderLineItemToWebhookLineItem)
  };
}
__name(graphOrderToWebhookOrder, "graphOrderToWebhookOrder");
function supplierSyncSkipsOrder(order, options) {
  const orderNumber = orderNameNumber(order);
  if (options.afterOrderNumber && orderNumber && orderNumber <= options.afterOrderNumber) {
    return `At or before #${options.afterOrderNumber}`;
  }
  if (!options.includeUnpaid && String(order?.displayFinancialStatus || "").toUpperCase() !== "PAID") {
    return `Financial status ${order?.displayFinancialStatus || "unknown"}`;
  }
  if (!options.includeFulfilled && String(order?.displayFulfillmentStatus || "").toUpperCase() === "FULFILLED") {
    return "Already fulfilled";
  }
  if (!order?.shippingAddress) return "Missing shipping address";
  return "";
}
__name(supplierSyncSkipsOrder, "supplierSyncSkipsOrder");
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
  const query = safeMessageLine(requestBody.query || "");
  const data = await shopifyGraphql(env, RECENT_SUPPLIER_ORDERS_QUERY, { first, query });
  const nodes = data?.orders?.nodes || [];
  const skippedOrders = [];
  const candidates = [];
  for (const order of nodes) {
    const reason = supplierSyncSkipsOrder(order, options);
    if (reason) {
      skippedOrders.push({ orderName: order?.name || "", reason });
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
      source: "admin-supplier-sheet-sync"
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
    appendedOrders: results.filter((result) => result.status === "appended").length,
    appendedRows: results.reduce((total, result) => total + (result.status === "appended" ? Number(result.rowCount || 0) : 0), 0),
    skippedOrders,
    results
  };
}
__name(syncRecentSupplierOrdersToSheet, "syncRecentSupplierOrdersToSheet");
function supplierPortalSyncEnabled(env) {
  return !/^false$/i.test(String(env.SUPPLIER_PORTAL_SYNC_ENABLED || "true").trim());
}
__name(supplierPortalSyncEnabled, "supplierPortalSyncEnabled");
async function acquireSupplierPortalSyncLock(env, source = "manual") {
  if (!env.BUCKET) return { ok: true, runId: crypto.randomUUID(), release: /* @__PURE__ */ __name(async () => {
  }, "release") };
  const now = Date.now();
  const existing = await env.BUCKET.get(SUPPLIER_PORTAL_SYNC_LOCK_KEY);
  if (existing) {
    try {
      const lock = JSON.parse(await existing.text());
      if (lock.startedAt && now - Number(lock.startedAt) < 90 * 1e3) {
        return { ok: false, reason: "Supplier portal sync is already running", lock };
      }
    } catch {
    }
  }
  const runId = crypto.randomUUID();
  await env.BUCKET.put(SUPPLIER_PORTAL_SYNC_LOCK_KEY, JSON.stringify({
    runId,
    source,
    startedAt: now,
    startedAtIso: new Date(now).toISOString()
  }, null, 2), { httpMetadata: { contentType: JSON_CONTENT_TYPE } });
  return {
    ok: true,
    runId,
    release: /* @__PURE__ */ __name(async () => {
      try {
        const current = await env.BUCKET.get(SUPPLIER_PORTAL_SYNC_LOCK_KEY);
        if (!current) return;
        const lock = JSON.parse(await current.text());
        if (lock.runId === runId) await env.BUCKET.delete(SUPPLIER_PORTAL_SYNC_LOCK_KEY);
      } catch {
      }
    }, "release")
  };
}
__name(acquireSupplierPortalSyncLock, "acquireSupplierPortalSyncLock");
async function writeSupplierPortalSyncLog(env, record) {
  if (!env.BUCKET) return;
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const key = `${SUPPLIER_PORTAL_SYNC_ROOT}${stamp}-${crypto.randomUUID()}.json`;
  try {
    await env.BUCKET.put(key, JSON.stringify(record, null, 2), {
      httpMetadata: { contentType: JSON_CONTENT_TYPE }
    });
  } catch (error) {
    console.error("supplier_portal_sync_log_failed", error);
  }
}
__name(writeSupplierPortalSyncLog, "writeSupplierPortalSyncLog");
async function runSupplierPortalRecentOrderSync(env, requestBody = {}) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const first = clampInteger(requestBody.first || env.SUPPLIER_PORTAL_SYNC_FIRST, 50, 1, 50);
  const afterOrderNumber = clampInteger(requestBody.afterOrderNumber, 0, 0, 999999999);
  const query = safeMessageLine(requestBody.query || env.SUPPLIER_PORTAL_SYNC_QUERY || "financial_status:paid");
  const dryRun = requestBody.dryRun === true;
  const options = {
    afterOrderNumber,
    includeFulfilled: requestBody.includeFulfilled === true,
    includeUnpaid: requestBody.includeUnpaid === true
  };
  const productsPayload = await readProductsPayload(env).catch(() => ({ list: [] }));
  const products = (productsPayload.list || []).map((raw) => {
    const normalized = normalizeStoredProduct(raw);
    return { ...normalized, raw };
  });
  const data = await shopifyGraphql(env, RECENT_SUPPLIER_ORDERS_QUERY, { first, query });
  const nodes = data?.orders?.nodes || [];
  const results = [];
  const skippedOrders = [];
  for (const order of nodes) {
    const reason = supplierSyncSkipsOrder(order, options);
    if (reason) {
      skippedOrders.push({ orderName: order?.name || "", reason });
      continue;
    }
    const supplierOrder = graphOrderToWebhookOrder(order);
    if (dryRun) {
      const portalOrder = await buildSupplierPortalOrder(env, supplierOrder, products);
      results.push({
        orderName: portalOrder.orderName,
        status: portalOrder.items.length ? "ready" : "skipped",
        itemCount: portalOrder.items.length,
        excludedLineItems: portalOrder.excludedLineItems
      });
      continue;
    }
    results.push(await upsertSupplierPortalOrder(env, supplierOrder, {
      products,
      source: requestBody.source || "supplier-portal-poll"
    }));
  }
  const summary = {
    ok: true,
    status: dryRun ? "dry-run" : "complete",
    dryRun,
    first,
    query,
    fetched: nodes.length,
    syncedOrders: results.filter((result) => result.status === "created" || result.status === "updated").length,
    skippedOrders,
    results,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeSupplierPortalSyncLog(env, {
    ...summary,
    results: results.map((result) => ({
      orderName: result.orderName,
      status: result.status,
      itemCount: result.itemCount || 0,
      reason: result.reason || ""
    }))
  });
  return summary;
}
__name(runSupplierPortalRecentOrderSync, "runSupplierPortalRecentOrderSync");
async function syncRecentSupplierOrdersToPortal(env, requestBody = {}) {
  const dryRun = requestBody.dryRun === true;
  let lock = null;
  if (!dryRun) {
    lock = await acquireSupplierPortalSyncLock(env, requestBody.source || "manual");
    if (!lock.ok) {
      return { ok: true, status: "skipped", reason: lock.reason || "Supplier portal sync is already running" };
    }
  }
  try {
    return await runSupplierPortalRecentOrderSync(env, requestBody);
  } finally {
    if (lock?.release) await lock.release();
  }
}
__name(syncRecentSupplierOrdersToPortal, "syncRecentSupplierOrdersToPortal");
function xclusivelineSupplierEnabled(env) {
  if (!safeMessageLine(env.XCLUSIVELINE_SUPPLIER_ORDERS_URL)) return false;
  return !/^false$/i.test(String(env.XCLUSIVELINE_SUPPLIER_ENABLED || "true").trim());
}
__name(xclusivelineSupplierEnabled, "xclusivelineSupplierEnabled");
function xclusivelineSupplierHeaders(env, includeJson = false) {
  const token = safeMessageLine(env.XCLUSIVELINE_SUPPLIER_SERVICE_TOKEN);
  if (!token) throw new Error("XCLUSIVELINE_SUPPLIER_SERVICE_TOKEN is not configured");
  return {
    ...includeJson ? { "Content-Type": JSON_CONTENT_TYPE } : {},
    "Accept": JSON_CONTENT_TYPE,
    "X-Supplier-Service-Token": token
  };
}
__name(xclusivelineSupplierHeaders, "xclusivelineSupplierHeaders");
function xclusivelineSupplierOrdersUrl(env, requestBody = {}) {
  const base = safeMessageLine(env.XCLUSIVELINE_SUPPLIER_ORDERS_URL);
  if (!base) throw new Error("XCLUSIVELINE_SUPPLIER_ORDERS_URL is not configured");
  const url = new URL(base);
  const first = clampInteger(
    requestBody.xclusivelineFirst || requestBody.externalFirst || requestBody.first || env.XCLUSIVELINE_SUPPLIER_SYNC_FIRST || env.SUPPLIER_PORTAL_SYNC_FIRST,
    50,
    1,
    50
  );
  url.searchParams.set("first", String(first));
  const query = safeMessageLine(requestBody.xclusivelineQuery || requestBody.externalQuery || env.XCLUSIVELINE_SUPPLIER_SYNC_QUERY || "financial_status:paid");
  if (query) url.searchParams.set("query", query);
  if (requestBody.includeFulfilled === true) url.searchParams.set("includeFulfilled", "true");
  if (requestBody.includeUnpaid === true) url.searchParams.set("includeUnpaid", "true");
  return url;
}
__name(xclusivelineSupplierOrdersUrl, "xclusivelineSupplierOrdersUrl");
function supplierPortalExternalOrderNumber(order) {
  const numeric = Number(order?.orderNumber);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const match = safeMessageLine(order?.orderName || order?.name).match(/\d+/);
  return match ? Number(match[0]) : 0;
}
__name(supplierPortalExternalOrderNumber, "supplierPortalExternalOrderNumber");
function normalizeExternalSupplierPortalItem(item, index, businessId, orderName) {
  const itemKey = safeMessageLine(item?.itemKey) || slugify([businessId, orderName, item?.productName || item?.name || "item", item?.option || "", index + 1].join("-")) || `item-${index + 1}`;
  return {
    itemKey,
    sourceProductId: safeMessageLine(item?.sourceProductId || item?.productId || item?.id),
    productName: safeMessageLine(item?.productName || item?.name || item?.title || "Unknown item"),
    option: safeMessageLine(item?.option || item?.variantTitle || item?.variant_title),
    quantity: Math.max(1, Number(item?.quantity || 1)),
    imageUrl: safeMessageLine(item?.imageUrl || item?.image || item?.image_url),
    productPageUrl: "",
    shopifyLineItemId: safeMessageLine(item?.shopifyLineItemId || item?.lineItemId),
    shopifyProductId: safeMessageLine(item?.shopifyProductId || item?.productShopifyId),
    shopifyVariantId: safeMessageLine(item?.shopifyVariantId || item?.variantShopifyId),
    supplierStatus: safeMessageLine(item?.supplierStatus || "New"),
    trackingNumber: safeMessageLine(item?.trackingNumber),
    courier: safeMessageLine(item?.courier),
    supplierNotes: safeMessageLine(item?.supplierNotes),
    shopifyUpdated: safeMessageLine(item?.shopifyUpdated || "No"),
    shopifyFulfillmentId: safeMessageLine(item?.shopifyFulfillmentId),
    trackingUpdatedAt: safeMessageLine(item?.trackingUpdatedAt)
  };
}
__name(normalizeExternalSupplierPortalItem, "normalizeExternalSupplierPortalItem");
function normalizeExternalSupplierPortalOrder(order, source = {}) {
  const businessId = supplierPortalBusinessId(order?.businessId || source.businessId || "external");
  const businessName = safeMessageLine(order?.businessName || source.businessName || businessId.toUpperCase());
  const orderName = safeMessageLine(order?.orderName || order?.name || order?.order_number || order?.id);
  const shipping = order?.shipping || {};
  const normalizedShipping = {
    name: safeMessageLine(shipping.name),
    address1: safeMessageLine(shipping.address1),
    address2: safeMessageLine(shipping.address2),
    city: safeMessageLine(shipping.city),
    province: safeMessageLine(shipping.province),
    postcode: safeMessageLine(shipping.postcode || shipping.zip || shipping.postal_code),
    country: safeMessageLine(shipping.country)
  };
  const addressLines = Array.isArray(order?.addressLines) && order.addressLines.length ? order.addressLines.map(safeMessageLine).filter(Boolean) : supplierPortalAddressLines(normalizedShipping);
  const items = (Array.isArray(order?.items) ? order.items : []).map((item, index) => {
    return normalizeExternalSupplierPortalItem(item, index, businessId, orderName);
  });
  return {
    key: supplierPortalOrderKey(orderName, businessId),
    businessId,
    businessName,
    orderId: safeMessageLine(order?.orderId || order?.id),
    orderName,
    orderNumber: supplierPortalExternalOrderNumber({ ...order, orderName }),
    orderDate: safeMessageLine(order?.orderDate || order?.createdAt || order?.created_at || (/* @__PURE__ */ new Date()).toISOString()),
    shipping: normalizedShipping,
    addressLines,
    items,
    status: supplierPortalOrderStatus(items),
    excludedLineItems: Array.isArray(order?.excludedLineItems) ? order.excludedLineItems.map(safeMessageLine).filter(Boolean) : [],
    unresolvedLineItems: Array.isArray(order?.unresolvedLineItems) ? order.unresolvedLineItems.map(safeMessageLine).filter(Boolean) : [],
    sourceUpdatedAt: safeMessageLine(order?.sourceUpdatedAt || (/* @__PURE__ */ new Date()).toISOString())
  };
}
__name(normalizeExternalSupplierPortalOrder, "normalizeExternalSupplierPortalOrder");
async function syncXclusivelineSupplierOrdersToPortal(env, requestBody = {}) {
  if (!xclusivelineSupplierEnabled(env)) {
    return {
      ok: true,
      status: "disabled",
      businessId: "xclusiveline",
      reason: "XCLUSIVELINE supplier sync is not configured"
    };
  }
  const dryRun = requestBody.dryRun === true;
  const requestUrl = xclusivelineSupplierOrdersUrl(env, requestBody);
  const request = new Request(requestUrl.toString(), {
    headers: xclusivelineSupplierHeaders(env)
  });
  const response = env.XCLUSIVELINE_SUPPLIER_WORKER && typeof env.XCLUSIVELINE_SUPPLIER_WORKER.fetch === "function" ? await env.XCLUSIVELINE_SUPPLIER_WORKER.fetch(request) : await fetch(request);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error || `XCLUSIVELINE supplier sync failed: ${response.status} at ${requestUrl.origin}${requestUrl.pathname}`);
  }
  const results = [];
  const skippedOrders = Array.isArray(data.skippedOrders) ? data.skippedOrders : [];
  for (const externalOrder of Array.isArray(data.orders) ? data.orders : []) {
    const incoming = await applySupplierPortalHiddenItems(env, normalizeExternalSupplierPortalOrder(externalOrder, {
      businessId: data.businessId || "xclusiveline",
      businessName: data.businessName || "XCLUSIVELINE"
    }));
    if (!incoming.items.length) {
      results.push({
        businessId: incoming.businessId,
        businessName: incoming.businessName,
        orderName: incoming.orderName,
        status: "skipped",
        reason: "No supplier portal items after exclusions"
      });
      continue;
    }
    if (dryRun) {
      results.push({
        businessId: incoming.businessId,
        businessName: incoming.businessName,
        orderName: incoming.orderName,
        status: "ready",
        itemCount: incoming.items.length,
        key: incoming.key
      });
      continue;
    }
    const existing = await readSupplierPortalOrder(env, incoming.key);
    const merged = mergeSupplierPortalOrder(existing, incoming);
    merged.source = "xclusiveline-supplier-api";
    merged.externalSyncedAt = (/* @__PURE__ */ new Date()).toISOString();
    const saved = await writeSupplierPortalOrder(env, merged);
    results.push({
      businessId: saved.businessId,
      businessName: saved.businessName,
      orderName: saved.orderName,
      status: existing ? "updated" : "created",
      itemCount: saved.items.length,
      key: saved.key
    });
  }
  return {
    ok: true,
    status: dryRun ? "dry-run" : "complete",
    dryRun,
    businessId: data.businessId || "xclusiveline",
    businessName: data.businessName || "XCLUSIVELINE",
    fetched: data.fetched || data.orders?.length || 0,
    syncedOrders: results.filter((result) => result.status === "created" || result.status === "updated").length,
    skippedOrders,
    results,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(syncXclusivelineSupplierOrdersToPortal, "syncXclusivelineSupplierOrdersToPortal");
async function syncExternalSupplierOrdersToPortal(env, requestBody = {}) {
  const sources = [];
  if (xclusivelineSupplierEnabled(env)) {
    try {
      sources.push(await syncXclusivelineSupplierOrdersToPortal(env, requestBody));
    } catch (error) {
      sources.push({
        ok: false,
        status: "failed",
        businessId: "xclusiveline",
        businessName: "XCLUSIVELINE",
        error: error.message,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  const summary = {
    ok: sources.every((source) => source.ok !== false),
    status: "complete",
    sources,
    syncedOrders: sources.reduce((total, source) => total + Number(source.syncedOrders || 0), 0),
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeSupplierPortalSyncLog(env, {
    ...summary,
    source: requestBody.source || "external-supplier-sync"
  });
  return summary;
}
__name(syncExternalSupplierOrdersToPortal, "syncExternalSupplierOrdersToPortal");
async function syncAllSupplierOrdersToPortal(env, requestBody = {}) {
  const local = await syncRecentSupplierOrdersToPortal(env, requestBody);
  const external = await syncExternalSupplierOrdersToPortal(env, requestBody);
  return {
    ok: local.ok !== false && external.ok !== false,
    status: "complete",
    local,
    external,
    syncedOrders: Number(local.syncedOrders || 0) + Number(external.syncedOrders || 0),
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(syncAllSupplierOrdersToPortal, "syncAllSupplierOrdersToPortal");
async function importSupplierSheetOrdersToPortal(env, requestBody = {}) {
  if (!supplierSheetConfigured(env)) {
    return {
      ok: false,
      status: "not_configured",
      reason: "Set GOOGLE_SUPPLIER_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY"
    };
  }
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const dryRun = requestBody.dryRun !== false;
  const scanLimit = clampInteger(requestBody.scanLimit || env.SUPPLIER_PORTAL_IMPORT_SCAN_LIMIT, 2e3, 10, 5e3);
  const orderLimit = clampInteger(requestBody.limit || env.SUPPLIER_PORTAL_IMPORT_LIMIT, 500, 1, 1e3);
  const tab = googleSheetsA1SheetName(googleSheetsTabName(env));
  const range = `${tab}!A1:R${scanLimit + 1}`;
  const sheet = await getSupplierGoogleSheetValues(env, range, { valueRenderOption: "FORMULA" });
  const rows = await supplierPortalSheetRowsFromValues(env, sheet.values || []);
  const groups = groupSupplierPortalSheetRows(rows).slice(0, orderLimit);
  const results = [];
  for (const group of groups) {
    const incoming = await applySupplierPortalHiddenItems(env, supplierPortalOrderFromSheetGroup(group));
    if (!incoming.items.length) {
      results.push({
        orderName: group.orderName,
        status: "skipped",
        reason: "No supplier portal items found",
        rowCount: group.rows.length
      });
      continue;
    }
    if (dryRun) {
      results.push({
        orderName: group.orderName,
        status: "ready",
        itemCount: incoming.items.length,
        rowCount: group.rows.length
      });
      continue;
    }
    const existing = await readSupplierPortalOrder(env, incoming.key);
    const merged = mergeSupplierPortalOrder(existing, incoming, { preserveUnmatchedExisting: true });
    merged.source = existing?.source || "google-sheet-import";
    merged.sheetImportedAt = (/* @__PURE__ */ new Date()).toISOString();
    const saved = await writeSupplierPortalOrder(env, merged);
    results.push({
      orderName: saved.orderName,
      status: existing ? "updated" : "created",
      itemCount: saved.items.length,
      rowCount: group.rows.length,
      key: saved.key
    });
  }
  const summary = {
    ok: true,
    status: dryRun ? "dry-run" : "complete",
    dryRun,
    range,
    scannedRows: Math.max(0, (sheet.values || []).length - 1),
    importedRows: rows.length,
    importedOrders: groups.length,
    createdOrders: results.filter((result) => result.status === "created").length,
    updatedOrders: results.filter((result) => result.status === "updated").length,
    results,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeSupplierPortalSyncLog(env, {
    ...summary,
    results: results.map((result) => ({
      orderName: result.orderName,
      status: result.status,
      itemCount: result.itemCount || 0,
      rowCount: result.rowCount || 0,
      reason: result.reason || ""
    }))
  });
  return summary;
}
__name(importSupplierSheetOrdersToPortal, "importSupplierSheetOrdersToPortal");
async function createShopifyFulfillmentForSupplierRows(env, orderName, rows) {
  const orderData = await shopifyGraphql(env, SUPPLIER_TRACKING_ORDER_QUERY, {
    query: shopifyOrderSearchQuery(orderName)
  });
  const order = orderData?.orders?.nodes?.[0];
  if (!order) throw new Error(`Shopify order ${orderName} was not found`);
  const productsPayload = await readProductsPayload(env).catch(() => ({ list: [] }));
  const products = (productsPayload.list || []).map((raw) => {
    const normalized = normalizeStoredProduct(raw);
    return { ...normalized, raw };
  });
  const trackingInfo = trackingInfoForSupplierRows(rows);
  const fulfillmentLines = buildSupplierTrackingFulfillmentInput(order, rows, products);
  if (!fulfillmentLines.lineItemsByFulfillmentOrder.length) {
    return {
      status: "skipped",
      reason: "Already fulfilled or no matching fulfillment lines",
      trackingNumbers: trackingInfo.numbers || [trackingInfo.number],
      courier: trackingInfo.company || "",
      matchedLineItems: fulfillmentLines.matchedLineItems,
      candidateLineItems: fulfillmentLines.candidateLineItems
    };
  }
  const fulfillment = {
    trackingInfo,
    notifyCustomer: /^true$/i.test(String(env.SUPPLIER_TRACKING_NOTIFY_CUSTOMER || "").trim()),
    lineItemsByFulfillmentOrder: fulfillmentLines.lineItemsByFulfillmentOrder
  };
  const data = await shopifyGraphql(env, SUPPLIER_TRACKING_FULFILLMENT_MUTATION, { fulfillment });
  const userErrors = data?.fulfillmentCreate?.userErrors || [];
  if (userErrors.length) {
    throw new Error(userErrors.map((error) => error.message).join("; "));
  }
  return {
    status: "fulfilled",
    fulfillmentId: data?.fulfillmentCreate?.fulfillment?.id || "",
    trackingNumbers: trackingInfo.numbers || [trackingInfo.number],
    courier: trackingInfo.company || "",
    matchedLineItems: fulfillmentLines.matchedLineItems,
    candidateLineItems: fulfillmentLines.candidateLineItems
  };
}
__name(createShopifyFulfillmentForSupplierRows, "createShopifyFulfillmentForSupplierRows");
function portalTrackingRowsFromItems(items) {
  return (items || []).map((item) => ({
    rowNumber: 0,
    orderName: "",
    productName: item.productName,
    option: item.option,
    quantity: Math.max(1, Number(item.quantity || 1)),
    trackingNumbers: splitTrackingNumbers(item.trackingNumber),
    courier: normalizeTrackingCompany(item.courier)
  })).filter((row) => row.trackingNumbers.length);
}
__name(portalTrackingRowsFromItems, "portalTrackingRowsFromItems");
async function updateXclusivelineSupplierTracking(env, order, selectedItems) {
  const trackingUrl = safeMessageLine(env.XCLUSIVELINE_SUPPLIER_TRACKING_URL);
  if (!trackingUrl) throw new Error("XCLUSIVELINE_SUPPLIER_TRACKING_URL is not configured");
  const response = await fetch(trackingUrl, {
    method: "POST",
    headers: xclusivelineSupplierHeaders(env, true),
    body: JSON.stringify({
      orderName: order.orderName,
      orderId: order.orderId,
      items: selectedItems.map((item) => ({
        itemKey: item.itemKey,
        sourceProductId: item.sourceProductId,
        productName: item.productName,
        option: item.option,
        quantity: Math.max(1, Number(item.quantity || 1)),
        shopifyLineItemId: item.shopifyLineItemId,
        shopifyProductId: item.shopifyProductId,
        shopifyVariantId: item.shopifyVariantId,
        trackingNumber: item.trackingNumber,
        courier: item.courier,
        supplierNotes: item.supplierNotes
      }))
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error || `XCLUSIVELINE tracking update failed: ${response.status}`);
  }
  return data;
}
__name(updateXclusivelineSupplierTracking, "updateXclusivelineSupplierTracking");
function supplierSheetRowMatchesPortalItem(row, order, item) {
  if (normalizeTitleKey(supplierTrackingCell(row, SUPPLIER_SHEET_COLS.ORDER_NAME)) !== normalizeTitleKey(order.orderName)) return false;
  const sheetProduct = normalizeTitleKey(supplierTrackingCell(row, SUPPLIER_SHEET_COLS.PRODUCT_NAME));
  const itemProduct = normalizeTitleKey(item.productName);
  if (sheetProduct && itemProduct && sheetProduct !== itemProduct && !sheetProduct.includes(itemProduct) && !itemProduct.includes(sheetProduct)) {
    return false;
  }
  const sheetOption = normalizeTitleKey(supplierTrackingCell(row, SUPPLIER_SHEET_COLS.OPTION));
  const itemOption = normalizeTitleKey(item.option);
  return !sheetOption || !itemOption || sheetOption === itemOption || sheetOption.includes(itemOption) || itemOption.includes(sheetOption);
}
__name(supplierSheetRowMatchesPortalItem, "supplierSheetRowMatchesPortalItem");
async function updateSupplierSheetTrackingForPortalItems(env, order, items) {
  if (!supplierSheetConfigured(env) || !items.length) return { status: "skipped", reason: "Google Sheet is not configured" };
  const scanLimit = clampInteger(env.SUPPLIER_TRACKING_SCAN_LIMIT, 500, 10, 2e3);
  const tab = googleSheetsA1SheetName(googleSheetsTabName(env));
  const range = `${tab}!A1:R${scanLimit + 1}`;
  const sheet = await getSupplierGoogleSheetValues(env, range, { valueRenderOption: "FORMATTED_VALUE" });
  const values = sheet.values || [];
  const updates = [];
  for (let index = 1; index < values.length; index++) {
    const row = values[index] || [];
    const item = items.find((candidate) => supplierSheetRowMatchesPortalItem(row, order, candidate));
    if (!item) continue;
    const rowNumber = index + 1;
    updates.push({
      range: `${tab}!N${rowNumber}:R${rowNumber}`,
      majorDimension: "ROWS",
      values: [[
        item.supplierStatus || "Shipped",
        item.trackingNumber || "",
        item.courier || "",
        item.supplierNotes || supplierTrackingCell(row, 16),
        item.shopifyUpdated || "No"
      ]]
    });
  }
  if (!updates.length) return { status: "skipped", reason: "No matching Sheet rows found" };
  return batchUpdateSupplierGoogleSheetValues(env, updates);
}
__name(updateSupplierSheetTrackingForPortalItems, "updateSupplierSheetTrackingForPortalItems");
async function updateSupplierPortalTracking(env, requestBody = {}) {
  const orderKey = safeMessageLine(requestBody.orderKey || requestBody.key || requestBody.orderName);
  if (!orderKey) throw new Error("Missing order key");
  const order = await readSupplierPortalOrder(env, orderKey);
  if (!order) throw new Error("Supplier portal order was not found");
  const requestedItems = Array.isArray(requestBody.items) && requestBody.items.length ? requestBody.items : [{
    itemKey: requestBody.itemKey,
    trackingNumber: requestBody.trackingNumber,
    courier: requestBody.courier,
    supplierNotes: requestBody.supplierNotes
  }];
  const selectedItems = [];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const requestItem of requestedItems) {
    const itemKey = safeMessageLine(requestItem.itemKey);
    const item = (order.items || []).find((candidate) => candidate.itemKey === itemKey);
    if (!item) throw new Error(`Order item ${itemKey || "(missing)"} was not found`);
    const trackingNumbers = splitTrackingNumbers(requestItem.trackingNumber);
    if (!trackingNumbers.length) throw new Error(`Tracking number is missing for ${item.productName}`);
    item.trackingNumber = trackingNumbers.join(", ");
    item.courier = normalizeTrackingCompany(requestItem.courier || item.courier);
    item.supplierNotes = safeMessageLine(requestItem.supplierNotes || item.supplierNotes);
    item.supplierStatus = "Tracking received";
    item.shopifyUpdated = `Pending - ${supplierTrackingTimestamp()}`;
    item.trackingUpdatedAt = now;
    selectedItems.push(item);
  }
  let shopify = null;
  try {
    shopify = supplierPortalBusinessId(order.businessId) === "xclusiveline" ? await updateXclusivelineSupplierTracking(env, order, selectedItems) : await createShopifyFulfillmentForSupplierRows(env, order.orderName, portalTrackingRowsFromItems(selectedItems));
    const statusText = shopify.status === "fulfilled" ? `Yes - ${supplierTrackingTimestamp()}` : `Already fulfilled or no matching lines - ${supplierTrackingTimestamp()}`;
    for (const item of selectedItems) {
      item.supplierStatus = shopify.status === "fulfilled" ? "Shipped" : "Already fulfilled";
      item.shopifyUpdated = statusText;
      item.shopifyFulfillmentId = shopify.fulfillmentId || item.shopifyFulfillmentId || "";
    }
  } catch (error) {
    shopify = { status: "failed", error: error.message };
    for (const item of selectedItems) {
      item.supplierStatus = "Tracking saved";
      item.shopifyUpdated = `Failed: ${safeMessageLine(error.message).slice(0, 180)}`;
    }
  }
  const saved = await writeSupplierPortalOrder(env, order);
  const sheet = supplierPortalBusinessId(saved.businessId) === "esntlsclub" ? await updateSupplierSheetTrackingForPortalItems(env, saved, selectedItems).catch((error) => ({
    status: "error",
    error: error.message
  })) : { status: "skipped", reason: "External business is not written to the ESNTLS Google Sheet" };
  return {
    ok: shopify.status !== "failed",
    status: shopify.status,
    orderName: saved.orderName,
    order: saved,
    shopify,
    sheet
  };
}
__name(updateSupplierPortalTracking, "updateSupplierPortalTracking");
async function sendShopifyOrderToWhatsApp(env, order, options = {}) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const key = supplierWhatsappOrderKey(order, options.deliveryId);
  if (!options.force) {
    const existing = await env.BUCKET.get(key);
    if (existing) {
      return { ok: true, status: "skipped", reason: "Order already processed", key };
    }
  }
  const built = await buildSupplierWhatsappOrder(env, order);
  const baseRecord = {
    orderId: shopifyOrderId(order),
    orderName: built.orderName,
    source: options.source || "manual",
    deliveryId: options.deliveryId || "",
    sentLineItems: built.sentLineItems,
    excludedLineItems: built.excludedLineItems,
    message: built.message,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (built.skipReason) {
    await writeWhatsappOrderLog(env, key, { ...baseRecord, status: "skipped", reason: built.skipReason });
    return { ok: true, status: "skipped", reason: built.skipReason, key, message: built.message };
  }
  if (options.dryRun !== false) {
    return { ok: true, status: "dry-run", key, orderName: built.orderName, message: built.message };
  }
  const recipients = whatsappRecipients(env);
  if (!env.WHATSAPP_ACCESS_TOKEN) throw new Error("WHATSAPP_ACCESS_TOKEN env var not set");
  if (!env.WHATSAPP_PHONE_NUMBER_ID) throw new Error("WHATSAPP_PHONE_NUMBER_ID env var not set");
  if (!recipients.length) throw new Error("Set WHATSAPP_SUPPLIER_TO and optionally WHATSAPP_OWNER_TO");
  const results = [];
  for (const recipient of recipients) {
    const response = await sendWhatsappOrderMessage(env, recipient, built.message);
    results.push({ to: maskWhatsappRecipient(recipient), ...response });
  }
  await writeWhatsappOrderLog(env, key, {
    ...baseRecord,
    status: "sent",
    sentAt: (/* @__PURE__ */ new Date()).toISOString(),
    recipients: results
  });
  return { ok: true, status: "sent", key, orderName: built.orderName, recipients: results, message: built.message };
}
__name(sendShopifyOrderToWhatsApp, "sendShopifyOrderToWhatsApp");
async function sendWhatsappOrderMessage(env, to, message) {
  if (env.WHATSAPP_TEMPLATE_NAME) {
    return sendWhatsappTemplateMessage(env, to, message);
  }
  return sendWhatsappTextMessage(env, to, message);
}
__name(sendWhatsappOrderMessage, "sendWhatsappOrderMessage");
function whatsappGraphMessagesUrl(env) {
  const version = String(env.WHATSAPP_GRAPH_VERSION || WHATSAPP_DEFAULT_GRAPH_VERSION).replace(/^\/+/, "");
  return `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}
__name(whatsappGraphMessagesUrl, "whatsappGraphMessagesUrl");
async function sendWhatsappTextMessage(env, to, message) {
  const response = await fetch(whatsappGraphMessagesUrl(env), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: message }
    })
  });
  return parseWhatsappSendResponse(response);
}
__name(sendWhatsappTextMessage, "sendWhatsappTextMessage");
async function sendWhatsappTemplateMessage(env, to, message) {
  const response = await fetch(whatsappGraphMessagesUrl(env), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: env.WHATSAPP_TEMPLATE_NAME,
        language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || "en_GB" },
        components: [{
          type: "body",
          parameters: [{ type: "text", text: message }]
        }]
      }
    })
  });
  return parseWhatsappSendResponse(response);
}
__name(sendWhatsappTemplateMessage, "sendWhatsappTemplateMessage");
async function parseWhatsappSendResponse(response) {
  const data = await readJsonResponse(response);
  if (!response.ok || data.error) {
    throw new Error(`WhatsApp API failed: ${JSON.stringify(data.error || data)}`);
  }
  return {
    providerMessageId: data.messages?.[0]?.id || "",
    providerStatus: data.messages?.[0]?.message_status || "accepted"
  };
}
__name(parseWhatsappSendResponse, "parseWhatsappSendResponse");
async function writeWhatsappOrderLog(env, key, record) {
  await env.BUCKET.put(key, JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: JSON_CONTENT_TYPE }
  });
}
__name(writeWhatsappOrderLog, "writeWhatsappOrderLog");
async function writeSupplierOrderLog(env, key, record) {
  await env.BUCKET.put(key, JSON.stringify(record, null, 2), {
    httpMetadata: { contentType: JSON_CONTENT_TYPE }
  });
}
__name(writeSupplierOrderLog, "writeSupplierOrderLog");
async function logSupplierOrderError(env, order, error, meta = {}) {
  try {
    const key = supplierOrderLogKey(order, meta.deliveryId);
    await writeSupplierOrderLog(env, key, {
      orderId: shopifyOrderId(order),
      orderName: shopifyOrderDisplayName(order),
      source: meta.source || "shopify-orders-create-webhook",
      deliveryId: meta.deliveryId || "",
      status: "error",
      error: error?.message || String(error),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (logError) {
    console.error(JSON.stringify({
      event: "supplier_order_log_failed",
      error: logError?.message || String(logError)
    }));
  }
}
__name(logSupplierOrderError, "logSupplierOrderError");
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
        sentAt: record.sentAt || "",
        createdAt: record.createdAt || "",
        reason: record.reason || "",
        error: record.error || "",
        message: record.message || "",
        recipients: record.recipients || [],
        excludedLineItems: record.excludedLineItems || []
      });
    } catch {
      logs.push({ key: object.key, uploaded: object.uploaded, status: "unreadable" });
    }
  }
  logs.sort((a, b) => String(b.createdAt || b.uploaded || "").localeCompare(String(a.createdAt || a.uploaded || "")));
  return { ok: true, logs };
}
__name(listWhatsappOrderLogs, "listWhatsappOrderLogs");
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
        appendedAt: record.appendedAt || "",
        createdAt: record.createdAt || "",
        reason: record.reason || "",
        error: record.error || "",
        excludedLineItems: record.excludedLineItems || [],
        unresolvedLineItems: record.unresolvedLineItems || []
      });
    } catch {
      logs.push({ key: object.key, uploaded: object.uploaded, status: "unreadable" });
    }
  }
  logs.sort((a, b) => String(b.createdAt || b.uploaded || "").localeCompare(String(a.createdAt || a.uploaded || "")));
  return { ok: true, logs };
}
__name(listSupplierOrderLogs, "listSupplierOrderLogs");
function sampleShopifyOrderForWhatsappTest() {
  return {
    id: `test-${Date.now()}`,
    name: "#WHATSAPP-TEST",
    shipping_address: {
      name: "Test Customer",
      address1: "1 Test Street",
      city: "London",
      zip: "SW1A 1AA",
      country: "United Kingdom"
    },
    line_items: [{
      title: "Test ESNTLS Item",
      variant_title: "UK 8",
      sku: "ESNTLS-001-UK8",
      quantity: 1
    }]
  };
}
__name(sampleShopifyOrderForWhatsappTest, "sampleShopifyOrderForWhatsappTest");
function buildShopifyImagePrompt(product, hasBackground) {
  const backgroundLine = hasBackground ? "Use the provided ESNTLS grey concrete background plate as the final background so Shopify and Wix blank products share the same backdrop." : "Replace the original background with a neutral grey concrete floor/background matching clean ESNTLS Shopify blank product photography.";
  return [
    "Create a blank placeholder product image for ESNTLS Blanks.",
    `The source image for "${product.title}" is the subject reference.`,
    backgroundLine,
    "Use the source only to understand the broad item category, color family, angle, and scale.",
    "Create a new generic blank version of the item, not the exact source product with logos removed.",
    "The output must not be recognizable as the original branded/designer item. Change model-specific details such as panel shapes, overlays, sole tooling, tread pattern, stitching layout, lace arrangement, badges, hardware, trim, and decorative shapes.",
    "Keep it believable as the same kind of product and the same general colour, but make the design clearly different and unbranded.",
    "Remove visible branding, logos, labels, tags, marks, monograms, and readable text.",
    "Final composition should be one clean square ecommerce product photo with the full item visible, centered, and comfortably surrounded by grey concrete.",
    "Use only a subtle natural contact shadow. No unrealistic shadows, no floating effect, no props, no packaging, no text, no watermark, no extra products, no model.",
    "If a hand is in the source and is needed to hold the item naturally, keep the hand realistic and unchanged; otherwise show only the item.",
    "Do not use grass or any green outdoor background."
  ].join("\n");
}
__name(buildShopifyImagePrompt, "buildShopifyImagePrompt");
async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
__name(readJsonResponse, "readJsonResponse");
async function fetchWithTimeout(url, options = {}, timeoutMs = 0, label = "Request") {
  const timeout = Number(timeoutMs || 0);
  if (!timeout) return fetch(url, options);
  const controller = new AbortController();
  const parentSignal = options.signal;
  let timer = null;
  const abortFromParent = /* @__PURE__ */ __name(() => controller.abort(parentSignal.reason), "abortFromParent");
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }
  timer = setTimeout(() => {
    controller.abort(new Error(`${label} timed out after ${Math.round(timeout / 1e3)}s`));
  }, timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !(parentSignal && parentSignal.aborted)) {
      throw new Error(`${label} timed out after ${Math.round(timeout / 1e3)}s`);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener("abort", abortFromParent);
  }
}
__name(fetchWithTimeout, "fetchWithTimeout");
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");
function shouldRetryImageDownload(status) {
  return [404, 408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status));
}
__name(shouldRetryImageDownload, "shouldRetryImageDownload");
function base64ToBlob(base64, type = "image/png") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
__name(base64ToBlob, "base64ToBlob");
function normalizeOpenAIImageMime(type, filename = "") {
  const raw = String(type || "").split(";")[0].trim().toLowerCase();
  if (raw === "image/jpeg" || raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
  if (raw === "image/png") return "image/png";
  if (raw === "image/webp") return "image/webp";
  if (raw.startsWith("image/")) return raw;
  const name = String(filename || "").toLowerCase();
  if (/\.(jpe?g)$/.test(name)) return "image/jpeg";
  if (/\.png$/.test(name)) return "image/png";
  if (/\.webp$/.test(name)) return "image/webp";
  return raw || "image/jpeg";
}
__name(normalizeOpenAIImageMime, "normalizeOpenAIImageMime");
function isOpenAIImageMime(type) {
  return ["image/jpeg", "image/png", "image/webp"].includes(String(type || "").toLowerCase());
}
__name(isOpenAIImageMime, "isOpenAIImageMime");
function requireOpenAIImageMime(type, label = "Image") {
  if (!isOpenAIImageMime(type)) {
    throw new Error(`${label} must be JPEG, PNG, or WebP. The source returned ${type || "an unknown format"}.`);
  }
  return type;
}
__name(requireOpenAIImageMime, "requireOpenAIImageMime");
async function openAIImagePart(part, fallbackFilename = "image.jpg") {
  const blob = part instanceof Blob ? part : part && part.blob;
  if (!(blob instanceof Blob)) throw new Error("Missing image blob");
  const filename = part && (part.filename || part.name) || fallbackFilename;
  const type = normalizeOpenAIImageMime(part && part.type || blob.type, filename);
  requireOpenAIImageMime(type, filename);
  const currentType = String(blob.type || "").split(";")[0].trim().toLowerCase();
  if (currentType === type) return { blob, filename };
  return { blob: new Blob([await blob.arrayBuffer()], { type }), filename };
}
__name(openAIImagePart, "openAIImagePart");
async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
__name(blobToBase64, "blobToBase64");
async function fetchImageBlob(url, label, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 5));
  let lastStatus = 0;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, { headers: { accept: "image/*,*/*" } }, Number(options.timeoutMs || 15e3), `${label} download`);
      if (response.ok) {
        const pathname = new URL(url).pathname;
        const type = normalizeOpenAIImageMime(response.headers.get("content-type"), pathname);
        return { blob: await response.blob(), type, filename: slugify(pathname.split("/").pop()) || "image" };
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
  throw new Error(`${label} download failed${lastError ? `: ${lastError.message}` : ""}`);
}
__name(fetchImageBlob, "fetchImageBlob");
function isAllowedYupooHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "yupoo.com" || host.endsWith(".yupoo.com");
}
__name(isAllowedYupooHost, "isAllowedYupooHost");
function validateYupooUrl(value, label = "Yupoo URL") {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error(`${label} must start with http or https`);
  if (!isAllowedYupooHost(parsed.hostname)) throw new Error(`${label} must be a yupoo.com link`);
  return parsed;
}
__name(validateYupooUrl, "validateYupooUrl");
function decodeHtmlEntities(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&#x3D;/gi, "=").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([a-f0-9]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
__name(decodeHtmlEntities, "decodeHtmlEntities");
function normalizeYupooHtml(html) {
  return decodeHtmlEntities(html).replace(/\\\//g, "/").replace(/\\u002f/gi, "/").replace(/\\u003a/gi, ":").replace(/\\u0026/gi, "&").replace(/\\u003d/gi, "=");
}
__name(normalizeYupooHtml, "normalizeYupooHtml");
function cleanYupooImageUrl(value, baseUrl) {
  let raw = decodeHtmlEntities(value).trim();
  if (!raw) return "";
  if (raw.startsWith("//")) raw = "https:" + raw;
  let parsed;
  try {
    parsed = new URL(raw, baseUrl);
  } catch {
    return "";
  }
  if (!isAllowedYupooHost(parsed.hostname)) return "";
  if (!/(?:^|\.)photo\.yupoo\.com$|(?:^|\.)pic\.yupoo\.com$/i.test(parsed.hostname)) return "";
  if (/\/(?:icons?|avatar|logo|qrcode)\b/i.test(parsed.pathname)) return "";
  if (/\/(?:square|small|thumb|thumbnail|tiny|medium)\.(?:jpe?g|png|webp)$/i.test(parsed.pathname)) return "";
  if (!/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(parsed.pathname + parsed.search)) return "";
  parsed.hash = "";
  return parsed.href;
}
__name(cleanYupooImageUrl, "cleanYupooImageUrl");
function uniquePush(list, seen, value) {
  if (!value || seen.has(value)) return false;
  seen.add(value);
  list.push(value);
  return true;
}
__name(uniquePush, "uniquePush");
function yupooImageFolderKey(value) {
  try {
    const parsed = new URL(value);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 3) return "";
    return parsed.origin + "/" + parts.slice(0, -1).join("/");
  } catch {
    return "";
  }
}
__name(yupooImageFolderKey, "yupooImageFolderKey");
function isGenericYupooImage(value) {
  try {
    return /\/(?:big|square|small|thumb|thumbnail|tiny|medium)\.(?:jpe?g|png|webp)$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}
__name(isGenericYupooImage, "isGenericYupooImage");
function addYupooImage(list, seen, value) {
  if (!value || seen.has(value)) return false;
  const folder = yupooImageFolderKey(value);
  if (folder) {
    const existingIndex = list.findIndex((item) => yupooImageFolderKey(item) === folder);
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
__name(addYupooImage, "addYupooImage");
function extractYupooImageUrls(html, pageUrl) {
  const normalized = normalizeYupooHtml(html);
  const images = [];
  const seen = /* @__PURE__ */ new Set();
  const directRe = /((?:https?:)?\/\/(?:photo|pic)\.yupoo\.com\/[^"'<>\s\\)]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\s\\)]*)?)/gi;
  for (const match of normalized.matchAll(directRe)) {
    uniquePush(images, seen, cleanYupooImageUrl(match[1], pageUrl));
  }
  return images;
}
__name(extractYupooImageUrls, "extractYupooImageUrls");
function extractYupooPageLinks(html, pageUrl) {
  const normalized = normalizeYupooHtml(html);
  const base = new URL(pageUrl);
  const links = [];
  const seen = /* @__PURE__ */ new Set([base.href]);
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
    if (parsed.pathname === "/" || parsed.pathname === base.pathname && parsed.search === base.search) continue;
    if (/\/(?:categories|collections|tag|search|login|about|contact)\b/i.test(parsed.pathname)) continue;
    parsed.hash = "";
    uniquePush(links, seen, parsed.href);
    if (links.length >= YUPOO_PAGE_CRAWL_LIMIT) break;
  }
  return links;
}
__name(extractYupooPageLinks, "extractYupooPageLinks");
function yupooImageName(imageUrl, index) {
  let name = "";
  try {
    const parsed = new URL(imageUrl);
    name = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
  } catch {
  }
  name = name.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "");
  if (!/\.(?:jpe?g|png|webp)$/i.test(name)) name = `${name || "image"}.jpg`;
  return `yupoo_${String(index + 1).padStart(2, "0")}_${name}`;
}
__name(yupooImageName, "yupooImageName");
async function fetchYupooHtml(pageUrl) {
  const response = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ESNTLSPhotoStudio/1.0)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  if (!response.ok) throw new Error(`Yupoo page fetch failed: HTTP ${response.status}`);
  return response.text();
}
__name(fetchYupooHtml, "fetchYupooHtml");
async function listYupooImages(rawUrl, requestedLimit) {
  const start = validateYupooUrl(rawUrl);
  const parsedLimit = parseInt(requestedLimit || YUPOO_IMPORT_LIMIT, 10);
  const limit = Math.min(Math.max(parsedLimit || YUPOO_IMPORT_LIMIT, 1), YUPOO_IMPORT_LIMIT);
  if (/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(start.pathname + start.search)) {
    const direct = cleanYupooImageUrl(start.href, start.href);
    return { ok: true, sourceUrl: start.href, count: direct ? 1 : 0, images: direct ? [{ url: direct, name: yupooImageName(direct, 0) }] : [] };
  }
  const queue = [start.href];
  const seenPages = /* @__PURE__ */ new Set();
  const seenImages = /* @__PURE__ */ new Set();
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
__name(listYupooImages, "listYupooImages");
async function proxyYupooImage(rawUrl) {
  const parsed = validateYupooUrl(rawUrl, "Yupoo image URL");
  const imageUrl = cleanYupooImageUrl(parsed.href, parsed.href);
  if (!imageUrl) throw new Error("URL is not a supported Yupoo image");
  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ESNTLSPhotoStudio/1.0)",
      "Accept": "image/jpeg,image/png,image/webp,image/*;q=0.8,*/*;q=0.2",
      "Referer": parsed.origin + "/"
    }
  });
  if (!response.ok) throw new Error(`Yupoo image download failed: HTTP ${response.status}`);
  const type = normalizeOpenAIImageMime(response.headers.get("content-type"), imageUrl);
  if (!type.startsWith("image/")) throw new Error("Yupoo URL did not return an image");
  requireOpenAIImageMime(type, "Yupoo image");
  return new Response(response.body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": type,
      "Cache-Control": "public, max-age=3600"
    }
  });
}
__name(proxyYupooImage, "proxyYupooImage");
async function requestOpenAIImageEdit(env, product, source, background, model, size) {
  const form = new FormData();
  const sourcePart = await openAIImagePart(source, "source.jpg");
  const backgroundPart = background ? await openAIImagePart(background, "esntls-background.jpg") : null;
  form.append("model", model);
  form.append("prompt", buildShopifyImagePrompt(product, !!background));
  form.append("size", size);
  if (env.OPENAI_IMAGE_QUALITY) form.append("quality", env.OPENAI_IMAGE_QUALITY);
  if (backgroundPart) {
    form.append("image[]", sourcePart.blob, sourcePart.filename);
    form.append("image[]", backgroundPart.blob, backgroundPart.filename);
  } else {
    form.append("image", sourcePart.blob, sourcePart.filename);
  }
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`OpenAI image generation failed: ${JSON.stringify(data)}`);
  const first = data.data && data.data[0];
  if (first && first.b64_json) return base64ToBlob(first.b64_json, "image/png");
  if (first && first.url) {
    const imageResponse = await fetch(first.url);
    if (!imageResponse.ok) throw new Error(`Generated image URL download failed: ${imageResponse.status}`);
    return imageResponse.blob();
  }
  throw new Error(`OpenAI image response did not include b64_json or url: ${JSON.stringify(data)}`);
}
__name(requestOpenAIImageEdit, "requestOpenAIImageEdit");
function grassReplacementPrompt(productName = "uploaded product") {
  return [
    "Use case: realistic ecommerce flat-lay background replacement for ESNTLSCLUB.",
    `Input image 1 is the product photo named "${String(productName || "uploaded product").trim() || "uploaded product"}".`,
    "Input image 2 is the original ESNTLSCLUB green grass background. Use it as the physical ground surface that the product is lying on.",
    "Create a 3:4 overhead flat-lay product photo where the product appears naturally placed on that exact supplied grass background.",
    "Preserve the product exactly: its shape, silhouette, colour, logos, printed text, texture, stitching, fabric grain, mesh holes, tags, defects, marks, wear, folds, and edge details.",
    "Preserve the exact number of products shown. Do not add duplicates, alternative colourways, extra garments, props, or a different arrangement. If the input contains a group or set, keep the same items and overlap order.",
    "Preserve any existing hands, arms, hangers, packaging, and other foreground details exactly. Do not add or remove them.",
    "Do not smooth, repaint, recolour, relight, retouch, redesign, clean, repair, de-wrinkle, upscale, or restyle the product. Avoid AI smoothing and retain the genuine fabric and material texture.",
    "Preserve the supplied ESNTLSCLUB background's exact green grass colour, texture, blade pattern, lighting, and natural imperfections. Do not replace it with different grass or generate a new outdoor environment.",
    "Do not invent, duplicate, extend, or add ESNTLSCLUB text, logos, watermarks, labels, props, hands, hangers, flowers, plants, soil, walls, or scenery.",
    "Only add subtle realism where the product touches the grass: a soft natural contact shadow, slight grass compression, and a small amount of grass naturally overlapping the lowest product edges.",
    "Shadows must be soft and believable. Do not create dramatic, floating, glossy, harsh, oversized, or unrealistic shadows.",
    "Keep realistic product scale and perspective. Size the product proportionally to the background like a genuine overhead photograph, not an oversized pasted cutout.",
    "Leave visible green grass around the product on every side. Most clothing should fill approximately 50-68% of the canvas. Shoes, watches, jewellery, and smaller accessories should appear proportionally smaller.",
    "Do not let the product touch the image borders unless it is already intentionally cropped in the source image.",
    "Centre the product like a clean ecommerce flat-lay. The result should look naturally photographed on grass, not AI-generated or digitally composited.",
    "If anything is uncertain, prioritise preserving the uploaded product and supplied grass background over inventing or improving details."
  ].join(" ");
}
__name(grassReplacementPrompt, "grassReplacementPrompt");
function buildGrassImagePrompt(prompt, hasReferences = false) {
  const fallback = grassReplacementPrompt();
  const referenceLine = hasReferences ? "Use the additional reference images only to match the finished ESNTLS artificial-grass product-photo look: real phone photo, natural scale, camera distance, soft grounding, and grass texture. Do not copy or add products, boxes, cards, logos, stickers, packaging, hands, props, text, or layout from the reference images." : "";
  return [String(prompt || fallback).trim() || fallback, referenceLine].filter(Boolean).join(" ");
}
__name(buildGrassImagePrompt, "buildGrassImagePrompt");
async function requestOpenAIGrassImageEdit(env, source, background, prompt, model, size, quality, references = [], options = {}) {
  const form = new FormData();
  const sourcePart = await openAIImagePart(source, "product.jpg");
  const backgroundPart = background ? await openAIImagePart(background, "esntls-background.jpg") : null;
  form.append("model", model);
  form.append("image[]", sourcePart.blob, sourcePart.filename);
  if (backgroundPart) form.append("image[]", backgroundPart.blob, backgroundPart.filename);
  for (const reference of references.slice(0, 6)) {
    const referencePart = await openAIImagePart(reference, reference.filename || "esntls-reference.jpg");
    form.append("image[]", referencePart.blob, referencePart.filename);
  }
  form.append("prompt", buildGrassImagePrompt(prompt, references.length > 0));
  form.append("size", size);
  if (quality) form.append("quality", quality);
  if (model === "gpt-image-1" || model.startsWith("gpt-image-1.5")) {
    form.append("input_fidelity", "high");
  }
  form.append("n", "1");
  const timeoutMs = Number(options.timeoutMs || 0);
  const response = await fetchWithTimeout("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form
  }, timeoutMs, `${model} image generation`);
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`${model}: OpenAI image generation failed: ${JSON.stringify(data)}`);
  const first = data.data && data.data[0];
  if (first && first.b64_json) return { blob: base64ToBlob(first.b64_json, "image/png"), model, size };
  if (first && first.url) {
    const imageResponse = await fetchWithTimeout(first.url, {}, Number(options.downloadTimeoutMs || 3e4), `${model} generated image download`);
    if (!imageResponse.ok) throw new Error(`${model}: Generated image URL download failed: ${imageResponse.status}`);
    return { blob: await imageResponse.blob(), model, size };
  }
  throw new Error(`${model}: OpenAI image response did not include b64_json or url: ${JSON.stringify(data)}`);
}
__name(requestOpenAIGrassImageEdit, "requestOpenAIGrassImageEdit");
async function createGrassPreview(env, formData) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY env var not set");
  const image = formData.get("image") || formData.get("image[]");
  if (!(image instanceof Blob)) throw new Error("Missing image file");
  let backgroundFile = formData.get("background");
  let background = null;
  if (backgroundFile instanceof Blob) {
    background = {
      blob: backgroundFile,
      type: normalizeOpenAIImageMime(backgroundFile.type, backgroundFile.name),
      filename: backgroundFile.name || "esntls-background.jpg"
    };
  } else {
    const backgroundUrl = env.GRASS_BACKGROUND_IMAGE_URL || DEFAULT_GRASS_BACKGROUND_URL;
    background = await fetchImageBlob(backgroundUrl, "Grass background image");
  }
  const source = {
    blob: image,
    type: normalizeOpenAIImageMime(image.type, image.name),
    filename: image.name || "product.jpg"
  };
  const prompt = formData.get("prompt") || "";
  const quality = formData.get("quality") || env.OPENAI_IMAGE_QUALITY || "medium";
  const referenceFiles = [
    ...formData.getAll("reference"),
    ...formData.getAll("reference[]")
  ].filter((item) => item instanceof Blob).map((file, index) => ({
    blob: file,
    type: normalizeOpenAIImageMime(file.type, file.name),
    filename: file.name || `esntls-reference-${index + 1}.jpg`
  }));
  const referenceUrls = [
    ...formData.getAll("referenceUrl"),
    ...formData.getAll("referenceUrl[]")
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const references = [...referenceFiles];
  for (const referenceUrl of referenceUrls.slice(0, Math.max(0, 6 - references.length))) {
    references.push(await fetchImageBlob(referenceUrl, "Reference image"));
  }
  try {
    const result = await requestOpenAIGrassImageEdit(
      env,
      source,
      background,
      prompt,
      env.OPENAI_GRASS_IMAGE_MODEL || env.OPENAI_IMAGE_MODEL || "gpt-image-2",
      env.OPENAI_GRASS_IMAGE_SIZE || "768x1024",
      quality,
      references
    );
    return {
      ok: true,
      b64: await blobToBase64(result.blob),
      contentType: result.blob.type || "image/png",
      model: result.model,
      size: result.size
    };
  } catch (primaryError) {
    const result = await requestOpenAIGrassImageEdit(
      env,
      source,
      background,
      prompt,
      env.OPENAI_GRASS_FALLBACK_MODEL || "gpt-image-1",
      env.OPENAI_GRASS_FALLBACK_SIZE || "1024x1536",
      quality,
      references
    );
    return {
      ok: true,
      b64: await blobToBase64(result.blob),
      contentType: result.blob.type || "image/png",
      model: result.model,
      size: result.size,
      fallbackReason: primaryError.message
    };
  }
}
__name(createGrassPreview, "createGrassPreview");
async function createGrassJob(req, env, formData, ctx) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY env var not set");
  const images = [
    ...formData.getAll("image"),
    ...formData.getAll("image[]")
  ].filter((item) => item instanceof Blob);
  if (!images.length) throw new Error("Missing image file");
  const maxImages = Math.max(1, Math.min(Number(env.GRASS_JOB_MAX_IMAGES || 24), 40));
  const selectedImages = images.slice(0, maxImages);
  const jobId = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const prefix = grassJobPrefix(jobId);
  const promptList = [
    ...formData.getAll("prompt[]"),
    ...formData.getAll("prompts[]")
  ].map((value) => String(value || "").trim());
  const fallbackPrompt = String(formData.get("prompt") || "").trim();
  const quality = String(formData.get("quality") || env.OPENAI_IMAGE_QUALITY || "medium").trim() || "medium";
  const referenceUrls = [
    ...formData.getAll("referenceUrl"),
    ...formData.getAll("referenceUrl[]")
  ].map((value) => String(value || "").trim()).filter(Boolean).slice(0, 6);
  let background = { kind: "default", url: env.GRASS_BACKGROUND_IMAGE_URL || DEFAULT_GRASS_BACKGROUND_URL };
  const backgroundFile = formData.get("background");
  const backgroundUrl = String(formData.get("backgroundUrl") || "").trim();
  if (backgroundFile instanceof Blob) {
    const filename = safeJobFilename(backgroundFile.name || "esntls-background.jpg");
    const contentType = requireOpenAIImageMime(normalizeOpenAIImageMime(backgroundFile.type, filename), "Background image");
    const key = `${prefix}background/${crypto.randomUUID()}-${filename}`;
    await env.BUCKET.put(key, backgroundFile, {
      httpMetadata: { contentType, cacheControl: "private, max-age=604800" },
      customMetadata: { createdBy: "esntls-grass-job", role: "background" }
    });
    background = { kind: "stored", key, filename, contentType };
  } else if (backgroundUrl) {
    background = { kind: "url", url: backgroundUrl };
  }
  const items = [];
  for (let i = 0; i < selectedImages.length; i++) {
    const image = selectedImages[i];
    const filename = safeJobFilename(image.name || `product-${i + 1}.jpg`);
    const contentType = requireOpenAIImageMime(normalizeOpenAIImageMime(image.type, filename), `Product image ${i + 1}`);
    const key = `${prefix}sources/${String(i + 1).padStart(2, "0")}-${crypto.randomUUID()}-${filename}`;
    await env.BUCKET.put(key, image, {
      httpMetadata: { contentType, cacheControl: "private, max-age=604800" },
      customMetadata: { createdBy: "esntls-grass-job", role: "source" }
    });
    items.push({
      id: crypto.randomUUID(),
      index: i,
      status: "queued",
      sourceKey: key,
      originalName: filename,
      contentType,
      prompt: promptList[i] || fallbackPrompt || grassReplacementPrompt(filename),
      createdAt: now
    });
  }
  const job = {
    id: jobId,
    status: "queued",
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
  const queue = await enqueueGrassJob(env, job.id, ctx, "created");
  return json({ ok: true, job: publicGrassJob(job), queue }, 202);
}
__name(createGrassJob, "createGrassJob");
async function getGrassJobs(req, env, ctx) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    let job = await readGrassJob(env, id);
    if (!job) return json({ error: "Background job was not found" }, 404);
    if (isStaleGrassJob(job)) {
      job = await resumeGrassJob(env, job, ctx, "stale-read-recovery");
    }
    return json({ ok: true, job: publicGrassJob(job) });
  }
  const listed = await env.BUCKET.list({ prefix: GRASS_JOB_ROOT, limit: 100 });
  const jobs = [];
  for (const object of listed.objects || []) {
    if (!object.key.endsWith("/job.json")) continue;
    const record = await env.BUCKET.get(object.key);
    if (!record) continue;
    try {
      jobs.push(publicGrassJob(await record.json(), { includeItems: false }));
    } catch {
    }
  }
  jobs.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 12), 30));
  return json({ ok: true, jobs: jobs.slice(0, limit), truncated: listed.truncated, cursor: listed.cursor || null });
}
__name(getGrassJobs, "getGrassJobs");
async function resumeGrassJobFromRequest(req, env, ctx) {
  const body = await req.json().catch(() => ({}));
  const id = body.id || new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "Missing background job id" }, 400);
  const job = await readGrassJob(env, id);
  if (!job) return json({ error: "Background job was not found" }, 404);
  if (isGrassJobTerminal(job.status)) return json({ ok: true, job: publicGrassJob(job), alreadyFinished: true });
  const resumed = await resumeGrassJob(env, job, ctx, "manual-resume");
  return json({ ok: true, job: publicGrassJob(resumed) }, 202);
}
__name(resumeGrassJobFromRequest, "resumeGrassJobFromRequest");
async function retryFailedGrassJob(req, env, ctx) {
  const body = await req.json().catch(() => ({}));
  const id = body.id || new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "Missing background job id" }, 400);
  const job = await readGrassJob(env, id);
  if (!job) return json({ error: "Background job was not found" }, 404);
  let retried = 0;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const item of job.items || []) {
    if (item.status !== "failed") continue;
    item.status = "queued";
    item.error = null;
    item.finishedAt = null;
    item.retriedAt = now;
    item.retryCount = Number(item.retryCount || 0) + 1;
    retried++;
  }
  if (!retried) return json({ ok: true, job: publicGrassJob(job), retried: 0 });
  job.status = "queued";
  job.finishedAt = null;
  job.failed = 0;
  job.completed = (job.items || []).filter((item) => item.status === "complete").length;
  job.cancelled = (job.items || []).filter((item) => item.status === "cancelled").length;
  await writeGrassJob(env, job);
  const queue = await enqueueGrassJob(env, job.id, ctx, "retry-failed");
  const queuedJob = await readGrassJob(env, job.id);
  return json({ ok: true, retried, job: publicGrassJob(queuedJob || job), queue }, 202);
}
__name(retryFailedGrassJob, "retryFailedGrassJob");
async function cancelGrassJob(req, env) {
  const body = await req.json().catch(() => ({}));
  const id = body.id || new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "Missing background job id" }, 400);
  const job = await readGrassJob(env, id);
  if (!job) return json({ error: "Background job was not found" }, 404);
  if (isGrassJobTerminal(job.status)) return json({ ok: true, job: publicGrassJob(job), alreadyFinished: true });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const item of job.items || []) {
    if (["queued", "running"].includes(item.status)) {
      item.status = "cancelled";
      item.error = null;
      item.cancelledAt = now;
    }
  }
  job.status = "cancelled";
  job.cancelledAt = now;
  job.finishedAt = now;
  job.completed = (job.items || []).filter((item) => item.status === "complete").length;
  job.failed = (job.items || []).filter((item) => item.status === "failed").length;
  job.cancelled = (job.items || []).filter((item) => item.status === "cancelled").length;
  await writeGrassJob(env, job);
  return json({ ok: true, job: publicGrassJob(job) });
}
__name(cancelGrassJob, "cancelGrassJob");
async function enqueueGrassJob(env, jobId, ctx, reason) {
  const job = await readGrassJob(env, jobId);
  if (!job || isGrassJobTerminal(job.status)) return { method: "none", count: 0 };
  const pending = (job.items || []).map((item, index) => ({ item, index })).filter(({ item }) => item && item.status === "queued");
  if (!pending.length) return { method: "none", count: 0 };
  if (!env.GRASS_JOB_QUEUE || typeof env.GRASS_JOB_QUEUE.sendBatch !== "function") {
    throw new Error("The ESNTLS background queue is not configured");
  }
  job.queue = {
    method: "queue",
    reason,
    count: pending.length,
    enqueuedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeGrassJob(env, job);
  const messages = pending.map(({ item, index }) => ({
    body: { type: "esntls-grass-job-item", jobId, itemId: item.id, index }
  }));
  for (let index = 0; index < messages.length; index += 100) {
    await env.GRASS_JOB_QUEUE.sendBatch(messages.slice(index, index + 100));
  }
  return { method: "queue", reason, count: messages.length, enqueuedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
__name(enqueueGrassJob, "enqueueGrassJob");
async function resumeGrassJob(env, job, ctx, reason) {
  for (const item of job.items || []) {
    if (item.status === "running") {
      item.status = "queued";
      item.error = null;
      item.resumedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
  }
  job.status = "queued";
  job.finishedAt = null;
  await writeGrassJob(env, job);
  await enqueueGrassJob(env, job.id, ctx, reason);
  return await readGrassJob(env, job.id) || job;
}
__name(resumeGrassJob, "resumeGrassJob");
async function processGrassJobItem(env, jobId, itemId, fallbackIndex, options = {}) {
  let job = await readGrassJob(env, jobId);
  if (!job || isGrassJobTerminal(job.status)) return;
  const foundIndex = (job.items || []).findIndex((item2) => item2.id === itemId);
  const index = foundIndex >= 0 ? foundIndex : fallbackIndex;
  const item = job.items[index];
  if (!item || ["complete", "failed", "cancelled"].includes(item.status)) {
    await finalizeGrassJob(env, jobId);
    return;
  }
  if (item.status === "running" && !options.force) {
    const attemptedAt = grassItemAttemptTime(item);
    if (Number.isFinite(attemptedAt) && Date.now() - attemptedAt <= GRASS_JOB_STALE_AFTER_MS) return;
  }
  item.status = "running";
  item.startedAt = item.startedAt || (/* @__PURE__ */ new Date()).toISOString();
  item.lastAttemptAt = (/* @__PURE__ */ new Date()).toISOString();
  item.error = null;
  job.status = "running";
  job.startedAt = job.startedAt || (/* @__PURE__ */ new Date()).toISOString();
  job.finishedAt = null;
  await writeGrassJob(env, job);
  try {
    const source = await grassJobBlobPart(env, item.sourceKey, item.originalName);
    const background = await grassJobBackgroundPart(env, job);
    const references = await grassJobReferenceParts(job.referenceUrls || []);
    const generated = await generateGrassJobImage(env, source, background, item.prompt, job.quality, references, options);
    const latest = await readGrassJob(env, jobId);
    if (!latest || latest.status === "cancelled") return;
    const latestIndex = (latest.items || []).findIndex((entry) => entry.id === item.id);
    const latestItem = latest.items[latestIndex >= 0 ? latestIndex : index];
    if (!latestItem || latestItem.status === "cancelled") return;
    const bytes = new Uint8Array(await generated.blob.arrayBuffer());
    const filename = outputGrassJobFilename(item.originalName, generated.blob.type);
    const key = `${grassJobPrefix(jobId)}outputs/${String((latestIndex >= 0 ? latestIndex : index) + 1).padStart(2, "0")}-${crypto.randomUUID()}-${filename}`;
    await env.BUCKET.put(key, bytes, {
      httpMetadata: { contentType: generated.blob.type || "image/png", cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { createdBy: "esntls-grass-job", source: item.originalName || "" }
    });
    latestItem.status = "complete";
    latestItem.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
    latestItem.error = null;
    latestItem.result = {
      key,
      url: PUBLIC_BASE + key,
      filename,
      contentType: generated.blob.type || "image/png",
      size: bytes.byteLength,
      model: generated.model,
      imageSize: generated.size,
      fallbackReason: generated.fallbackReason || ""
    };
    await writeGrassJob(env, latest);
  } catch (error) {
    const latest = await readGrassJob(env, jobId);
    if (!latest || latest.status === "cancelled") return;
    const latestIndex = (latest.items || []).findIndex((entry) => entry.id === item.id);
    const latestItem = latest.items[latestIndex >= 0 ? latestIndex : index];
    if (latestItem && latestItem.status !== "cancelled") {
      latestItem.status = "failed";
      latestItem.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
      latestItem.error = error.message || "Generation failed";
      await writeGrassJob(env, latest);
    }
  }
  await finalizeGrassJob(env, jobId);
}
__name(processGrassJobItem, "processGrassJobItem");
async function generateGrassJobImage(env, source, background, prompt, quality, references, options = {}) {
  const timeoutMs = Math.max(15e3, Number(options.timeoutMs || env.GRASS_JOB_OPENAI_TIMEOUT_MS || GRASS_JOB_OPENAI_TIMEOUT_MS));
  try {
    return await requestOpenAIGrassImageEdit(
      env,
      source,
      background,
      prompt,
      env.OPENAI_GRASS_IMAGE_MODEL || env.OPENAI_IMAGE_MODEL || "gpt-image-2",
      env.OPENAI_GRASS_IMAGE_SIZE || "768x1024",
      quality,
      references,
      { timeoutMs }
    );
  } catch (primaryError) {
    if (/timed out after/i.test(primaryError.message || "")) throw primaryError;
    const result = await requestOpenAIGrassImageEdit(
      env,
      source,
      background,
      prompt,
      env.OPENAI_GRASS_FALLBACK_MODEL || "gpt-image-1",
      env.OPENAI_GRASS_FALLBACK_SIZE || "1024x1536",
      quality,
      references,
      { timeoutMs }
    );
    return { ...result, fallbackReason: primaryError.message };
  }
}
__name(generateGrassJobImage, "generateGrassJobImage");
async function finalizeGrassJob(env, jobId) {
  const job = await readGrassJob(env, jobId);
  if (!job) return null;
  job.completed = (job.items || []).filter((item) => item.status === "complete").length;
  job.failed = (job.items || []).filter((item) => item.status === "failed").length;
  job.cancelled = (job.items || []).filter((item) => item.status === "cancelled").length;
  const total = job.total || (job.items || []).length || 0;
  if (job.status === "cancelled") {
    job.finishedAt = job.finishedAt || (/* @__PURE__ */ new Date()).toISOString();
  } else if (job.completed + job.failed + job.cancelled >= total) {
    job.status = job.completed === total ? "complete" : job.completed > 0 ? "partial" : job.cancelled ? "cancelled" : "failed";
    job.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  } else {
    job.status = "running";
    job.finishedAt = null;
  }
  await writeGrassJob(env, job);
  return job;
}
__name(finalizeGrassJob, "finalizeGrassJob");
function grassItemAttemptTime(item) {
  return Date.parse(item.lastAttemptAt || item.startedAt || item.createdAt || "");
}
__name(grassItemAttemptTime, "grassItemAttemptTime");
function resetStaleGrassJobItems(job, force = false) {
  const now = Date.now();
  let reset = 0;
  for (const item of job.items || []) {
    if (item.status !== "running") continue;
    const attemptAt = grassItemAttemptTime(item);
    const stale = !Number.isFinite(attemptAt) || now - attemptAt > GRASS_JOB_STALE_AFTER_MS;
    if (!force && !stale) continue;
    item.status = "queued";
    item.error = null;
    item.resumedAt = (/* @__PURE__ */ new Date()).toISOString();
    reset++;
  }
  if (reset) {
    job.status = "queued";
    job.finishedAt = null;
  }
  return reset;
}
__name(resetStaleGrassJobItems, "resetStaleGrassJobItems");
async function processNextGrassJobItem(env, jobId, options = {}) {
  let job = await readGrassJob(env, jobId);
  if (!job) throw new Error("Background job was not found");
  if (isGrassJobTerminal(job.status)) return job;
  const reset = resetStaleGrassJobItems(job, !!options.force);
  if (reset) await writeGrassJob(env, job);
  job = await readGrassJob(env, jobId) || job;
  if ((job.items || []).some((item2) => item2.status === "running")) return job;
  const index = (job.items || []).findIndex((item2) => item2.status === "queued");
  if (index < 0) return await finalizeGrassJob(env, jobId) || job;
  const item = job.items[index];
  await processGrassJobItem(env, jobId, item.id, index, {
    timeoutMs: Math.max(15e3, Number(options.timeoutMs || env.GRASS_JOB_FOREGROUND_TIMEOUT_MS || GRASS_JOB_FOREGROUND_TIMEOUT_MS))
  });
  return await readGrassJob(env, jobId) || job;
}
__name(processNextGrassJobItem, "processNextGrassJobItem");
function grassJobPrefix(jobId) {
  return `${GRASS_JOB_ROOT}${jobId}/`;
}
__name(grassJobPrefix, "grassJobPrefix");
function grassJobRecordKey(jobId) {
  return `${grassJobPrefix(jobId)}job.json`;
}
__name(grassJobRecordKey, "grassJobRecordKey");
async function readGrassJob(env, jobId) {
  const object = await env.BUCKET.get(grassJobRecordKey(jobId));
  if (!object) return null;
  return await object.json();
}
__name(readGrassJob, "readGrassJob");
async function writeGrassJob(env, job) {
  const record = { ...job, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await env.BUCKET.put(grassJobRecordKey(job.id), JSON.stringify(record, null, 2) + "\n", {
    httpMetadata: { contentType: JSON_CONTENT_TYPE, cacheControl: "private, max-age=0, no-store" },
    customMetadata: { createdBy: "esntls-grass-job", role: "record" }
  });
  return record;
}
__name(writeGrassJob, "writeGrassJob");
function isGrassJobTerminal(status) {
  return GRASS_JOB_TERMINAL_STATUSES.includes(String(status || ""));
}
__name(isGrassJobTerminal, "isGrassJobTerminal");
function isStaleGrassJob(job) {
  if (!job || isGrassJobTerminal(job.status)) return false;
  if (job.queue?.method === "queue") return false;
  const updatedAt = Date.parse(job.updatedAt || job.startedAt || job.createdAt || "");
  if (!Number.isFinite(updatedAt)) return false;
  const incomplete = Number(job.completed || 0) + Number(job.failed || 0) + Number(job.cancelled || 0) < Number(job.total || job.items?.length || 0);
  return incomplete && Date.now() - updatedAt > GRASS_JOB_STALE_AFTER_MS;
}
__name(isStaleGrassJob, "isStaleGrassJob");
function publicGrassJob(job, options = {}) {
  const includeItems = options.includeItems !== false;
  const publicValue = {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    quality: job.quality || "medium",
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
__name(publicGrassJob, "publicGrassJob");
async function grassJobBlobPart(env, key, fallbackFilename) {
  const object = await env.BUCKET.get(key);
  if (!object) throw new Error("Stored job source image was not found");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const contentType = requireOpenAIImageMime(normalizeOpenAIImageMime(headers.get("content-type"), fallbackFilename || key), fallbackFilename || key);
  return {
    blob: new Blob([await object.arrayBuffer()], { type: contentType }),
    type: contentType,
    filename: fallbackFilename || key.split("/").pop() || "image.jpg"
  };
}
__name(grassJobBlobPart, "grassJobBlobPart");
async function grassJobBackgroundPart(env, job) {
  if (job.background?.kind === "stored" && job.background.key) {
    return await grassJobBlobPart(env, job.background.key, job.background.filename || "esntls-background.jpg");
  }
  const url = job.background?.url || env.GRASS_BACKGROUND_IMAGE_URL || DEFAULT_GRASS_BACKGROUND_URL;
  return await fetchImageBlob(url, "Grass background image");
}
__name(grassJobBackgroundPart, "grassJobBackgroundPart");
async function grassJobReferenceParts(referenceUrls) {
  const references = [];
  for (const referenceUrl of (referenceUrls || []).slice(0, 6)) {
    references.push(await fetchImageBlob(referenceUrl, "Reference image"));
  }
  return references;
}
__name(grassJobReferenceParts, "grassJobReferenceParts");
function safeJobFilename(value) {
  const clean = String(value || "image.jpg").replace(/[\/'\\?%*:|"<>]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return clean || "image.jpg";
}
__name(safeJobFilename, "safeJobFilename");
function extensionForContentType(contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/avif") return "avif";
  return "png";
}
__name(extensionForContentType, "extensionForContentType");
function outputGrassJobFilename(originalName, contentType) {
  const base = safeJobFilename(originalName || "esntls-grass-output.png").replace(/\.[a-z0-9]+$/i, "") || "esntls-grass-output";
  return `${base}-grass.${extensionForContentType(contentType)}`;
}
__name(outputGrassJobFilename, "outputGrassJobFilename");
function validateR2ObjectKey(value, label) {
  const key = String(value || "").trim();
  if (!key) throw new Error(`${label} is required`);
  if (key.startsWith("/") || key.includes("..") || key.includes("\\")) throw new Error(`${label} is invalid`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/.test(key)) throw new Error(`${label} contains unsupported characters`);
  return key;
}
__name(validateR2ObjectKey, "validateR2ObjectKey");
function validateR2ImageKey(value, label) {
  const key = validateR2ObjectKey(value, label);
  if (!/\.(?:jpe?g|png|webp|gif|avif)$/i.test(key)) throw new Error(`${label} must be an image key`);
  return key;
}
__name(validateR2ImageKey, "validateR2ImageKey");
function contentTypeFromImageKey(key) {
  if (/\.jpe?g$/i.test(key)) return "image/jpeg";
  if (/\.png$/i.test(key)) return "image/png";
  if (/\.webp$/i.test(key)) return "image/webp";
  if (/\.gif$/i.test(key)) return "image/gif";
  if (/\.avif$/i.test(key)) return "image/avif";
  return "application/octet-stream";
}
__name(contentTypeFromImageKey, "contentTypeFromImageKey");
async function getSupplierSheetImage(req, env, parts) {
  if (!env.BUCKET) return json({ error: "BUCKET binding is not configured" }, 500);
  let key;
  try {
    key = validateR2ImageKey(parts.slice(1).map((part) => decodeURIComponent(part)).join("/"), "image key");
  } catch {
    return json({ error: "Invalid image key" }, 400);
  }
  const object = await env.BUCKET.get(key);
  if (!object) return json({ error: "Image not found" }, 404);
  const headers = new Headers(cors);
  object.writeHttpMetadata(headers);
  if (!headers.get("Content-Type")) headers.set("Content-Type", contentTypeFromImageKey(key));
  if (!headers.get("Cache-Control")) headers.set("Cache-Control", "public, max-age=86400");
  headers.set("X-Robots-Tag", "noindex");
  return new Response(req.method === "HEAD" ? null : object.body, { headers });
}
__name(getSupplierSheetImage, "getSupplierSheetImage");
async function copyR2Object(env, requestBody) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const sourceKey = validateR2ImageKey(requestBody.sourceKey, "sourceKey");
  const destKey = validateR2ImageKey(requestBody.destKey, "destKey");
  const object = await env.BUCKET.get(sourceKey);
  if (!object) throw new Error("Source image was not found");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const contentType = normalizeOpenAIImageMime(headers.get("content-type"), sourceKey);
  await env.BUCKET.put(destKey, await object.arrayBuffer(), {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { createdBy: "esntls-admin-copy", sourceKey }
  });
  return { ok: true, sourceKey, key: destKey, url: PUBLIC_BASE + destKey };
}
__name(copyR2Object, "copyR2Object");
function sourceImageFromRequestBody(value) {
  const source = value && typeof value === "object" ? value : null;
  const base64 = String(source?.base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!base64) return null;
  const filename = slugify(source.filename || "source-image") || "source-image";
  const type = normalizeOpenAIImageMime(source.contentType, filename);
  return { blob: base64ToBlob(base64, type), type, filename };
}
__name(sourceImageFromRequestBody, "sourceImageFromRequestBody");
function studioMediaKeyFromUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (!url.pathname.startsWith("/media/")) return "";
  const key = url.pathname.slice("/media/".length).split("/").map((part) => decodeURIComponent(part)).join("/");
  return key.startsWith("photo-studio-v2/generated/") ? key : "";
}
__name(studioMediaKeyFromUrl, "studioMediaKeyFromUrl");
async function sourceImageFromStudioMedia(env, value) {
  if (!env.ESNTLS_STUDIO_MEDIA) return null;
  const key = studioMediaKeyFromUrl(value);
  if (!key) return null;
  const object = await env.ESNTLS_STUDIO_MEDIA.get(key);
  if (!object) return null;
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const filename = slugify(key.split("/").pop()) || "source-image";
  const type = normalizeOpenAIImageMime(headers.get("content-type"), filename);
  return { blob: new Blob([await object.arrayBuffer()], { type }), type, filename };
}
__name(sourceImageFromStudioMedia, "sourceImageFromStudioMedia");
async function generateBlankImage(env, product, sourceOverride = null) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY env var not set");
  if (!product.image) throw new Error("Product is missing an image");
  const source = sourceOverride || await sourceImageFromStudioMedia(env, product.image) || await fetchImageBlob(product.image, "Source image");
  let background = null;
  const backgroundUrls = splitList(env.SHOPIFY_BLANK_BACKGROUND_URL);
  if (!backgroundUrls.length) backgroundUrls.push(DEFAULT_BACKGROUND_URL, FALLBACK_BACKGROUND_URL);
  for (const backgroundUrl of backgroundUrls) {
    try {
      background = await fetchImageBlob(backgroundUrl, "Background image");
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
    env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    env.OPENAI_IMAGE_SIZE || "1024x1024"
  );
}
__name(generateBlankImage, "generateBlankImage");
var cachedShopifyAccessToken = null;
var cachedShopifyAccessTokenExpiresAt = 0;
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
  throw new Error("Set SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET, or replace SHOPIFY_ADMIN_ACCESS_TOKEN with a valid Shopify Admin API access token.");
}
__name(getShopifyAccessToken, "getShopifyAccessToken");
async function getShopifyClientCredentialsToken(env) {
  if (cachedShopifyAccessToken && Date.now() < cachedShopifyAccessTokenExpiresAt - 6e4) return cachedShopifyAccessToken;
  const body = new URLSearchParams({
    client_id: env.SHOPIFY_CLIENT_ID,
    client_secret: env.SHOPIFY_CLIENT_SECRET,
    grant_type: "client_credentials"
  });
  const response = await fetch(`https://${shopifyStoreDomain(env)}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !data.access_token) throw new Error(`Shopify access token request failed: ${JSON.stringify(data)}`);
  cachedShopifyAccessToken = data.access_token;
  cachedShopifyAccessTokenExpiresAt = Date.now() + Number(data.expires_in || 86400) * 1e3;
  return cachedShopifyAccessToken;
}
__name(getShopifyClientCredentialsToken, "getShopifyClientCredentialsToken");
async function shopifyGraphql(env, query, variables) {
  const response = await fetch(`https://${shopifyStoreDomain(env)}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": await getShopifyAccessToken(env)
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.errors?.length) {
    const details = JSON.stringify(data.errors || data);
    if (response.status === 401 || /Invalid API key or access token/i.test(details)) {
      throw new Error("Shopify authentication failed. Add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET from the installed Shopify app, or replace SHOPIFY_ADMIN_ACCESS_TOKEN with a valid Admin API access token.");
    }
    throw new Error(`Shopify GraphQL failed: ${details}`);
  }
  return data.data;
}
__name(shopifyGraphql, "shopifyGraphql");
async function getShopifyPaymentsPayouts(env, requestBody = {}) {
  const first = clampInteger(requestBody.first || 25, 25, 1, 50);
  const query = safeMessageLine(requestBody.query || "");
  const data = await shopifyGraphql(env, SHOPIFY_PAYMENTS_PAYOUTS_QUERY, {
    first,
    query: query || null,
    reverse: requestBody.reverse !== false
  });
  const account = data.shopifyPaymentsAccount;
  if (!account) throw new Error("Shopify Payments account was not returned. The store might not use Shopify Payments, or the app is missing Payments access.");
  const payouts = account.payouts?.nodes || [];
  const upcomingStatuses = /* @__PURE__ */ new Set(["SCHEDULED", "IN_TRANSIT", "PENDING"]);
  return {
    ok: true,
    shop: data.shop,
    balance: account.balance || [],
    payoutSchedule: null,
    upcomingPayouts: payouts.filter((payout) => upcomingStatuses.has(String(payout.status || "").toUpperCase())),
    recentPayouts: payouts,
    pageInfo: account.payouts?.pageInfo || null,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(getShopifyPaymentsPayouts, "getShopifyPaymentsPayouts");
async function launchFootwearBundleDiscount(env, bundle) {
  const code = bundle.code;
  const existingData = await shopifyGraphql(env, DISCOUNT_BY_CODE_QUERY, { code });
  const existing = existingData.codeDiscountNodeByCode;
  const object = await env.BUCKET.get("products.json");
  if (!object) throw new Error("products.json was not found in R2");
  const payload = JSON.parse(await object.text());
  const products = Array.isArray(payload) ? payload : Array.isArray(payload.products) ? payload.products : [];
  const productIds = [...new Set(products.filter((product) => String(product.brand || "").toLowerCase() === bundle.brand).map((product) => product.shopifyPlaceholder?.shopifyProductId || product.shopifyProductId).filter(Boolean))];
  if (productIds.length < 2) throw new Error(`At least two linked ${bundle.label} Shopify products are required`);
  const input = {
    title: bundle.title,
    code,
    startsAt: new Date(Date.now() - 6e4).toISOString(),
    context: { all: "ALL" },
    minimumRequirement: { quantity: { greaterThanOrEqualToQuantity: "2" } },
    customerGets: {
      value: { discountAmount: { amount: bundle.discountAmount, appliesOnEachItem: false } },
      items: { products: { productsToAdd: productIds } }
    },
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }
  };
  const updateInput = { ...input };
  delete updateInput.code;
  const data = existing ? await shopifyGraphql(env, B30_DISCOUNT_UPDATE_MUTATION, { id: existing.id, input: updateInput }) : await shopifyGraphql(env, B30_DISCOUNT_CREATE_MUTATION, { input });
  const result = existing ? data.discountCodeBasicUpdate : data.discountCodeBasicCreate;
  if (result.userErrors.length) throw new Error(`Shopify ${bundle.label} discount failed: ${JSON.stringify(result.userErrors)}`);
  return {
    ok: true,
    status: existing ? "updated" : "created",
    eligibleProductCount: productIds.length,
    id: result.codeDiscountNode.id,
    discount: result.codeDiscountNode.codeDiscount
  };
}
__name(launchFootwearBundleDiscount, "launchFootwearBundleDiscount");
async function launchB30BundleDiscount(env) {
  return launchFootwearBundleDiscount(env, {
    brand: "b30",
    label: "B30",
    code: "B30PAIR",
    title: "Any 2 B30s for GBP 179.99",
    discountAmount: "19.99"
  });
}
__name(launchB30BundleDiscount, "launchB30BundleDiscount");
async function launchB22BundleDiscount(env) {
  return launchFootwearBundleDiscount(env, {
    brand: "b22",
    label: "B22",
    code: "B22PAIR",
    title: "Any 2 B22s for GBP 229.99",
    discountAmount: "29.99"
  });
}
__name(launchB22BundleDiscount, "launchB22BundleDiscount");
async function launchAirProAddonDiscount(env) {
  const code = "AIRPROADDON";
  const existingData = await shopifyGraphql(env, DISCOUNT_BY_CODE_QUERY, { code });
  const existing = existingData.codeDiscountNodeByCode;
  const object = await env.BUCKET.get("products.json");
  if (!object) throw new Error("products.json was not found in R2");
  const payload = JSON.parse(await object.text());
  const products = Array.isArray(payload) ? payload : Array.isArray(payload.products) ? payload.products : [];
  const airProProduct = products.find((product) => String(product.id) === "54" || /\bair\s*pro\b/i.test(String(product.name || product.title || "")));
  const shopifyProductId = airProProduct?.shopifyPlaceholder?.shopifyProductId || airProProduct?.shopifyProductId;
  if (!shopifyProductId) throw new Error("Linked Air Pro Shopify product was not found");
  const otherProductIds = [...new Set(products.filter((product) => product !== airProProduct).map((product) => product.shopifyPlaceholder?.shopifyProductId || product.shopifyProductId).filter(Boolean).filter((productId) => productId !== shopifyProductId))];
  if (!otherProductIds.length) throw new Error("No linked Shopify products were found for the Air Pro add-on requirement");
  const input = {
    title: "Air Pro add-on - GBP 10 off",
    code,
    startsAt: new Date(Date.now() - 6e4).toISOString(),
    usesPerOrderLimit: 1,
    customerBuys: {
      value: { quantity: "1" },
      items: { products: { productsToAdd: otherProductIds } }
    },
    customerGets: {
      value: { discountOnQuantity: { quantity: "1", effect: { amount: "10.00" } } },
      items: { products: { productsToAdd: [shopifyProductId] } }
    },
    customerSelection: { all: true },
    combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: true }
  };
  const updateInput = { ...input };
  delete updateInput.code;
  const data = existing ? await shopifyGraphql(env, BXGY_DISCOUNT_UPDATE_MUTATION, { id: existing.id, input: updateInput }) : await shopifyGraphql(env, BXGY_DISCOUNT_CREATE_MUTATION, { input });
  const result = existing ? data.discountCodeBxgyUpdate : data.discountCodeBxgyCreate;
  if (result.userErrors.length) throw new Error(`Shopify Air Pro discount failed: ${JSON.stringify(result.userErrors)}`);
  return {
    ok: true,
    status: existing ? "updated" : "created",
    code,
    shopifyProductId,
    eligibleProductCount: otherProductIds.length,
    id: result.codeDiscountNode.id,
    discount: result.codeDiscountNode.codeDiscount
  };
}
__name(launchAirProAddonDiscount, "launchAirProAddonDiscount");
async function launchTelegramDiscount(env) {
  const code = "TELEGRAM5";
  const existingData = await shopifyGraphql(env, DISCOUNT_BY_CODE_QUERY, { code });
  const existing = existingData.codeDiscountNodeByCode;
  const input = {
    title: "Join Telegram - GBP 5 off",
    code,
    startsAt: new Date(Date.now() - 6e4).toISOString(),
    context: { all: "ALL" },
    customerGets: {
      value: { discountAmount: { amount: "5.00", appliesOnEachItem: false } },
      items: { all: true }
    },
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }
  };
  const updateInput = { ...input };
  delete updateInput.code;
  const data = existing ? await shopifyGraphql(env, B30_DISCOUNT_UPDATE_MUTATION, { id: existing.id, input: updateInput }) : await shopifyGraphql(env, B30_DISCOUNT_CREATE_MUTATION, { input });
  const result = existing ? data.discountCodeBasicUpdate : data.discountCodeBasicCreate;
  if (result.userErrors.length) throw new Error(`Shopify Telegram discount failed: ${JSON.stringify(result.userErrors)}`);
  return {
    ok: true,
    status: existing ? "updated" : "created",
    code,
    id: result.codeDiscountNode.id,
    discount: result.codeDiscountNode.codeDiscount
  };
}
__name(launchTelegramDiscount, "launchTelegramDiscount");
async function launchB30TelegramDiscount(env) {
  const code = "B30TG";
  const existingData = await shopifyGraphql(env, DISCOUNT_BY_CODE_QUERY, { code });
  const existing = existingData.codeDiscountNodeByCode;
  const object = await env.BUCKET.get("products.json");
  if (!object) throw new Error("products.json was not found in R2");
  const payload = JSON.parse(await object.text());
  const products = Array.isArray(payload) ? payload : Array.isArray(payload.products) ? payload.products : [];
  const productIds = [...new Set(products.filter((product) => String(product.brand || "").toLowerCase() === "b30").map((product) => product.shopifyPlaceholder?.shopifyProductId || product.shopifyProductId).filter(Boolean))];
  if (!productIds.length) throw new Error("No linked B30 Shopify products were found");
  const input = {
    title: "Telegram B30 - GBP 10 off",
    code,
    startsAt: new Date(Date.now() - 6e4).toISOString(),
    context: { all: "ALL" },
    customerGets: {
      value: { discountAmount: { amount: "10.00", appliesOnEachItem: false } },
      items: { products: { productsToAdd: productIds } }
    },
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }
  };
  const updateInput = { ...input };
  delete updateInput.code;
  const data = existing ? await shopifyGraphql(env, B30_DISCOUNT_UPDATE_MUTATION, { id: existing.id, input: updateInput }) : await shopifyGraphql(env, B30_DISCOUNT_CREATE_MUTATION, { input });
  const result = existing ? data.discountCodeBasicUpdate : data.discountCodeBasicCreate;
  if (result.userErrors.length) throw new Error(`Shopify B30 Telegram discount failed: ${JSON.stringify(result.userErrors)}`);
  return {
    ok: true,
    status: existing ? "updated" : "created",
    code,
    eligibleProductCount: productIds.length,
    id: result.codeDiscountNode.id,
    discount: result.codeDiscountNode.codeDiscount
  };
}
__name(launchB30TelegramDiscount, "launchB30TelegramDiscount");
async function findExistingShopifyProduct(env, product) {
  const data = await shopifyGraphql(env, PRODUCT_SEARCH_QUERY, {
    query: `(tag:ESNTLS-SOURCE-ID-${product.id}) OR (tag:ESNTLS-ID-${product.id})`
  });
  return data.products.nodes[0] || null;
}
__name(findExistingShopifyProduct, "findExistingShopifyProduct");
async function uploadProductImageToShopify(env, product, imageBlob) {
  const mimeType = normalizeOpenAIImageMime(imageBlob && imageBlob.type, "blank.jpg");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const filename = `${slugify(product.id)}-${slugify(product.title)}-blank.${extension}`;
  const staged = await shopifyGraphql(env, STAGED_UPLOAD_MUTATION, {
    input: [{ filename, mimeType, httpMethod: "POST", resource: "PRODUCT_IMAGE" }]
  });
  const errors = staged.stagedUploadsCreate.userErrors;
  if (errors.length) throw new Error(`Shopify staged upload failed: ${JSON.stringify(errors)}`);
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  const currentType = String(imageBlob && imageBlob.type || "").split(";")[0].trim().toLowerCase();
  const uploadBlob = currentType === mimeType ? imageBlob : new Blob([await imageBlob.arrayBuffer()], { type: mimeType });
  form.append("file", uploadBlob, filename);
  const uploadResponse = await fetch(target.url, { method: "POST", body: form });
  if (!uploadResponse.ok) throw new Error(`Shopify staged file POST failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
  return { resourceUrl: target.resourceUrl, filename };
}
__name(uploadProductImageToShopify, "uploadProductImageToShopify");
async function uploadExistingProductImageToShopify(env, product) {
  if (!product.image) throw new Error("Product is missing an image");
  const source = await sourceImageFromStudioMedia(env, product.image) || await fetchImageBlob(product.image, "Source image");
  return uploadProductImageToShopify(env, product, source.blob);
}
__name(uploadExistingProductImageToShopify, "uploadExistingProductImageToShopify");
async function publishProductToOnlineStore(env, productId) {
  if (env.SHOPIFY_PUBLISH_ONLINE_STORE === "false") return null;
  const publications = await shopifyGraphql(env, PUBLICATIONS_QUERY, {});
  const publication = publications.publications.nodes.find((node) => node.name === "Online Store");
  if (!publication) throw new Error("Could not find the Shopify Online Store publication.");
  const data = await shopifyGraphql(env, PUBLISHABLE_PUBLISH_MUTATION, { id: productId, publicationId: publication.id });
  const errors = data.publishablePublish.userErrors;
  if (errors.length) throw new Error(`Shopify publishablePublish failed: ${JSON.stringify(errors)}`);
  return data.publishablePublish.publishable;
}
__name(publishProductToOnlineStore, "publishProductToOnlineStore");
async function activateAndPublishShopifyProduct(env, productId) {
  const updated = await shopifyGraphql(env, PRODUCT_UPDATE_STATUS_MUTATION, {
    product: { id: productId, status: "ACTIVE" }
  });
  const errors = updated.productUpdate.userErrors;
  if (errors.length) throw new Error(`Shopify product status update failed: ${JSON.stringify(errors)}`);
  let published = null;
  try {
    published = await publishProductToOnlineStore(env, productId);
  } catch (error) {
    published = { status: "error", error: error.message };
  }
  return {
    ...updated.productUpdate.product,
    published
  };
}
__name(activateAndPublishShopifyProduct, "activateAndPublishShopifyProduct");
async function createShopifyProduct(env, product, imageResourceUrl, visibleTitle) {
  const variantPlan = buildProductVariantPlan(product, env);
  const productSet = await shopifyGraphql(env, PRODUCT_SET_MUTATION, {
    synchronous: true,
    input: {
      title: visibleTitle,
      descriptionHtml: buildDescriptionHtml(),
      vendor: env.SHOPIFY_VENDOR || "ESNTLS Club",
      productType: env.SHOPIFY_PRODUCT_TYPE || "Placeholder",
      status: env.SHOPIFY_PRODUCT_STATUS || "ACTIVE",
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
    media: [{ originalSource: imageResourceUrl, mediaContentType: "IMAGE", alt: `${visibleTitle} blank product image` }]
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
__name(createShopifyProduct, "createShopifyProduct");
async function createWixBackupProduct(env, product, visibleTitle) {
  if (!env.WIX_API_TOKEN || !env.WIX_SITE_ID) {
    return { status: "skipped", reason: "WIX_API_TOKEN or WIX_SITE_ID is not configured" };
  }
  const variantPlan = buildProductVariantPlan(product, env);
  const variantPrice = { actualPrice: { amount: product.price } };
  const options = [];
  if (variantPlan.sizes.length) {
    options.push({
      name: "Size",
      optionRenderType: "TEXT_CHOICES",
      choicesSettings: { choices: variantPlan.sizes.map((size) => ({ choiceType: "CHOICE_TEXT", name: size })) }
    });
  }
  if (variantPlan.variationValues.length) {
    options.push({
      name: variantPlan.variationName,
      optionRenderType: "TEXT_CHOICES",
      choicesSettings: { choices: variantPlan.variationValues.map((value) => ({ choiceType: "CHOICE_TEXT", name: value })) }
    });
  }
  const response = await fetch("https://www.wixapis.com/stores/v3/products", {
    method: "POST",
    headers: {
      Authorization: env.WIX_API_TOKEN,
      "wix-site-id": env.WIX_SITE_ID,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      product: {
        name: visibleTitle,
        visible: true,
        productType: "PHYSICAL",
        physicalProperties: {},
        options,
        variantsInfo: {
          variants: variantPlan.variants.map((variant) => ({
            visible: true,
            choices: variant.optionValues.map((optionValue) => ({
              optionChoiceNames: { optionName: optionValue.optionName, choiceName: optionValue.name, renderType: "TEXT_CHOICES" }
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
    status: "created",
    id: wixProduct.id,
    name: wixProduct.name,
    slug: wixProduct.slug,
    url: wixProduct.slug ? `https://www.essentialsblanks.net/product-page/${wixProduct.slug}` : ""
  };
}
__name(createWixBackupProduct, "createWixBackupProduct");
async function resolveShopifyProductForPriceSync(env, rawProduct, product) {
  const storedId = rawProduct.shopifyPlaceholder?.shopifyProductId || rawProduct.shopifyProductId || "";
  if (storedId) return { id: storedId, source: "stored" };
  const tagged = await findExistingShopifyProduct(env, product);
  if (tagged?.id) return { id: tagged.id, title: tagged.title, handle: tagged.handle, source: "tag" };
  const handle = extractShopifyHandle(rawProduct.link || rawProduct.shopifyPlaceholder?.shopifyUrl, env);
  if (!handle) return null;
  const data = await shopifyGraphql(env, PRODUCT_SEARCH_QUERY, { query: `handle:${handle}` });
  const found = data.products.nodes[0] || null;
  return found ? { id: found.id, title: found.title, handle: found.handle, source: "handle" } : null;
}
__name(resolveShopifyProductForPriceSync, "resolveShopifyProductForPriceSync");
async function updateShopifyLinkedPrice(env, rawProduct, product, price) {
  if (!env.SHOPIFY_STORE_DOMAIN) return { status: "skipped", reason: "SHOPIFY_STORE_DOMAIN is not configured" };
  const target = await resolveShopifyProductForPriceSync(env, rawProduct, product);
  if (!target?.id) return { status: "skipped", reason: "No linked Shopify product found" };
  const data = await shopifyGraphql(env, PRODUCT_VARIANTS_QUERY, { id: target.id });
  const shopifyProduct = data.product;
  if (!shopifyProduct) return { status: "skipped", reason: `Shopify product ${target.id} was not found` };
  const variants = shopifyProduct.variants.nodes || [];
  if (!variants.length) return { status: "skipped", reason: "Shopify product has no variants to update" };
  const updated = await shopifyGraphql(env, PRODUCT_VARIANTS_BULK_UPDATE_MUTATION, {
    productId: shopifyProduct.id,
    variants: variants.map((variant) => ({ id: variant.id, price }))
  });
  const payload = updated.productVariantsBulkUpdate;
  if (payload.userErrors.length) throw new Error(`Shopify price update failed: ${JSON.stringify(payload.userErrors)}`);
  return {
    status: "updated",
    productId: shopifyProduct.id,
    title: shopifyProduct.title,
    handle: shopifyProduct.handle,
    url: storefrontUrl(env, shopifyProduct.handle),
    variantCount: payload.productVariants.length,
    source: target.source
  };
}
__name(updateShopifyLinkedPrice, "updateShopifyLinkedPrice");
async function loadWixCatalogFromR2(env) {
  if (!env.BUCKET) return [];
  const object = await env.BUCKET.get("wix-products.json");
  if (!object) return [];
  try {
    const data = JSON.parse(await object.text());
    return Array.isArray(data.products) ? data.products : [];
  } catch {
    return [];
  }
}
__name(loadWixCatalogFromR2, "loadWixCatalogFromR2");
async function resolveWixProductIdsForPriceSync(env, rawProduct) {
  const ids = /* @__PURE__ */ new Set();
  const backupId = rawProduct.wixBackupPlaceholder?.id || rawProduct.wixBackupProductId || rawProduct.wixProductId || "";
  if (backupId) ids.add(String(backupId));
  const slug = extractWixSlug(rawProduct.link || rawProduct.wixBackupPlaceholder?.url || "");
  if (slug) {
    const catalog = await loadWixCatalogFromR2(env);
    const hit = catalog.find(
      (item) => String(item.slug || "").toLowerCase() === slug.toLowerCase() || String(item.url || "").toLowerCase().includes(`/product-page/${slug.toLowerCase()}`)
    );
    if (hit?.id) ids.add(String(hit.id));
    if (!hit?.id && env.WIX_API_TOKEN && env.WIX_SITE_ID) {
      try {
        const product = await fetchWixProductBySlug(env, slug);
        if (product?.id) ids.add(String(product.id));
      } catch {
      }
    }
  }
  return [...ids];
}
__name(resolveWixProductIdsForPriceSync, "resolveWixProductIdsForPriceSync");
function wixHeaders(env) {
  return {
    "Authorization": env.WIX_API_TOKEN,
    "wix-site-id": env.WIX_SITE_ID,
    "Content-Type": "application/json"
  };
}
__name(wixHeaders, "wixHeaders");
async function fetchWixProduct(env, productId) {
  const response = await fetch(`https://www.wixapis.com/stores/v3/products/${encodeURIComponent(productId)}`, {
    method: "GET",
    headers: wixHeaders(env)
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix get product ${productId} failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data.product || data;
}
__name(fetchWixProduct, "fetchWixProduct");
async function fetchWixProductBySlug(env, slug) {
  const response = await fetch(`https://www.wixapis.com/stores/v3/products/slug/${encodeURIComponent(slug)}`, {
    method: "GET",
    headers: wixHeaders(env)
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix get product by slug ${slug} failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data.product || data;
}
__name(fetchWixProductBySlug, "fetchWixProductBySlug");
async function patchWixProductPrice(env, wixProduct, price) {
  const variants = wixProduct.variantsInfo?.variants || [];
  if (!variants.length) throw new Error(`Wix product ${wixProduct.id} has no variants to update`);
  const variantPrice = { actualPrice: { amount: price } };
  const product = {
    id: wixProduct.id,
    revision: wixProduct.revision,
    options: wixProduct.options || [],
    variantsInfo: {
      variants: variants.map((variant) => ({
        id: variant.id,
        price: variantPrice
      }))
    }
  };
  const response = await fetch(`https://www.wixapis.com/stores/v3/products/${encodeURIComponent(wixProduct.id)}`, {
    method: "PATCH",
    headers: wixHeaders(env),
    body: JSON.stringify({ product })
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix price update ${wixProduct.id} failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data.product || data;
}
__name(patchWixProductPrice, "patchWixProductPrice");
async function updateWixLinkedPrices(env, rawProduct, price) {
  if (!env.WIX_API_TOKEN || !env.WIX_SITE_ID) {
    return { status: "skipped", reason: "WIX_API_TOKEN or WIX_SITE_ID is not configured", products: [] };
  }
  const ids = await resolveWixProductIdsForPriceSync(env, rawProduct);
  if (!ids.length) return { status: "skipped", reason: "No linked Wix product found", products: [] };
  const products = [];
  for (const id of ids) {
    const wixProduct = await fetchWixProduct(env, id);
    const patched = await patchWixProductPrice(env, wixProduct, price);
    products.push({
      id,
      name: patched.name || wixProduct.name || "",
      slug: patched.slug || wixProduct.slug || "",
      variantCount: (wixProduct.variantsInfo?.variants || []).length
    });
  }
  return { status: "updated", count: products.length, products };
}
__name(updateWixLinkedPrices, "updateWixLinkedPrices");
async function searchWixInventoryItems(env, productId) {
  const response = await fetch("https://www.wixapis.com/stores/v3/inventory-items/search", {
    method: "POST",
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
__name(searchWixInventoryItems, "searchWixInventoryItems");
async function createWixInventoryItem(env, productId, variantId) {
  const inventoryItem = {
    productId,
    trackQuantity: false,
    inStock: true
  };
  if (variantId) inventoryItem.variantId = variantId;
  const response = await fetch("https://www.wixapis.com/stores/v3/inventory-items", {
    method: "POST",
    headers: wixHeaders(env),
    body: JSON.stringify({ inventoryItem })
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix inventory create ${productId} failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data.inventoryItem || data;
}
__name(createWixInventoryItem, "createWixInventoryItem");
async function patchWixInventoryItemInStock(env, item, inventoryQuantity) {
  if (!item?.id || item.revision === void 0 || item.revision === null) {
    throw new Error("Wix inventory item is missing id or revision");
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
    method: "PATCH",
    headers: wixHeaders(env),
    body: JSON.stringify({ inventoryItem, reason: "MANUAL" })
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(`Wix inventory update ${item.id} failed: ${response.status} ${JSON.stringify(data).slice(0, 500)}`);
  return data.inventoryItem || data;
}
__name(patchWixInventoryItemInStock, "patchWixInventoryItemInStock");
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
      items = [await createWixInventoryItem(env, productId, "")];
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
    itemIds: updatedItems.map((item) => item.id).filter(Boolean)
  };
}
__name(restoreWixProductInventory, "restoreWixProductInventory");
async function updateWixLinkedAvailability(env, rawProduct, inventoryQuantity, cache = null) {
  if (!env.WIX_API_TOKEN || !env.WIX_SITE_ID) {
    return { status: "skipped", reason: "WIX_API_TOKEN or WIX_SITE_ID is not configured", products: [] };
  }
  const ids = await resolveWixProductIdsForPriceSync(env, rawProduct);
  if (!ids.length) return { status: "skipped", reason: "No linked Wix product found", products: [] };
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
  return { status: "updated", count: products.length, products };
}
__name(updateWixLinkedAvailability, "updateWixLinkedAvailability");
async function restoreStandardStockFromR2(env, requestBody) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const defaults = [
    { id: 25, price: "\xA349.99" },
    { id: 26, price: "\xA349.99" },
    { id: 34, price: "\xA389.99" }
  ];
  const delivery = String(requestBody.delivery || "7-12 Days").trim() || "7-12 Days";
  const inventoryQuantity = Number(requestBody.inventoryQuantity) > 0 ? Math.floor(Number(requestBody.inventoryQuantity)) : 100;
  const requestedProducts = Array.isArray(requestBody.products) && requestBody.products.length ? requestBody.products : defaults;
  const object = await env.BUCKET.get("products.json");
  if (!object) throw new Error("products.json was not found in R2");
  const payload = JSON.parse(await object.text());
  const list = Array.isArray(payload) ? payload : payload.products;
  if (!Array.isArray(list)) throw new Error("products.json is not an array");
  const updated = [];
  const skipped = [];
  const wixInventoryCache = /* @__PURE__ */ new Map();
  for (const update of requestedProducts) {
    const rawProduct = list.find((item) => String(item.id) === String(update.id));
    if (!rawProduct) {
      skipped.push({ id: update.id, reason: "Product was not found" });
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
      name: rawProduct.name || rawProduct.title || "",
      price: rawProduct.price,
      delivery,
      wixPrice: { status: "skipped", reason: "Not attempted", products: [] },
      wixInventory: { status: "skipped", reason: "Not attempted", products: [] }
    };
    const numericPrice = priceAmount(rawProduct.price);
    if (numericPrice) {
      try {
        result.wixPrice = await updateWixLinkedPrices(env, rawProduct, numericPrice);
      } catch (error) {
        result.wixPrice = { status: "error", error: error.message, products: [] };
      }
    }
    try {
      result.wixInventory = await updateWixLinkedAvailability(env, rawProduct, inventoryQuantity, wixInventoryCache);
    } catch (error) {
      result.wixInventory = { status: "error", error: error.message, products: [] };
    }
    rawProduct.stockRestore = {
      delivery,
      inventoryQuantity,
      result,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    updated.push(result);
  }
  await env.BUCKET.put("products.json", JSON.stringify(payload, null, 2) + "\n", {
    httpMetadata: { contentType: "application/json" }
  });
  return {
    ok: true,
    delivery,
    inventoryQuantity,
    updated: updated.length,
    skipped: skipped.length,
    products: updated,
    skippedProducts: skipped,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(restoreStandardStockFromR2, "restoreStandardStockFromR2");
async function syncLinkedPriceFromR2(env, requestBody) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const productId = requestBody.productId;
  if (productId === void 0 || productId === null || productId === "") throw new Error("Missing productId");
  const price = priceAmount(requestBody.price);
  if (!price) throw new Error("Missing or invalid numeric price");
  const object = await env.BUCKET.get("products.json");
  if (!object) throw new Error("products.json was not found in R2");
  const payload = JSON.parse(await object.text());
  const list = Array.isArray(payload) ? payload : payload.products;
  if (!Array.isArray(list)) throw new Error("products.json is not an array");
  const rawProduct = list.find((item) => String(item.id) === String(productId));
  if (!rawProduct) throw new Error(`Product ${productId} was not found`);
  const product = normalizeStoredProduct({ ...rawProduct, price });
  const result = {
    ok: true,
    productId: product.id,
    price,
    shopify: { status: "skipped", reason: "Not attempted" },
    wix: { status: "skipped", reason: "Not attempted", products: [] },
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  try {
    result.shopify = await updateShopifyLinkedPrice(env, rawProduct, product, price);
  } catch (error) {
    result.shopify = { status: "error", error: error.message };
  }
  try {
    result.wix = await updateWixLinkedPrices(env, rawProduct, price);
  } catch (error) {
    result.wix = { status: "error", error: error.message, products: [] };
  }
  rawProduct.price = requestBody.price;
  rawProduct.linkedPriceSync = result;
  await env.BUCKET.put("products.json", JSON.stringify(payload, null, 2) + "\n", {
    httpMetadata: { contentType: "application/json" }
  });
  return result;
}
__name(syncLinkedPriceFromR2, "syncLinkedPriceFromR2");
async function readProductsPayload(env) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const object = await env.BUCKET.get("products.json");
  if (!object) throw new Error("products.json was not found in R2");
  const payload = JSON.parse(await object.text());
  const list = Array.isArray(payload) ? payload : payload.products;
  if (!Array.isArray(list)) throw new Error("products.json is not an array");
  return { payload, list };
}
__name(readProductsPayload, "readProductsPayload");
async function writeProductsPayload(env, payload) {
  await env.BUCKET.put("products.json", JSON.stringify(payload, null, 2) + "\n", {
    httpMetadata: { contentType: "application/json" }
  });
}
__name(writeProductsPayload, "writeProductsPayload");
async function syncProductLinkedPrice(env, rawProduct, price, updatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  const product = normalizeStoredProduct({ ...rawProduct, price });
  const result = {
    ok: true,
    productId: product.id,
    price,
    shopify: { status: "skipped", reason: "Not attempted" },
    wix: { status: "skipped", reason: "Not attempted", products: [] },
    updatedAt
  };
  try {
    result.shopify = await updateShopifyLinkedPrice(env, rawProduct, product, price);
  } catch (error) {
    result.shopify = { status: "error", error: error.message };
  }
  try {
    result.wix = await updateWixLinkedPrices(env, rawProduct, price);
  } catch (error) {
    result.wix = { status: "error", error: error.message, products: [] };
  }
  rawProduct.price = price;
  rawProduct.linkedPriceSync = result;
  return result;
}
__name(syncProductLinkedPrice, "syncProductLinkedPrice");
function saleEndDate(requestBody, startsAt) {
  const explicit = Date.parse(requestBody.endsAt || requestBody.endAt || "");
  if (Number.isFinite(explicit) && explicit > startsAt.getTime()) return new Date(explicit);
  const hours = Number(requestBody.durationHours || requestBody.hours || 24);
  const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 24 * 14) : 24;
  return new Date(startsAt.getTime() + safeHours * 60 * 60 * 1e3);
}
__name(saleEndDate, "saleEndDate");
async function startTimedSaleFromR2(env, requestBody) {
  const productId = requestBody.productId;
  if (productId === void 0 || productId === null || productId === "") throw new Error("Missing productId");
  const salePrice = priceAmount(requestBody.salePrice ?? requestBody.price);
  const regularPrice = priceAmount(requestBody.regularPrice ?? requestBody.afterPrice ?? requestBody.originalPrice);
  if (!salePrice) throw new Error("Missing or invalid salePrice");
  if (!regularPrice) throw new Error("Missing or invalid regularPrice");
  const { payload, list } = await readProductsPayload(env);
  const rawProduct = list.find((item) => String(item.id) === String(productId));
  if (!rawProduct) throw new Error(`Product ${productId} was not found`);
  const now = /* @__PURE__ */ new Date();
  const endsAt = saleEndDate(requestBody, now);
  const result = await syncProductLinkedPrice(env, rawProduct, salePrice, now.toISOString());
  rawProduct.originalPrice = regularPrice;
  rawProduct.timedSale = {
    active: true,
    label: String(requestBody.label || "24 hour deal").trim() || "24 hour deal",
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
    name: rawProduct.name || rawProduct.title || "",
    salePrice,
    regularPrice,
    startsAt: rawProduct.timedSale.startsAt,
    endsAt: rawProduct.timedSale.endsAt,
    sync: result
  };
}
__name(startTimedSaleFromR2, "startTimedSaleFromR2");
async function processExpiredTimedSales(env) {
  const { payload, list } = await readProductsPayload(env);
  const now = Date.now();
  const updatedAt = new Date(now).toISOString();
  const expired = [];
  const skipped = [];
  for (const rawProduct of list) {
    const sale = rawProduct && rawProduct.timedSale;
    if (!sale || sale.active === false) continue;
    const endMs = Date.parse(sale.endsAt || sale.endAt || "");
    if (!Number.isFinite(endMs)) {
      skipped.push({ id: rawProduct.id, reason: "Timed sale has no valid endsAt" });
      continue;
    }
    if (endMs > now) continue;
    const regularPrice = priceAmount(sale.regularPrice || rawProduct.originalPrice);
    if (!regularPrice) {
      skipped.push({ id: rawProduct.id, reason: "Timed sale has no valid regularPrice" });
      continue;
    }
    const result = await syncProductLinkedPrice(env, rawProduct, regularPrice, updatedAt);
    rawProduct.originalPrice = "";
    rawProduct.timedSale = {
      ...sale,
      active: false,
      expiredAt: updatedAt,
      lastSync: result
    };
    expired.push({
      id: rawProduct.id,
      name: rawProduct.name || rawProduct.title || "",
      price: regularPrice,
      sync: result
    });
  }
  if (expired.length) await writeProductsPayload(env, payload);
  return { ok: true, checked: list.length, expired: expired.length, products: expired, skipped, updatedAt };
}
__name(processExpiredTimedSales, "processExpiredTimedSales");
async function ensureWixBackupForProduct(env, rawProduct, product, visibleTitle) {
  let wixBackup = rawProduct.wixBackupPlaceholder || null;
  if (hasUsableWixBackup(wixBackup)) return wixBackup;
  try {
    wixBackup = await createWixBackupProduct(env, product, visibleTitle);
  } catch (error) {
    wixBackup = { status: "error", error: error.message };
  }
  rawProduct.wixBackupPlaceholder = wixBackup;
  return wixBackup;
}
__name(ensureWixBackupForProduct, "ensureWixBackupForProduct");
async function switchCheckoutLinksFromR2(env, requestBody) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const mode = String(requestBody.mode || "").toLowerCase();
  if (!["shopify", "wix"].includes(mode)) throw new Error("Mode must be shopify or wix");
  const object = await env.BUCKET.get("products.json");
  if (!object) throw new Error("products.json was not found in R2");
  const payload = JSON.parse(await object.text());
  const list = Array.isArray(payload) ? payload : payload.products;
  if (!Array.isArray(list)) throw new Error("products.json is not an array");
  const productId = requestBody.productId;
  const targets = productId === void 0 || productId === null || productId === "" ? list : list.filter((item) => String(item.id) === String(productId));
  if (productId !== void 0 && productId !== null && productId !== "" && !targets.length) {
    throw new Error(`Product ${productId} was not found`);
  }
  const updated = [];
  const skipped = [];
  for (const rawProduct of targets) {
    if (!requestBody.includeArchived && (rawProduct.active === false || rawProduct.archived === true || rawProduct.hidden === true)) {
      skipped.push({ id: rawProduct.id, name: rawProduct.name || rawProduct.title || "", reason: "Product is hidden or archived" });
      continue;
    }
    const product = normalizeStoredProduct(rawProduct);
    rememberCheckoutLinks(rawProduct, env);
    if (!checkoutUrlForMode(rawProduct, env, "wix") && requestBody.createMissingWixBackup !== false) {
      if (!product.title || !product.price) {
        if (mode === "wix") {
          skipped.push({ id: product.id, name: product.title, reason: "Missing product name or price for Wix backup" });
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
      shopify: links.shopify || "",
      wix: links.wix || ""
    });
  }
  await env.BUCKET.put("products.json", JSON.stringify(payload, null, 2) + "\n", {
    httpMetadata: { contentType: "application/json" }
  });
  return {
    ok: true,
    mode,
    scope: productId === void 0 || productId === null || productId === "" ? "all" : "single",
    updated: updated.length,
    skipped: skipped.length,
    products: updated,
    skippedProducts: skipped,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(switchCheckoutLinksFromR2, "switchCheckoutLinksFromR2");
async function createShopifyPlaceholderFromR2(env, requestBody) {
  if (!env.BUCKET) throw new Error("BUCKET binding is not configured");
  const productId = requestBody.productId;
  if (productId === void 0 || productId === null || productId === "") throw new Error("Missing productId");
  const object = await env.BUCKET.get("products.json");
  if (!object) throw new Error("products.json was not found in R2");
  const payload = JSON.parse(await object.text());
  const list = Array.isArray(payload) ? payload : payload.products;
  if (!Array.isArray(list)) throw new Error("products.json is not an array");
  const rawProduct = list.find((item) => String(item.id) === String(productId));
  if (!rawProduct) throw new Error(`Product ${productId} was not found`);
  const product = normalizeStoredProduct(rawProduct);
  if (!product.active) throw new Error("Product is inactive");
  if (!product.title) throw new Error("Product is missing a name");
  if (!product.price) throw new Error("Product is missing a valid price");
  if (!product.image) throw new Error("Product is missing an image");
  rememberCheckoutLinks(rawProduct, env);
  const existing = await findExistingShopifyProduct(env, product);
  let status = "created";
  const titleOverride = normalizePlaceholderTitleOverride(requestBody.shopifyTitleOverride || requestBody.shopifyTitle || requestBody.visibleTitle);
  let visibleTitle = existing?.title || titleOverride || buildPlaceholderTitle(product);
  let shopifyProduct;
  let uploadedFilename = "";
  if (existing) {
    status = "existing";
    const activeProduct = await activateAndPublishShopifyProduct(env, existing.id);
    const shopifyVariants = await shopifyVariantMapForProduct(env, existing.id, product);
    shopifyProduct = {
      id: activeProduct.id || existing.id,
      title: activeProduct.title || existing.title,
      handle: activeProduct.handle || existing.handle,
      shopifyUrl: storefrontUrl(env, activeProduct.handle || existing.handle),
      shopifyVariants,
      variantCount: Object.keys(shopifyVariants || {}).length,
      productStatus: activeProduct.status || "",
      published: activeProduct.published
    };
  } else {
    const useExistingImage = requestBody.useExistingImage === true || rawProduct.grassBackground?.status === "done";
    const upload = useExistingImage ? await uploadExistingProductImageToShopify(env, product) : await uploadProductImageToShopify(env, product, await generateBlankImage(env, product, sourceImageFromRequestBody(requestBody.sourceImage)));
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
  rawProduct.shopifyVariantId = Object.values(rawProduct.shopifyVariants)[0] || "";
  rememberCheckoutLinks(rawProduct, env, {
    shopifyUrl,
    wixUrl: hasUsableWixBackup(wixBackup) ? wixBackup.url : "",
    active: "shopify"
  });
  rawProduct.shopifyPlaceholder = {
    status,
    sourceId: product.id,
    sourceTitle: product.title,
    shopifyProductId: shopifyProduct.id,
    shopifyTitle: shopifyProduct.title,
    requestedShopifyTitle: titleOverride || "",
    shopifyUrl,
    uploadedFilename,
    sizes: shopifyProduct.sizes || inferSizes(product, env),
    variationName: shopifyProduct.variationName || product.variationName || "",
    variationValues: shopifyProduct.variationValues || product.variationValues || [],
    variantCount: shopifyProduct.variantCount || 0,
    variants: rawProduct.shopifyVariants,
    productStatus: shopifyProduct.productStatus || "",
    published: shopifyProduct.published || null,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (wixBackup) rawProduct.wixBackupPlaceholder = wixBackup;
  delete rawProduct.checkoutCreationError;
  rawProduct.active = true;
  rawProduct.archived = false;
  await env.BUCKET.put("products.json", JSON.stringify(payload, null, 2) + "\n", {
    httpMetadata: { contentType: "application/json" }
  });
  return { ok: true, status, productId: product.id, shopifyUrl, shopify: rawProduct.shopifyPlaceholder, wixBackup, checkoutLinks: rawProduct.checkoutLinks };
}
__name(createShopifyPlaceholderFromR2, "createShopifyPlaceholderFromR2");
var r2_worker_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processExpiredTimedSales(env));
    if (supplierPortalSyncEnabled(env)) {
      ctx.waitUntil(syncRecentSupplierOrdersToPortal(env, {
        dryRun: false,
        source: "cron"
      }).catch((error) => writeSupplierPortalSyncLog(env, {
        ok: false,
        status: "failed",
        source: "cron",
        error: error.message,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      })));
      ctx.waitUntil(syncExternalSupplierOrdersToPortal(env, {
        dryRun: false,
        source: "cron-external"
      }).catch((error) => writeSupplierPortalSyncLog(env, {
        ok: false,
        status: "failed",
        source: "cron-external",
        error: error.message,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      })));
    }
    if (supplierTrackingSyncEnabled(env)) {
      ctx.waitUntil(syncSupplierTrackingFromSheet(env, {
        dryRun: false,
        source: "cron"
      }).catch((error) => writeSupplierTrackingSyncLog(env, {
        ok: false,
        status: "failed",
        source: "cron",
        error: error.message,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      })));
    }
  },
  async queue(batch, env) {
    for (const message of batch.messages || []) {
      const body = typeof message.body === "string" ? (() => {
        try {
          return JSON.parse(message.body);
        } catch {
          return {};
        }
      })() : message.body || {};
      if (body.type !== "esntls-grass-job-item" || !body.jobId || !body.itemId) {
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
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (req.method === "POST" && parts[0] === "shopify-order-webhook") {
      return handleShopifyOrderWebhook(req, env, ctx);
    }
    if ((req.method === "GET" || req.method === "HEAD") && parts[0] === "supplier-image") {
      return getSupplierSheetImage(req, env, parts);
    }
    if (req.method === "GET" && parts[0] === "supplier-portal") {
      return supplierPortalHtmlResponse();
    }
    if (parts[0] === "supplier-portal-api") {
      return handleSupplierPortalApi(req, env, ctx, parts, url);
    }
    if (req.method === 'POST' && parts[0] === 'admin-login') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
      const password = adminPassword(env);
      if (!password || !(env.ADMIN_SESSION_SECRET || env.ADMIN_SECRET)) {
        return json({ error: 'Admin login is not configured' }, 503);
      }
      if (String(body.password || '') !== password) return json({ error: 'Invalid password' }, 401);
      return json({ ok: true, token: await createAdminSession(env), expiresIn: 7200 });
    }


    const adminAuthorized = await verifyAdminSession(env, req.headers.get("X-Admin-Session")) || Boolean(env.ADMIN_SECRET && req.headers.get("X-Admin-Secret") === env.ADMIN_SECRET);
    const serviceAuthorized = Boolean(
      env.ESNTLS_STORE_SERVICE_TOKEN && req.headers.get("X-ESNTLS-Service-Token") === env.ESNTLS_STORE_SERVICE_TOKEN
    );
    if (!adminAuthorized && !serviceAuthorized) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (req.method === "POST" && parts[0] === "shopify-create-product") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: "Invalid JSON body" }, 400);
      }
      try {
        return json(await createShopifyPlaceholderFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "whatsapp-test-order") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        body = {};
      }
      try {
        const order = body.order || sampleShopifyOrderForWhatsappTest();
        return json(await sendShopifyOrderToWhatsApp(env, order, {
          dryRun: body.dryRun !== false,
          force: true,
          source: "admin-test"
        }));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "GET" && parts[0] === "whatsapp-order-log") {
      try {
        return json(await listWhatsappOrderLogs(env, url.searchParams.get("limit")));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "supplier-sheet-test-order") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        body = {};
      }
      try {
        const order = body.order || sampleShopifyOrderForWhatsappTest();
        return json(await processSupplierOrderWebhook(env, order, {
          dryRun: body.dryRun !== false,
          force: true,
          source: "admin-sheet-test"
        }));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "GET" && parts[0] === "supplier-order-log") {
      try {
        return json(await listSupplierOrderLogs(env, url.searchParams.get("limit")));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "supplier-sheet-sync-recent") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        body = {};
      }
      try {
        return json(await syncRecentSupplierOrdersToSheet(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "GET" && parts[0] === "shopify-webhook-status") {
      try {
        return json(await checkShopifyWebhookStatus(env, `${url.origin}/shopify-order-webhook`));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "GET" && parts[0] === "shopify-payouts") {
      try {
        return json(await getShopifyPaymentsPayouts(env, {
          first: url.searchParams.get("first") || 25,
          query: url.searchParams.get("query") || "",
          reverse: url.searchParams.get("reverse") !== "false"
        }));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "supplier-tracking-sync") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        body = {};
      }
      try {
        return json(await syncSupplierTrackingFromSheet(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "supplier-portal-import-sheet") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        body = {};
      }
      try {
        return json(await importSupplierSheetOrdersToPortal(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "supplier-portal-hide-item") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        body = {};
      }
      try {
        return json(await hideSupplierPortalItem(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "launch-b30-bundle") {
      try {
        return json(await launchB30BundleDiscount(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "launch-b22-bundle") {
      try {
        return json(await launchB22BundleDiscount(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "launch-air-pro-addon") {
      try {
        return json(await launchAirProAddonDiscount(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "launch-telegram-discount") {
      try {
        return json(await launchTelegramDiscount(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "launch-b30-telegram-discount") {
      try {
        return json(await launchB30TelegramDiscount(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "sync-linked-price") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: "Invalid JSON body" }, 400);
      }
      try {
        return json(await syncLinkedPriceFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "timed-sale") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: "Invalid JSON body" }, 400);
      }
      try {
        return json(await startTimedSaleFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "process-expired-sales") {
      try {
        return json(await processExpiredTimedSales(env));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "restore-standard-stock") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: "Invalid JSON body" }, 400);
      }
      try {
        return json(await restoreStandardStockFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "restore-b30-shopify-stock") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: "Invalid JSON body" }, 400);
      }
      try {
        return json(await restoreB30ShopifyStockFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "checkout-link-mode") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: "Invalid JSON body" }, 400);
      }
      try {
        return json(await switchCheckoutLinksFromR2(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "POST" && parts[0] === "grass-preview") {
      let formData;
      try {
        formData = await req.formData();
      } catch (e) {
        return json({ error: "Invalid multipart form data" }, 400);
      }
      try {
        return json(await createGrassPreview(env, formData));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (parts[0] === "grass-jobs") {
      if (req.method === "POST" && !parts[1]) {
        let formData;
        try {
          formData = await req.formData();
        } catch (e) {
          return json({ error: "Invalid multipart form data" }, 400);
        }
        try {
          return await createGrassJob(req, env, formData, ctx);
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }
      if (req.method === "GET" && !parts[1]) {
        try {
          return await getGrassJobs(req, env, ctx);
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }
      if (req.method === "POST" && parts[1] === "resume") {
        try {
          return await resumeGrassJobFromRequest(req, env, ctx);
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }
      if (req.method === "POST" && parts[1] === "work") {
        const body = await req.json().catch(() => ({}));
        const id = body.id || url.searchParams.get("id");
        if (!id) return json({ error: "Missing background job id" }, 400);
        try {
          const job = await processNextGrassJobItem(env, id, { force: !!body.force });
          return json({ ok: true, job: publicGrassJob(job) });
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }
      if (req.method === "POST" && parts[1] === "retry-failed") {
        try {
          return await retryFailedGrassJob(req, env, ctx);
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }
      if (req.method === "POST" && parts[1] === "cancel") {
        try {
          return await cancelGrassJob(req, env);
        } catch (error) {
          return json({ error: error.message }, 500);
        }
      }
    }
    if (req.method === "POST" && parts[0] === "yupoo-images") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: "Invalid JSON body" }, 400);
      }
      try {
        return json(await listYupooImages(body.url, body.limit));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "GET" && parts[0] === "yupoo-image") {
      try {
        return await proxyYupooImage(url.searchParams.get("url"));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "GET" && parts[0] === "list") {
      const out = [];
      let cursor;
      do {
        const r = await env.BUCKET.list({ limit: 1e3, cursor });
        out.push(...r.objects.map((o) => ({
          key: o.key,
          url: PUBLIC_BASE + o.key,
          size: o.size,
          uploaded: o.uploaded
        })));
        cursor = r.truncated ? r.cursor : null;
      } while (cursor);
      return json({ objects: out });
    }
    if (req.method === "POST" && parts[0] === "copy-r2-object") {
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: "Invalid JSON body" }, 400);
      }
      try {
        return json(await copyR2Object(env, body));
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }
    if (req.method === "PUT" && parts[0] === "upload") {
      const key = parts.slice(1).map(decodeURIComponent).join("/");
      if (!key) return json({ error: "Missing key" }, 400);
      await env.BUCKET.put(key, req.body, {
        httpMetadata: { contentType: req.headers.get("Content-Type") || "application/octet-stream" }
      });
      return json({ ok: true, key, url: PUBLIC_BASE + key });
    }
    if (req.method === "DELETE" && parts[0] === "delete") {
      const key = parts.slice(1).map(decodeURIComponent).join("/");
      if (!key) return json({ error: "Missing key" }, 400);
      await env.BUCKET.delete(key);
      return json({ ok: true });
    }
    if (req.method === "POST" && parts[0] === "wix-sync") {
      if (!env.WIX_API_TOKEN) return json({ error: "WIX_API_TOKEN env var not set" }, 500);
      if (!env.WIX_SITE_ID) return json({ error: "WIX_SITE_ID env var not set" }, 500);
      const all = [];
      let cursor = null;
      let pages = 0;
      do {
        const search = cursor ? { cursorPaging: { limit: 100, cursor } } : { cursorPaging: { limit: 100 } };
        const body = JSON.stringify({ search });
        const r = await fetch("https://www.wixapis.com/stores/v3/products/search", {
          method: "POST",
          headers: {
            "Authorization": env.WIX_API_TOKEN,
            "wix-site-id": env.WIX_SITE_ID,
            "Content-Type": "application/json"
          },
          body
        });
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          return json({ error: "Wix API " + r.status, detail: t.slice(0, 500) }, 502);
        }
        const data = await r.json();
        for (const p of data.products || []) {
          all.push({
            id: p.id,
            name: (p.name || "").trim(),
            slug: p.slug,
            url: "https://www.essentialsblanks.net/product-page/" + p.slug,
            image: p.media && p.media.main && p.media.main.image && p.media.main.image.url || "",
            priceMin: p.actualPriceRange && p.actualPriceRange.minValue && p.actualPriceRange.minValue.amount || "",
            priceMax: p.actualPriceRange && p.actualPriceRange.maxValue && p.actualPriceRange.maxValue.amount || "",
            compareMin: p.compareAtPriceRange && p.compareAtPriceRange.minValue && p.compareAtPriceRange.minValue.amount || "",
            visible: p.visible !== false,
            availability: p.inventory && p.inventory.availabilityStatus || ""
          });
        }
        cursor = data.pagingMetadata && data.pagingMetadata.cursors && data.pagingMetadata.cursors.next || null;
        pages++;
      } while (cursor && pages < 50);
      const payload = JSON.stringify({
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        count: all.length,
        products: all
      });
      await env.BUCKET.put("wix-products.json", payload, {
        httpMetadata: { contentType: "application/json" }
      });
      return json({ ok: true, count: all.length, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    }
    if (req.method === "POST" && parts[0] === "wix-orders-sync") {
      if (!env.WIX_API_TOKEN) return json({ error: "WIX_API_TOKEN env var not set" }, 500);
      if (!env.WIX_SITE_ID) return json({ error: "WIX_SITE_ID env var not set" }, 500);
      const all = [];
      let cursor = null;
      let pages = 0;
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1e3);
      do {
        const search = cursor ? { cursorPaging: { limit: 50, cursor } } : { cursorPaging: { limit: 50 }, sort: [{ fieldName: "createdDate", order: "DESC" }] };
        const r = await fetch("https://www.wixapis.com/ecom/v1/orders/search", {
          method: "POST",
          headers: {
            "Authorization": env.WIX_API_TOKEN,
            "wix-site-id": env.WIX_SITE_ID,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ search })
        });
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          return json({ error: "Wix Orders API " + r.status, detail: t.slice(0, 500) }, 502);
        }
        const data = await r.json();
        let stopPaging = false;
        for (const o of data.orders || []) {
          if (new Date(o.createdDate) < cutoff) {
            stopPaging = true;
            break;
          }
          const ship = o.recipientInfo && o.recipientInfo.address || {};
          const contact = o.recipientInfo && o.recipientInfo.contactDetails || {};
          all.push({
            id: o.id,
            number: o.number,
            createdDate: o.createdDate,
            paymentStatus: o.paymentStatus,
            fulfillmentStatus: o.fulfillmentStatus,
            archived: !!o.archived,
            status: o.status,
            total: o.priceSummary && o.priceSummary.total && o.priceSummary.total.amount || "0.00",
            currency: o.currency,
            buyer: {
              name: ((contact.firstName || "") + " " + (contact.lastName || "")).trim(),
              email: o.buyerInfo && o.buyerInfo.email || "",
              phone: contact.phone || ""
            },
            shipping: {
              addressLine: ship.addressLine || "",
              city: ship.city || "",
              postalCode: ship.postalCode || "",
              country: ship.country || "",
              countryFullname: ship.countryFullname || ""
            },
            lineItems: (o.lineItems || []).map((li) => ({
              productId: li.catalogReference && li.catalogReference.catalogItemId || "",
              productName: li.productName && li.productName.original || "",
              image: li.image && li.image.url || "",
              quantity: li.quantity || 1,
              price: li.price && li.price.amount || "0.00",
              options: li.catalogReference && li.catalogReference.options && li.catalogReference.options.options || {}
            }))
          });
        }
        if (stopPaging) break;
        cursor = data.metadata && data.metadata.cursors && data.metadata.cursors.next || null;
        pages++;
      } while (cursor && pages < 30);
      const payload = JSON.stringify({
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        count: all.length,
        orders: all
      });
      await env.BUCKET.put("wix-orders.json", payload, {
        httpMetadata: { contentType: "application/json" }
      });
      return json({ ok: true, count: all.length, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    }
    if (req.method === "POST" && parts[0] === "wix-create-product") {
      if (!env.WIX_API_TOKEN) return json({ error: "WIX_API_TOKEN env var not set" }, 500);
      if (!env.WIX_SITE_ID) return json({ error: "WIX_SITE_ID env var not set" }, 500);
      let body;
      try {
        body = await req.json();
      } catch (e) {
        return json({ error: "Invalid JSON body" }, 400);
      }
      const name = (body.name || "").trim();
      const priceAmount2 = String(body.priceAmount || "").replace(/[£$,\s]/g, "");
      const compareAmount = String(body.comparePriceAmount || "").replace(/[£$,\s]/g, "");
      const sizes = Array.isArray(body.sizes) ? body.sizes.map((s) => String(s).trim()).filter(Boolean) : [];
      const colours = Array.isArray(body.colours) ? body.colours.map((c) => String(c).trim()).filter(Boolean) : [];
      if (!name) return json({ error: "Missing name" }, 400);
      if (!priceAmount2 || isNaN(parseFloat(priceAmount2))) {
        return json({ error: "Missing or invalid price (expected a number like 89.99)" }, 400);
      }
      const variantPrice = { actualPrice: { amount: priceAmount2 } };
      if (compareAmount && !isNaN(parseFloat(compareAmount))) {
        variantPrice.compareAtPrice = { amount: compareAmount };
      }
      const options = [];
      if (sizes.length) {
        options.push({
          name: "Size",
          optionRenderType: "TEXT_CHOICES",
          choicesSettings: { choices: sizes.map((s) => ({ choiceType: "CHOICE_TEXT", name: s })) }
        });
      }
      if (colours.length) {
        options.push({
          name: "Color",
          optionRenderType: "TEXT_CHOICES",
          choicesSettings: { choices: colours.map((c) => ({ choiceType: "CHOICE_TEXT", name: c })) }
        });
      }
      const sizeList = sizes.length ? sizes : [null];
      const colourList = colours.length ? colours : [null];
      const variants = [];
      for (const sz of sizeList) {
        for (const co of colourList) {
          const choices = [];
          if (sz) choices.push({ optionChoiceNames: { optionName: "Size", choiceName: sz, renderType: "TEXT_CHOICES" } });
          if (co) choices.push({ optionChoiceNames: { optionName: "Color", choiceName: co, renderType: "TEXT_CHOICES" } });
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
        productType: "PHYSICAL",
        physicalProperties: {},
        options,
        variantsInfo: { variants }
      };
      const r = await fetch("https://www.wixapis.com/stores/v3/products", {
        method: "POST",
        headers: {
          "Authorization": env.WIX_API_TOKEN,
          "wix-site-id": env.WIX_SITE_ID,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ product })
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        return json({ error: "Wix API " + r.status, detail: t.slice(0, 500) }, 502);
      }
      const data = await r.json();
      const p = data.product || {};
      const publicUrl = p.slug ? "https://www.essentialsblanks.net/product-page/" + p.slug : "";
      return json({ ok: true, id: p.id, slug: p.slug, name: p.name, url: publicUrl });
    }
    return json({ error: "Not found" }, 404);
  }
};
export {
  r2_worker_default as default
};
//# sourceMappingURL=r2-worker.js.map

