#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomInt } from "node:crypto";

const DEFAULT_PRODUCTS_URL =
  "https://pub-43c9cf7fd2904289881c21839332521c.r2.dev/products.json";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";
const DEFAULT_STATE_PATH = path.join(
  process.cwd(),
  "outputs",
  "blank-product-workflow",
  "state.json",
);
const DEFAULT_GENERATED_DIR = path.join(
  process.cwd(),
  "outputs",
  "blank-product-workflow",
  "generated",
);

const PLACEHOLDER_PREFIXES = [
  "Daily Item",
  "Studio Item",
  "Select Item",
  "Core Item",
  "Essential Item",
  "Clean Item",
  "Archive Item",
  "Standard Item",
];

const STAGED_UPLOAD_MUTATION = `
mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters {
        name
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

const PRODUCT_SEARCH_QUERY = `
query ProductsBySourceTag($query: String!) {
  products(first: 1, query: $query) {
    nodes {
      id
      title
      handle
      tags
    }
  }
}`;

const PRODUCT_SET_MUTATION = `
mutation ProductSet($input: ProductSetInput!, $synchronous: Boolean!) {
  productSet(input: $input, synchronous: $synchronous) {
    product {
      id
      title
      handle
      variants(first: 100) {
        nodes {
          id
          title
          sku
          price
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

const PRODUCT_UPDATE_MEDIA_MUTATION = `
mutation ProductUpdateMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
  productUpdate(product: $product, media: $media) {
    product {
      id
      title
      handle
      featuredMedia {
        preview {
          image {
            url
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

const PUBLICATIONS_QUERY = `
query PublicationsForStorefront {
  publications(first: 20) {
    nodes {
      id
      name
    }
  }
}`;

const PUBLISHABLE_PUBLISH_MUTATION = `
mutation PublishProductToOnlineStore($id: ID!, $publicationId: ID!) {
  publishablePublish(id: $id, input: { publicationId: $publicationId }) {
    publishable {
      ... on Product {
        id
        title
        handle
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function slugify(value) {
  return String(value || "product")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function randomPlaceholderTitle() {
  const prefix = PLACEHOLDER_PREFIXES[randomInt(0, PLACEHOLDER_PREFIXES.length)];
  return `${prefix} ${randomInt(1000, 10000)}`;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProduct(rawProduct) {
  const name = rawProduct.name || rawProduct.title || rawProduct.productName;
  const categories = splitList(rawProduct.category || rawProduct.categories);
  const image =
    rawProduct.image ||
    rawProduct.imageUrl ||
    rawProduct.featuredImage ||
    rawProduct.thumbnail ||
    rawProduct.images?.[0]?.url ||
    rawProduct.images?.[0];

  return {
    id: rawProduct.id || rawProduct.productId || rawProduct.slug || slugify(name),
    title: name,
    price: rawProduct.price || rawProduct.price_gbp || rawProduct.sale_price_gbp,
    image,
    sizes: splitList(rawProduct.sizes || rawProduct.size || rawProduct.availableSizes),
    categories,
    active: rawProduct.active !== false,
    raw: rawProduct,
  };
}

function inferSizes(product) {
  if (product.sizes.length) {
    return { sizes: product.sizes, source: "product" };
  }

  const text = `${product.title || ""} ${product.categories.join(" ")}`.toLowerCase();

  if (/(sandal|slide|trainer|sneaker|shoe|footwear|b22|b30)/.test(text)) {
    return {
      sizes: splitList(process.env.DEFAULT_FOOTWEAR_SIZES || "UK 6,UK 7,UK 8,UK 9,UK 10,UK 11"),
      source: "inferred-footwear",
    };
  }

  if (/(shirt|tee|short|jacket|tracksuit|hoodie|clothing|top|casablanca)/.test(text)) {
    return {
      sizes: splitList(process.env.DEFAULT_CLOTHING_SIZES || "S,M,L,XL"),
      source: "inferred-clothing",
    };
  }

  return {
    sizes: splitList(process.env.DEFAULT_SIZES || "S,M,L,XL"),
    source: "default",
  };
}

function buildImagePrompt(product) {
  return [
    "Use case: precise-object-edit",
    "Asset type: Shopify product image for ESNTLS Blanks",
    `Input image: the source image for "${product.title}" is the edit target and subject reference.`,
    "Primary request: create a blank placeholder version of this product image. Keep it as one single realistic product photo. Remove all visible branding, logos, labels, tags, marks, and any readable text. Replace the original background with a neutral grey concrete floor/background matching clean ecommerce blank-product photography.",
    "Subject: same product type, shape, color family, material feel, and silhouette as the source image, but completely unbranded.",
    "Composition/framing: square product image, centered item, full item visible with comfortable padding, overhead or product-catalog angle matching the source.",
    "Lighting/mood: soft natural ecommerce lighting, subtle realistic shadows, clean and premium.",
    "Constraints: one item only; no logos; no text; no watermark; no original background; no model unless the original product absolutely requires fit context; no extra accessories; not an illustration.",
  ].join("\n");
}

function buildDescriptionHtml() {
  return [
    "<p><strong>Blank item = original item.</strong></p>",
    "<p><strong>Buy the blank item shown at checkout. You'll receive the original item you selected.</strong></p>",
  ].join("");
}

function sourceTags(product) {
  const titleSlug = slugify(product.title);
  return [
    "ESNTLS-BLANK-WORKFLOW",
    `ESNTLS-ID-${product.id}`,
    `ESNTLS-SOURCE-ID-${product.id}`,
    `ESNTLS-SOURCE-TITLE-${titleSlug}`,
    ...product.categories,
  ].filter(Boolean);
}

function sourceKey(product) {
  return String(product.id || product.title);
}

function storefrontUrl(handle) {
  const domain = shopifyStoreDomain();
  return `https://${domain}/products/${handle}`;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Add it to your environment or .env.local.`);
  }
  return value;
}

function shopifyStoreDomain() {
  return requiredEnv("SHOPIFY_STORE_DOMAIN").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

let cachedShopifyAccessToken = null;
let cachedShopifyAccessTokenExpiresAt = 0;

async function getShopifyAccessToken() {
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  }

  if (cachedShopifyAccessToken && Date.now() < cachedShopifyAccessTokenExpiresAt - 60_000) {
    return cachedShopifyAccessToken;
  }

  const storeDomain = shopifyStoreDomain();
  const clientId = requiredEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = requiredEnv("SHOPIFY_CLIENT_SECRET");
  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  const json = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok || !json.access_token) {
    throw new Error(`Shopify access token request failed: ${JSON.stringify(json)}`);
  }

  cachedShopifyAccessToken = json.access_token;
  cachedShopifyAccessTokenExpiresAt = Date.now() + Number(json.expires_in || 86_400) * 1000;
  return cachedShopifyAccessToken;
}

async function loadState(statePath) {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return { processed: {}, skipped: {}, createdAt: new Date().toISOString() };
  }
}

async function saveState(statePath, state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function shopifyGraphql(query, variables) {
  const storeDomain = shopifyStoreDomain();
  const token = await getShopifyAccessToken();
  const response = await fetch(`https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok || json.errors?.length) {
    throw new Error(`Shopify GraphQL failed: ${JSON.stringify(json.errors || json)}`);
  }

  return json.data;
}

async function findExistingShopifyProduct(product) {
  const data = await shopifyGraphql(PRODUCT_SEARCH_QUERY, {
    query: `(tag:ESNTLS-SOURCE-ID-${product.id}) OR (tag:ESNTLS-ID-${product.id})`,
  });

  return data.products.nodes[0] || null;
}

async function findOnlineStorePublicationId() {
  const data = await shopifyGraphql(PUBLICATIONS_QUERY, {});
  const publication = data.publications.nodes.find((node) => node.name === "Online Store");

  if (!publication) {
    throw new Error("Could not find the Shopify Online Store publication.");
  }

  return publication.id;
}

async function publishProductToOnlineStore(productId) {
  if (process.env.SHOPIFY_PUBLISH_ONLINE_STORE === "false") return null;

  const publicationId = process.env.SHOPIFY_ONLINE_STORE_PUBLICATION_ID || (await findOnlineStorePublicationId());
  const data = await shopifyGraphql(PUBLISHABLE_PUBLISH_MUTATION, {
    id: productId,
    publicationId,
  });

  const errors = data.publishablePublish.userErrors;
  if (errors.length) {
    throw new Error(`Shopify publishablePublish failed: ${JSON.stringify(errors)}`);
  }

  return data.publishablePublish.publishable;
}

async function readImageForOpenAI(imageSource) {
  if (/^https?:\/\//i.test(imageSource)) {
    const response = await fetch(imageSource);
    if (!response.ok) {
      throw new Error(`Source image download failed: ${response.status} ${await response.text()}`);
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType, filename: path.basename(new URL(imageSource).pathname) || "source.png" };
  }

  const buffer = await readFile(imageSource);
  const ext = path.extname(imageSource).toLowerCase();
  const contentType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return { buffer, contentType, filename: path.basename(imageSource) };
}

async function generateBlankImage(product) {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const { buffer, contentType, filename } = await readImageForOpenAI(product.image);
  const sourceFile = new File([buffer], filename, { type: contentType });
  const form = new FormData();

  form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1");
  form.append("prompt", buildImagePrompt(product));
  form.append("size", process.env.OPENAI_IMAGE_SIZE || "1024x1024");
  form.append("image", sourceFile);

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const json = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    throw new Error(`OpenAI image generation failed: ${JSON.stringify(json)}`);
  }

  const first = json.data?.[0];
  if (first?.b64_json) {
    return Buffer.from(first.b64_json, "base64");
  }

  if (first?.url) {
    const imageResponse = await fetch(first.url);
    if (!imageResponse.ok) {
      throw new Error(`Generated image URL download failed: ${imageResponse.status}`);
    }
    return Buffer.from(await imageResponse.arrayBuffer());
  }

  throw new Error(`OpenAI image response did not include b64_json or url: ${JSON.stringify(json)}`);
}

async function uploadProductImageToShopify(product, imageBuffer) {
  const filename = `${slugify(product.id)}-${slugify(product.title)}-blank.png`;
  const staged = await shopifyGraphql(STAGED_UPLOAD_MUTATION, {
    input: [
      {
        filename,
        mimeType: "image/png",
        httpMethod: "POST",
        resource: "PRODUCT_IMAGE",
      },
    ],
  });

  const errors = staged.stagedUploadsCreate.userErrors;
  if (errors.length) {
    throw new Error(`Shopify staged upload failed: ${JSON.stringify(errors)}`);
  }

  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const parameter of target.parameters) {
    form.append(parameter.name, parameter.value);
  }
  form.append("file", new File([imageBuffer], filename, { type: "image/png" }));

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: form,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Shopify staged file POST failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
  }

  return { resourceUrl: target.resourceUrl, filename };
}

async function createShopifyProduct(product, imageResourceUrl, visibleTitle) {
  const { sizes, source: sizeSource } = inferSizes(product);
  const price = String(product.price);

  const productSet = await shopifyGraphql(PRODUCT_SET_MUTATION, {
    synchronous: true,
    input: {
      title: visibleTitle,
      descriptionHtml: buildDescriptionHtml(),
      vendor: process.env.SHOPIFY_VENDOR || "ESNTLS Club",
      productType: process.env.SHOPIFY_PRODUCT_TYPE || "Placeholder",
      status: process.env.SHOPIFY_PRODUCT_STATUS || "ACTIVE",
      tags: sourceTags(product),
      productOptions: [
        {
          name: "Size",
          position: 1,
          values: sizes.map((size) => ({ name: size })),
        },
      ],
      variants: sizes.map((size) => ({
        optionValues: [{ optionName: "Size", name: size }],
        price,
        sku: `ESNTLS-${slugify(product.id)}-${slugify(size).toUpperCase()}`,
      })),
    },
  });

  const productErrors = productSet.productSet.userErrors;
  if (productErrors.length) {
    throw new Error(`Shopify productSet failed: ${JSON.stringify(productErrors)}`);
  }

  const created = productSet.productSet.product;

  const mediaUpdate = await shopifyGraphql(PRODUCT_UPDATE_MEDIA_MUTATION, {
    product: { id: created.id },
    media: [
      {
        originalSource: imageResourceUrl,
        mediaContentType: "IMAGE",
        alt: `${visibleTitle} blank product image`,
      },
    ],
  });

  const mediaErrors = mediaUpdate.productUpdate.userErrors;
  if (mediaErrors.length) {
    throw new Error(`Shopify productUpdate media failed: ${JSON.stringify(mediaErrors)}`);
  }

  await publishProductToOnlineStore(created.id);

  return {
    ...created,
    sizeSource,
    sizes,
    featuredImageUrl: mediaUpdate.productUpdate.product.featuredMedia?.preview?.image?.url || null,
    url: storefrontUrl(created.handle),
  };
}

async function saveGeneratedImage(product, imageBuffer, generatedDir) {
  await mkdir(generatedDir, { recursive: true });
  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(product.id)}-${slugify(product.title)}-blank.png`;
  const outPath = path.join(generatedDir, filename);
  await writeFile(outPath, imageBuffer);
  return outPath;
}

function shouldSkipProduct(product) {
  if (!product.active) return "inactive";
  if (!product.title) return "missing-title";
  if (!product.price) return "missing-price";
  if (!product.image) return "missing-image";
  return null;
}

async function processProduct(product, options, state) {
  const key = sourceKey(product);

  if (state.processed[key]) {
    return { status: "already-processed", product };
  }

  const skipReason = shouldSkipProduct(product);
  if (skipReason) {
    state.skipped[key] = {
      reason: skipReason,
      title: product.title,
      at: new Date().toISOString(),
    };
    return { status: "skipped", reason: skipReason, product };
  }

  const visibleTitle = randomPlaceholderTitle();

  if (options.dryRun) {
    return { status: "dry-run", product, visibleTitle, sizes: inferSizes(product) };
  }

  const existing = await findExistingShopifyProduct(product);
  if (existing) {
    state.processed[key] = {
      sourceTitle: product.title,
      shopifyProductId: existing.id,
      shopifyTitle: existing.title,
      shopifyUrl: storefrontUrl(existing.handle),
      existing: true,
      at: new Date().toISOString(),
    };
    return { status: "existing", product, shopify: state.processed[key] };
  }

  const generatedImage = await generateBlankImage(product);
  const generatedPath = await saveGeneratedImage(product, generatedImage, options.generatedDir);
  const upload = await uploadProductImageToShopify(product, generatedImage);
  const shopifyProduct = await createShopifyProduct(product, upload.resourceUrl, visibleTitle);

  state.processed[key] = {
    sourceId: product.id,
    sourceTitle: product.title,
    sourceImage: product.image,
    shopifyProductId: shopifyProduct.id,
    shopifyTitle: shopifyProduct.title,
    shopifyUrl: shopifyProduct.url,
    generatedPath,
    uploadedFilename: upload.filename,
    sizes: shopifyProduct.sizes,
    sizeSource: shopifyProduct.sizeSource,
    at: new Date().toISOString(),
  };

  return { status: "created", product, shopify: state.processed[key] };
}

async function runOnce(options) {
  const productsUrl = options.productsUrl || process.env.ESNTLS_PRODUCTS_URL || DEFAULT_PRODUCTS_URL;
  const state = await loadState(options.statePath);
  const rawProducts = await fetchJson(productsUrl);
  const products = (Array.isArray(rawProducts) ? rawProducts : rawProducts.products || [])
    .map(normalizeProduct)
    .filter((product) => {
      if (!options.sourceTitle) return true;
      return String(product.title || "").toLowerCase().includes(options.sourceTitle.toLowerCase());
    });

  const limit = Number(options.limit || process.env.WORKER_LIMIT || products.length);
  const selectedProducts = products.slice(0, limit);
  const results = [];

  for (const product of selectedProducts) {
    try {
      const result = await processProduct(product, options, state);
      results.push(result);
      console.log(`[${result.status}] ${product.title}${result.shopify?.shopifyUrl ? ` -> ${result.shopify.shopifyUrl}` : ""}`);
    } catch (error) {
      state.skipped[sourceKey(product)] = {
        reason: "error",
        message: error.message,
        title: product.title,
        at: new Date().toISOString(),
      };
      results.push({ status: "error", product, error: error.message });
      console.error(`[error] ${product.title}: ${error.message}`);
    }

    await saveState(options.statePath, state);
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`
Usage:
  node scripts/esntls-handsfree-worker.mjs --once
  node scripts/esntls-handsfree-worker.mjs --watch --interval-ms 300000

Required environment:
  OPENAI_API_KEY
  SHOPIFY_STORE_DOMAIN
  SHOPIFY_CLIENT_ID
  SHOPIFY_CLIENT_SECRET

Optional legacy Shopify environment:
  SHOPIFY_ADMIN_ACCESS_TOKEN

Optional environment:
  ESNTLS_PRODUCTS_URL
  OPENAI_IMAGE_MODEL=gpt-image-1
  OPENAI_IMAGE_SIZE=1024x1024
  SHOPIFY_API_VERSION=2026-04
  SHOPIFY_PRODUCT_STATUS=ACTIVE
  DEFAULT_CLOTHING_SIZES=S,M,L,XL
  DEFAULT_FOOTWEAR_SIZES=UK 6,UK 7,UK 8,UK 9,UK 10,UK 11
`);
    return;
  }

  const options = {
    dryRun: Boolean(args["dry-run"]),
    sourceTitle: args["source-title"],
    limit: args.limit,
    productsUrl: args["products-url"],
    statePath: args["state-path"] || process.env.WORKER_STATE_PATH || DEFAULT_STATE_PATH,
    generatedDir: args["generated-dir"] || process.env.WORKER_GENERATED_DIR || DEFAULT_GENERATED_DIR,
  };

  if (args.watch) {
    const intervalMs = Number(args["interval-ms"] || process.env.WORKER_INTERVAL_MS || 300000);
    console.log(`Watching ESNTLS products every ${intervalMs}ms...`);
    await runOnce(options);
    setInterval(() => {
      runOnce(options).catch((error) => console.error(`[worker-error] ${error.message}`));
    }, intervalMs);
    return;
  }

  await runOnce(options);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
