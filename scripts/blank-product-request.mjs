#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PRODUCTS_URL =
  "https://pub-43c9cf7fd2904289881c21839332521c.r2.dev/products.json";

const RANDOM_PREFIXES = [
  "Daily Item",
  "Studio Item",
  "Select Item",
  "Core Item",
  "Essential Item",
  "Clean Item",
  "Archive Item",
  "Standard Item",
];

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
  const prefix = RANDOM_PREFIXES[Math.floor(Math.random() * RANDOM_PREFIXES.length)];
  const number = Math.floor(1000 + Math.random() * 9000);
  return `${prefix} ${number}`;
}

function normalizeSizes(value) {
  if (!value) return ["S", "M", "L", "XL"];
  return String(value)
    .split(",")
    .map((size) => size.trim())
    .filter(Boolean);
}

function productMatches(product, args) {
  if (args["source-id"] && String(product.id) === String(args["source-id"])) {
    return true;
  }

  if (args["source-title"]) {
    return String(product.name || "")
      .toLowerCase()
      .includes(String(args["source-title"]).toLowerCase());
  }

  return false;
}

async function fetchSourceProduct(args) {
  if (!args["source-id"] && !args["source-title"]) return null;
  if (args["no-fetch"]) return null;

  const productsUrl = args["products-url"] || process.env.ESNTLS_PRODUCTS_URL || DEFAULT_PRODUCTS_URL;

  try {
    const response = await fetch(productsUrl);
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    const products = await response.json();
    if (!Array.isArray(products)) return null;

    return products.find((product) => productMatches(product, args)) || null;
  } catch (error) {
    console.warn(`Could not fetch ESNTLS products: ${error.message}`);
    return null;
  }
}

function buildPrompt(request) {
  return [
    "Use case: precise-object-edit",
    "Asset type: Shopify product image for ESNTLS Blanks",
    `Input image: ${request.sourceImage || "source product image"} is the edit target and subject reference.`,
    "Primary request: create a blank placeholder version of this product image. Keep it as one single realistic product photo. Remove all visible branding, logos, labels, tags, marks, and any readable text. Replace the background with a neutral grey concrete floor/background matching clean ecommerce blank-product photography.",
    "Subject: same product type, shape, color family, material feel, and silhouette as the source image, but completely unbranded.",
    "Composition/framing: square product image, centered item, full item visible with comfortable padding, overhead or product-catalog angle matching the source.",
    "Lighting/mood: soft natural ecommerce lighting, subtle realistic shadows, clean and premium.",
    "Constraints: one item only; no logos; no text; no watermark; no original background; no model unless the original product absolutely requires fit context; no extra accessories; not an illustration.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args["source-title"] && !args["source-id"])) {
    console.log(`
Usage:
  node scripts/blank-product-request.mjs --source-title "Product name" --price 34.99 --sizes S,M,L,XL --image "C:\\path\\image.png"

Options:
  --source-id       ESNTLS source product ID
  --source-title    ESNTLS source product title
  --price           Product price, for example 34.99
  --sizes           Comma-separated sizes, defaults to S,M,L,XL
  --image           Local path or URL for the real product image
  --products-url    Optional ESNTLS products JSON URL
  --no-fetch        Do not try to fetch ESNTLS product data
`);
    return;
  }

  const sourceProduct = await fetchSourceProduct(args);
  const sourceTitle = args["source-title"] || sourceProduct?.name;
  const sourceId = args["source-id"] || sourceProduct?.id || null;
  const sourceImage = args.image || sourceProduct?.image || null;
  const price = args.price || sourceProduct?.price || sourceProduct?.price_gbp || null;
  const sizes = normalizeSizes(args.sizes || sourceProduct?.sizes);
  const categories = sourceProduct?.category
    ? String(sourceProduct.category)
        .split(",")
        .map((category) => category.trim())
        .filter(Boolean)
    : [];

  if (!sourceTitle) {
    throw new Error("Missing source title. Pass --source-title.");
  }

  if (!price) {
    throw new Error("Missing price. Pass --price.");
  }

  if (!sourceImage) {
    console.warn("No source image found. Add an image path or URL to the request JSON before asking Codex to create the product.");
  }

  const createdAt = new Date().toISOString();
  const placeholderTitle = args["placeholder-title"] || randomPlaceholderTitle();
  const slug = slugify(`${sourceId || "new"}-${sourceTitle}`);
  const timestamp = createdAt.replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "outputs", "blank-product-workflow", "requests");
  const requestPath = path.join(outDir, `${timestamp}-${slug}.json`);
  const promptPath = path.join(outDir, `${timestamp}-${slug}.prompt.txt`);

  const request = {
    createdAt,
    workflow: "esntls-blank-product",
    source: {
      id: sourceId,
      title: sourceTitle,
      image: sourceImage,
      categories,
    },
    shopify: {
      visibleTitle: placeholderTitle,
      vendor: "ESNTLS Club",
      productType: "Placeholder",
      price: String(price),
      sizes,
      status: "ACTIVE",
      descriptionHtml:
        "<p><strong>Blank item = original item.</strong></p><p><strong>Buy the blank item shown at checkout. You'll receive the original item you selected.</strong></p>",
      tags: [
        "ESNTLS-BLANK-WORKFLOW",
        ...(sourceId ? [`ESNTLS-SOURCE-ID-${sourceId}`] : []),
        `ESNTLS-SOURCE-TITLE-${slugify(sourceTitle)}`,
        ...categories,
      ],
    },
    imageGeneration: {
      prompt: buildPrompt({ sourceImage }),
      targetBackground: "grey concrete ecommerce product background",
      outputFilename: `${slug}-blank.png`,
    },
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  await writeFile(promptPath, `${request.imageGeneration.prompt}\n`, "utf8");

  console.log("Blank product request created:");
  console.log(requestPath);
  console.log("");
  console.log("Generated Shopify placeholder title:");
  console.log(placeholderTitle);
  console.log("");
  console.log("Next Codex instruction:");
  console.log("Create the Shopify blank product from the latest blank-product request.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
