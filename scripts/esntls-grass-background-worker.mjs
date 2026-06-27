#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";

const DEFAULT_PRODUCTS_URL =
  "https://pub-43c9cf7fd2904289881c21839332521c.r2.dev/products.json";
const DEFAULT_R2_PUBLIC_BASE = "https://pub-43c9cf7fd2904289881c21839332521c.r2.dev/";
const DEFAULT_PRODUCTS_OBJECT_KEY = "products.json";
const DEFAULT_GENERATED_DIR = path.join(
  process.cwd(),
  "outputs",
  "grass-background-workflow",
  "generated",
);

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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalEnv(name) {
  return process.env[name] || "";
}

function slugify(value) {
  return String(value || "product")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

function hmacHex(key, data) {
  return createHmac("sha256", key).update(data).digest("hex");
}

function productImages(rawProduct) {
  if (Array.isArray(rawProduct.images)) {
    return rawProduct.images
      .map((image) => (typeof image === "string" ? image : image?.url))
      .filter(Boolean);
  }

  return [rawProduct.image || rawProduct.imageUrl || rawProduct.featuredImage || rawProduct.thumbnail].filter(Boolean);
}

function normalizeProduct(rawProduct) {
  const images = productImages(rawProduct);
  const grassBackground = rawProduct.grassBackground || {};
  const name = rawProduct.name || rawProduct.title || rawProduct.productName;

  return {
    id: rawProduct.id || rawProduct.productId || rawProduct.slug || slugify(name),
    title: name,
    active: rawProduct.active !== false,
    images,
    image: grassBackground.sourceImage || images[0],
    grassStatus: grassBackground.status || "",
    raw: rawProduct,
  };
}

function isEligibleProduct(product, options) {
  if (!product.active) return false;
  if (!product.title || !product.image) return false;
  if (options.includeExisting) return product.grassStatus !== "done";
  return product.grassStatus === "pending";
}

function productsObjectKey(productsUrl) {
  if (process.env.ESNTLS_PRODUCTS_OBJECT_KEY) return process.env.ESNTLS_PRODUCTS_OBJECT_KEY;

  try {
    const pathname = new URL(productsUrl).pathname.replace(/^\/+/, "");
    return pathname || DEFAULT_PRODUCTS_OBJECT_KEY;
  } catch {
    return DEFAULT_PRODUCTS_OBJECT_KEY;
  }
}

function r2Config() {
  const config = {
    accountId: optionalEnv("R2_ACCOUNT_ID"),
    bucketName: optionalEnv("R2_BUCKET_NAME"),
    accessKeyId: optionalEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: optionalEnv("R2_SECRET_ACCESS_KEY"),
  };
  const missing = [
    ["R2_ACCOUNT_ID", config.accountId],
    ["R2_BUCKET_NAME", config.bucketName],
    ["R2_ACCESS_KEY_ID", config.accessKeyId],
    ["R2_SECRET_ACCESS_KEY", config.secretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return { config, missing };
}

function assertConfiguredForLiveRun() {
  requiredEnv("OPENAI_API_KEY");

  const { missing } = r2Config();
  if (missing.length) {
    throw new Error(`Missing R2 environment values: ${missing.join(", ")}`);
  }
}

async function putR2Object(key, body, contentType) {
  const { config, missing } = r2Config();
  if (missing.length) {
    throw new Error(`Cannot write R2 object; missing ${missing.join(", ")}`);
  }

  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const endpoint = `https://${host}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const encodedKey = encodeURIComponent(key).replace(/%2F/g, "/");
  const requestPath = `/${config.bucketName}/${encodedKey}`;
  const payloadHash = "UNSIGNED-PAYLOAD";
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${requestPath}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = hmacHex(signingKey, stringToSign);
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`${endpoint}${requestPath}`, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed for ${key}: ${response.status} ${await response.text()}`);
  }
}

async function putR2JsonObject(key, data) {
  await putR2Object(key, `${JSON.stringify(data, null, 2)}\n`, "application/json");
}

function publicR2Url(key) {
  const base = process.env.R2_PUBLIC_BASE || DEFAULT_R2_PUBLIC_BASE;
  return `${base.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${await response.text()}`);
  }

  return response.json();
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

function buildGrassPrompt(product) {
  return [
    "Use case: precise-product-background-replacement",
    "Asset type: ESNTLS Club ecommerce product image",
    `Input image: the source image for "${product.title}" is the exact product reference.`,
    "Primary request: place the exact same product onto a clean green grass background. Keep the product unchanged and realistic.",
    "Background: close-cropped green grass or artificial turf, evenly lit, premium ecommerce look, similar to ESNTLS Club grass product photography.",
    "Product preservation: keep the same product shape, colors, materials, logos, labels, stitching, patterns, and visible details from the source image. Do not blank or rebrand the item.",
    "Composition/framing: square product photo, centered item, full item visible with comfortable padding, overhead or product-catalog angle matching the source.",
    "Lighting/mood: natural daylight, realistic soft shadows, crisp detail, clean resale/streetwear product presentation.",
    "Constraints: one product only; no model; no hands; no extra props; no extra text; no watermark; not an illustration.",
  ].join("\n");
}

