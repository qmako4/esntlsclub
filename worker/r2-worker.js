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
//
// Endpoints (all require header  X-Admin-Secret: <ADMIN_SECRET>):
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

const PUBLIC_BASE = 'https://pub-43c9cf7fd2904289881c21839332521c.r2.dev/';
const DEFAULT_BACKGROUND_URL = 'https://esntlsclub.com/img/esntls-blank-concrete-background.jpg';
const FALLBACK_BACKGROUND_URL = 'https://raw.githubusercontent.com/qmako4/esntlsclub/main/img/esntls-blank-concrete-background.jpg';
const SHOPIFY_API_VERSION = '2026-04';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
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
      nodes { id price }
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

function inferPlaceholderColor(product) {
  const text = productText(product);
  const hit = COLOR_PATTERNS.find(([pattern]) => pattern.test(text));
  return hit ? hit[1] : '';
}

function inferPlaceholderBase(product) {
  const text = productText(product).toLowerCase();
  if (/\b(sandals?|slides?|sliders?)\b/.test(text)) return /\b(slides?|sliders?)\b/.test(text) ? 'Classic Slides' : 'Classic Sandals';
  if (/\b(gel|kayano|asics)\b/.test(text)) return 'Gel Runners';
  if (/\b(b30|technical)\b/.test(text)) return 'Technical Sneakers';
  if (/\b(b22|runner|sneakers?|trainers?|shoes?|footwear)\b/.test(text)) return /\b(b22|runner)\b/.test(text) ? 'Runner Sneakers' : 'Daily Trainers';
  if (/\b(t-?shirt|tee|shirt)\b/.test(text)) return 'Simple T-Shirt';
  if (/\b(shorts?)\b/.test(text)) return 'Summer Shorts';
  if (/\b(tracksuit)\b/.test(text)) return 'Core Tracksuit';
  if (/\b(parka)\b/.test(text)) return 'Parka Jacket';
  if (/\b(puffer)\b/.test(text)) return 'Puffer Jacket';
  if (/\b(jacket|windrunner|coat|outerwear|clothing)\b/.test(text)) return 'Lightweight Jacket';
  if (/\b(messenger|bag|accessories?)\b/.test(text)) return 'Messenger Bag';
  return 'Select Piece';
}

function buildPlaceholderTitle(product) {
  const base = inferPlaceholderBase(product);
  const color = inferPlaceholderColor(product);
  return color ? `The ${base} - ${color}` : `The ${base}`;
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

function priceAmount(value) {
  const cleaned = String(value || '').replace(/[£$,\s]/g, '');
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]).toFixed(2) : '';
}

function normalizeStoredProduct(raw) {
  const title = raw.name || raw.title || raw.productName || '';
  const categories = splitList(raw.category || raw.categories);
  const image = raw.image || raw.imageUrl || raw.featuredImage || raw.thumbnail || raw.images?.[0]?.url || raw.images?.[0] || '';
  return {
    id: raw.id || raw.productId || raw.slug || slugify(title),
    title,
    price: priceAmount(raw.price || raw.price_gbp || raw.sale_price_gbp),
    link: raw.link || '',
    image,
    sizes: splitList(raw.sizes || raw.size || raw.availableSizes),
    categories,
    active: raw.active !== false,
    raw
  };
}