async function generateGrassImage(product) {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const source = await readImageForOpenAI(product.image);
  const sourceFile = new File([source.buffer], source.filename, { type: source.contentType });
  const backgroundUrl = process.env.GRASS_BACKGROUND_IMAGE_URL || "";
  const background = backgroundUrl ? await readImageForOpenAI(backgroundUrl) : null;
  const form = new FormData();

  form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1");
  form.append("prompt", buildGrassPrompt(product));
  form.append("size", process.env.OPENAI_IMAGE_SIZE || "1024x1024");
  form.append("quality", process.env.OPENAI_IMAGE_QUALITY || "medium");

  if (background) {
    form.append("image[]", sourceFile);
    form.append("image[]", new File([background.buffer], background.filename, { type: background.contentType }));
  } else {
    form.append("image", sourceFile);
  }

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

async function saveGeneratedImage(product, imageBuffer, generatedDir) {
  await mkdir(generatedDir, { recursive: true });
  const filename = `${slugify(product.id)}-${slugify(product.title)}-grass.png`;
  const outPath = path.join(generatedDir, filename);
  await writeFile(outPath, imageBuffer);
  return outPath;
}

function uniqueImages(images) {
  return [...new Set(images.filter(Boolean))];
}

async function updateSourceProductGrassImage(product, grassUrl, productsUrl) {
  const rawProducts = await fetchJson(`${productsUrl}${productsUrl.includes("?") ? "&" : "?"}grass=${Date.now()}`);
  const products = Array.isArray(rawProducts) ? rawProducts : rawProducts.products;

  if (!Array.isArray(products)) {
    throw new Error("Cannot update source product because products.json is not an array.");
  }

  const source = products.find((item) => String(item.id) === String(product.id));
  if (!source) {
    throw new Error(`Cannot update source product because product ID ${product.id} was not found.`);
  }

  const previousImages = productImages(source);
  const previousGrassImage = source.grassBackground?.image || "";
  const sourceImage = source.grassBackground?.sourceImage || product.image || previousImages[0];
  const keptImages = previousImages.filter((url) => url !== grassUrl && url !== previousGrassImage);

  source.images = uniqueImages([grassUrl, sourceImage, ...keptImages]);
  if (Object.hasOwn(source, "image")) {
    source.image = grassUrl;
  }
  source.grassBackground = {
    ...(source.grassBackground || {}),
    status: "done",
    sourceImage,
    image: grassUrl,
    processedAt: new Date().toISOString(),
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    promptVersion: "green-grass-v1",
  };

  await putR2JsonObject(productsObjectKey(productsUrl), rawProducts);

  return { image: grassUrl, sourceImage };
}

async function processProduct(product, options) {
  if (options.dryRun) {
    return { status: "dry-run", product };
  }

  const generatedImage = await generateGrassImage(product);
  const generatedPath = await saveGeneratedImage(product, generatedImage, options.generatedDir);
  const key = `grass-products/${slugify(product.id)}-${slugify(product.title)}-${Date.now()}.png`;
  await putR2Object(key, generatedImage, "image/png");
  const grassUrl = publicR2Url(key);
  const update = await updateSourceProductGrassImage(product, grassUrl, options.productsUrl);

  return { status: "created", product, grassUrl, generatedPath, update };
}

async function runOnce(options) {
  const productsUrl = options.productsUrl || process.env.ESNTLS_PRODUCTS_URL || DEFAULT_PRODUCTS_URL;
  options.productsUrl = productsUrl;

  if (!options.dryRun) {
    assertConfiguredForLiveRun();
  }

  const rawProducts = await fetchJson(productsUrl);
  const products = (Array.isArray(rawProducts) ? rawProducts : rawProducts.products || [])
    .map(normalizeProduct)
    .filter((product) => {
      if (!options.sourceTitle) return true;
      return String(product.title || "").toLowerCase().includes(options.sourceTitle.toLowerCase());
    })
    .filter((product) => isEligibleProduct(product, options));

  const limit = Number(options.limit || process.env.GRASS_WORKER_LIMIT || products.length);
  const selectedProducts = products.slice(0, limit);
  const results = [];

  if (!selectedProducts.length) {
    const sourceMessage = options.sourceTitle ? ` matching "${options.sourceTitle}"` : "";
    const modeMessage = options.includeExisting ? "eligible" : "pending";
    console.log(`No ${modeMessage} ESNTLS products${sourceMessage} need a grass background.`);
    return results;
  }

  for (const product of selectedProducts) {
    try {
      const result = await processProduct(product, options);
      results.push(result);
      console.log(
        `[${result.status}] ${product.title}${result.grassUrl ? ` -> ${result.grassUrl}` : ` (${product.image})`}`,
      );
    } catch (error) {
      results.push({ status: "error", product, error: error.message });
      console.error(`[error] ${product.title}: ${error.message}`);
    }
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`
Usage:
  node scripts/esntls-grass-background-worker.mjs --once
  node scripts/esntls-grass-background-worker.mjs --once --dry-run --limit 1

Required environment for live runs:
  OPENAI_API_KEY
  R2_ACCOUNT_ID
  R2_BUCKET_NAME
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY

Optional environment:
  ESNTLS_PRODUCTS_URL
  ESNTLS_PRODUCTS_OBJECT_KEY=products.json
  GRASS_BACKGROUND_IMAGE_URL
  GRASS_WORKER_LIMIT=1
  OPENAI_IMAGE_MODEL=gpt-image-1
  OPENAI_IMAGE_SIZE=1024x1024
  OPENAI_IMAGE_QUALITY=medium

By default this only processes products with grassBackground.status="pending".
Use --include-existing for a manual backfill run.
`);
    return;
  }

  const options = {
    dryRun: Boolean(args["dry-run"]),
    includeExisting: Boolean(args["include-existing"]),
    sourceTitle: args["source-title"],
    limit: args.limit,
    productsUrl: args["products-url"],
    generatedDir: args["generated-dir"] || process.env.GRASS_GENERATED_DIR || DEFAULT_GENERATED_DIR,
  };

  await runOnce(options);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