function inferSizes(product, env) {
  if (product.sizes.length) return product.sizes;
  const text = `${product.title || ''} ${product.categories.join(' ')}`.toLowerCase();
  if (/(sandal|slide|trainer|sneaker|shoe|footwear|b22|b30)/.test(text)) {
    return splitList(env.DEFAULT_FOOTWEAR_SIZES || 'UK 6,UK 7,UK 8,UK 9,UK 10,UK 11');
  }
  if (/(shirt|tee|short|jacket|tracksuit|hoodie|clothing|top|casablanca)/.test(text)) {
    return splitList(env.DEFAULT_CLOTHING_SIZES || 'S,M,L,XL');
  }
  return splitList(env.DEFAULT_SIZES || 'S,M,L,XL');
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

function buildDescriptionHtml() {
  return [
    '<p><strong>Blank item = original item.</strong></p>',
    "<p><strong>Buy the blank item shown at checkout. You'll receive the original item you selected.</strong></p>"
  ].join('');
}

function buildShopifyImagePrompt(product, hasBackground) {
  const backgroundLine = hasBackground
    ? 'Use the provided ESNTLS grey concrete background as the final background style so this matches the existing Shopify blank product images.'
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

function base64ToBlob(base64, type = 'image/png') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function fetchImageBlob(url, label) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} download failed: ${response.status}`);
  const type = response.headers.get('content-type') || 'image/png';
  const pathname = new URL(url).pathname;
  return { blob: await response.blob(), type, filename: slugify(pathname.split('/').pop()) || 'image' };
}

async function requestOpenAIImageEdit(env, product, source, background, model, size) {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', buildShopifyImagePrompt(product, !!background));
  form.append('size', size);
  if (env.OPENAI_IMAGE_QUALITY) form.append('quality', env.OPENAI_IMAGE_QUALITY);
  if (background) {
    form.append('image[]', source.blob, source.filename || 'source.jpg');
    form.append('image[]', background.blob, 'esntls-background.jpg');
  } else {
    form.append('image', source.blob, source.filename || 'source.jpg');
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

async function generateBlankImage(env, product) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY env var not set');
  if (!product.image) throw new Error('Product is missing an image');
  const source = await fetchImageBlob(product.image, 'Source image');
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
  try {
    return await requestOpenAIImageEdit(env, product, source, background, env.OPENAI_IMAGE_MODEL || 'gpt-image-2', env.OPENAI_IMAGE_SIZE || '1024x1024');
  } catch {
    return requestOpenAIImageEdit(env, product, source, background, 'gpt-image-1', '1024x1024');
  }
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

async function findExistingShopifyProduct(env, product) {
  const data = await shopifyGraphql(env, PRODUCT_SEARCH_QUERY, {
    query: `(tag:ESNTLS-SOURCE-ID-${product.id}) OR (tag:ESNTLS-ID-${product.id})`
  });
  return data.products.nodes[0] || null;
}

async function uploadProductImageToShopify(env, product, imageBlob) {
  const filename = `${slugify(product.id)}-${slugify(product.title)}-blank.png`;
  const staged = await shopifyGraphql(env, STAGED_UPLOAD_MUTATION, {
    input: [{ filename, mimeType: 'image/png', httpMethod: 'POST', resource: 'PRODUCT_IMAGE' }]
  });
  const errors = staged.stagedUploadsCreate.userErrors;
  if (errors.length) throw new Error(`Shopify staged upload failed: ${JSON.stringify(errors)}`);
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  form.append('file', imageBlob, filename);
  const uploadResponse = await fetch(target.url, { method: 'POST', body: form });
  if (!uploadResponse.ok) throw new Error(`Shopify staged file POST failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
  return { resourceUrl: target.resourceUrl, filename };
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

async function createShopifyProduct(env, product, imageResourceUrl, visibleTitle) {
  const sizes = inferSizes(product, env);
  const productSet = await shopifyGraphql(env, PRODUCT_SET_MUTATION, {
    synchronous: true,
    input: {
      title: visibleTitle,
      descriptionHtml: buildDescriptionHtml(),
      vendor: env.SHOPIFY_VENDOR || 'ESNTLS Club',
      productType: env.SHOPIFY_PRODUCT_TYPE || 'Placeholder',
      status: env.SHOPIFY_PRODUCT_STATUS || 'ACTIVE',
      tags: sourceTags(product),
      productOptions: [{ name: 'Size', position: 1, values: sizes.map(size => ({ name: size })) }],
      variants: sizes.map(size => ({
        optionValues: [{ optionName: 'Size', name: size }],
        price: product.price,
        sku: `ESNTLS-${slugify(product.id)}-${slugify(size).toUpperCase()}`
      }))
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
    sizes,
    featuredImageUrl: mediaUpdate.productUpdate.product.featuredMedia?.preview?.image?.url || null,
    shopifyUrl: storefrontUrl(env, created.handle)
  };
}

async function createWixBackupProduct(env, product, visibleTitle) {
  if (!env.WIX_API_TOKEN || !env.WIX_SITE_ID) {
    return { status: 'skipped', reason: 'WIX_API_TOKEN or WIX_SITE_ID is not configured' };
  }
  const sizes = inferSizes(product, env);
  const variantPrice = { actualPrice: { amount: product.price } };
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
        options: [{
          name: 'Size',
          optionRenderType: 'TEXT_CHOICES',
          choicesSettings: { choices: sizes.map(size => ({ choiceType: 'CHOICE_TEXT', name: size })) }
        }],
        variantsInfo: {
          variants: sizes.map(size => ({
            visible: true,
            choices: [{ optionChoiceNames: { optionName: 'Size', choiceName: size, renderType: 'TEXT_CHOICES' } }],
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

  const existing = await findExistingShopifyProduct(env, product);
  let status = 'created';
  let visibleTitle = existing?.title || buildPlaceholderTitle(product);
  let shopifyProduct;
  let uploadedFilename = '';

  if (existing) {
    status = 'existing';
    shopifyProduct = { id: existing.id, title: existing.title, handle: existing.handle, shopifyUrl: storefrontUrl(env, existing.handle) };
  } else {
    const generatedImage = await generateBlankImage(env, product);
    const upload = await uploadProductImageToShopify(env, product, generatedImage);
    uploadedFilename = upload.filename;
    shopifyProduct = await createShopifyProduct(env, product, upload.resourceUrl, visibleTitle);
  }

  let wixBackup = rawProduct.wixBackupPlaceholder || null;
  if (!wixBackup && requestBody.createWixBackup !== false) {
    try {
      wixBackup = await createWixBackupProduct(env, product, visibleTitle);
    } catch (error) {
      wixBackup = { status: 'error', error: error.message };
    }
  }

  const shopifyUrl = shopifyProduct.shopifyUrl;
  rawProduct.link = shopifyUrl;
  rawProduct.shopifyPlaceholder = {
    status,
    sourceId: product.id,
    sourceTitle: product.title,
    shopifyProductId: shopifyProduct.id,
    shopifyTitle: shopifyProduct.title,
    shopifyUrl,
    uploadedFilename,
    sizes: shopifyProduct.sizes || inferSizes(product, env),
    generatedAt: new Date().toISOString()
  };
  if (wixBackup) rawProduct.wixBackupPlaceholder = wixBackup;

  await env.BUCKET.put('products.json', JSON.stringify(payload, null, 2) + '\n', {
    httpMetadata: { contentType: 'application/json' }
  });

  return { ok: true, status, productId: product.id, shopifyUrl, shopify: rawProduct.shopifyPlaceholder, wixBackup };
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (req.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'POST' && parts[0] === 'shopify-create-product') {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
      try {
        return json(await createShopifyPlaceholderFromR2(env, body));
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
        const body = JSON.stringify({ search: { paging: { limit: 100, cursor } } });
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
