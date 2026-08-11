const BRAND = {
  name: "ESNTLS Club",
  green: "#70c64a",
  black: "#0A0A0A",
  white: "#FAFAFA",
  defaultBackgroundPath: "/esntls-grass-background.jpg",
};

const JSON_TYPE = "application/json; charset=utf-8";
const PNG_TYPE = "image/png";
const JPEG_TYPE = "image/jpeg";
const WEBP_TYPE = "image/webp";
const MAX_EXTRA_INSTRUCTION_LENGTH = 2000;
const JOB_STALE_AFTER_MS = 15 * 60 * 1000;
const TERMINAL_JOB_STATUSES = ["complete", "partial", "failed", "cancelled"];
const SESSION_COOKIE = "esntls_studio_session";
const SESSION_VERSION = "v1";
const CATALOG_KEY = "products.json";
const BRAND_CATEGORIES = ["Apple", "Asics", "B22", "B30", "Burberry", "C Goose", "Corteiz", "CP", "Ermes", "Essentials", "Hermes", "LV", "Monc", "Nike"];
const DEFAULT_FOOTWEAR_SIZES = ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11", "UK 12"];
const DEFAULT_CLOTHING_SIZES = ["XS", "S", "M", "L", "XL"];

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request, env) });
      }

      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/+$/, "") || "/";

      if (pathname === "/api/health") {
        return json({ ok: true, service: "esntls-photo-studio-v2", brand: BRAND.name }, request, env);
      }

      if (pathname === "/api/login" && request.method === "POST") {
        return await login(request, env);
      }

      if (pathname === "/api/logout" && request.method === "POST") {
        return logout(request, env);
      }

      if (pathname === "/api/session" && request.method === "GET") {
        return json({ ok: true, authenticated: await isAdmin(request, env) }, request, env);
      }

      if (pathname === "/api/config" && request.method === "GET") {
        const imageModel = env.ESNTLS_STUDIO_OPENAI_IMAGE_MODEL || env.OPENAI_IMAGE_MODEL || "gpt-image-2";
        return json(
          {
            ok: true,
            brand: BRAND,
            imageModel,
            imageSize: outputSizeForModel(env, imageModel),
            keepCropImageSize: outputSizeForMode(env, imageModel, "keep-crop"),
            imageQuality: outputQualityForEnv(env),
            imageQualityOptions: ["medium", "high"],
            outputFormat: outputFormatForEnv(env),
            outputCompression: outputCompressionForEnv(env),
            maxBulkImages: maxBulkImages(env),
            yupooImportLimit: yupooImportLimit(env),
            requiresAdminToken: false,
            authenticated: await isAdmin(request, env),
            saveEnabled: Boolean(env.ESNTLS_STUDIO_MEDIA),
            publicMediaBaseUrl: env.ESNTLS_STUDIO_PUBLIC_URL || new URL(request.url).origin,
            costUsd: { medium: 0.041, high: 0.165 },
          },
          request,
          env,
        );
      }

      if (pathname === "/api/background" && request.method === "GET") {
        return await getDefaultBackground(request, env);
      }

      if (pathname.startsWith("/media/") && ["GET", "HEAD"].includes(request.method)) {
        return await getPublicMediaObject(request, env, pathname.slice("/media/".length));
      }

      if (pathname === "/api/yupoo-images" && request.method === "POST") {
        await requireAdmin(request, env);
        return await importYupooImages(request, env);
      }

      if (pathname === "/api/yupoo-preview" && request.method === "GET") {
        return await getYupooPreview(request, env);
      }

      if (pathname === "/api/generate" && request.method === "POST") {
        await requireAdmin(request, env);
        return await generatePreviews(request, env);
      }

      if (pathname === "/api/jobs" && request.method === "POST") {
        await requireAdmin(request, env);
        return await createBackgroundJob(request, env, ctx);
      }

      if (pathname === "/api/jobs" && request.method === "GET") {
        await requireAdmin(request, env);
        return await getBackgroundJobs(request, env, ctx);
      }

      if (pathname === "/api/jobs" && request.method === "DELETE") {
        await requireAdmin(request, env);
        return await deleteBackgroundJob(request, env);
      }

      if (pathname === "/api/jobs/resume" && request.method === "POST") {
        await requireAdmin(request, env);
        return await resumeBackgroundJob(request, env, ctx);
      }

      if (pathname === "/api/jobs/retry-failed" && request.method === "POST") {
        await requireAdmin(request, env);
        return await retryFailedBackgroundJob(request, env, ctx);
      }

      if (pathname === "/api/jobs/retry-product" && request.method === "POST") {
        await requireAdmin(request, env);
        return await retryBackgroundProduct(request, env);
      }

      if (pathname === "/api/jobs/cancel" && request.method === "POST") {
        await requireAdmin(request, env);
        return await cancelBackgroundJob(request, env);
      }

      if (pathname === "/api/save" && request.method === "POST") {
        await requireAdmin(request, env);
        return await saveGeneratedImages(request, env);
      }

      if (pathname === "/api/media" && request.method === "GET") {
        await requireAdmin(request, env);
        return await listMedia(request, env);
      }

      if (pathname === "/api/media" && request.method === "DELETE") {
        await requireAdmin(request, env);
        return await deleteMediaObject(request, env);
      }

      if (pathname === "/api/media/raw" && request.method === "GET") {
        await requireAdmin(request, env);
        return await getMediaObject(request, env);
      }

      if (pathname === "/api/admin/products" && request.method === "GET") {
        await requireAdmin(request, env);
        return await listAdminProducts(request, env);
      }

      if (pathname === "/api/admin/products" && request.method === "POST") {
        await requireAdmin(request, env);
        return await createAdminProduct(request, env);
      }

      const adminProductMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
      if (adminProductMatch && request.method === "PATCH") {
        await requireAdmin(request, env);
        return await updateAdminProduct(request, env, decodeURIComponent(adminProductMatch[1]));
      }

      if (adminProductMatch && request.method === "DELETE") {
        await requireAdmin(request, env);
        return await deleteAdminProduct(request, env, decodeURIComponent(adminProductMatch[1]));
      }

      const shopifyBlankMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)\/shopify-blank$/);
      if (shopifyBlankMatch && request.method === "POST") {
        await requireAdmin(request, env);
        return await createAdminShopifyBlank(request, env, decodeURIComponent(shopifyBlankMatch[1]));
      }

      if (pathname === "/api/admin/orders" && request.method === "GET") {
        await requireAdmin(request, env);
        return await listAdminOrders(request, env);
      }

      if (pathname === "/api/admin/users" && request.method === "GET") {
        await requireAdmin(request, env);
        return json({ ok: true, users: [] }, request, env);
      }

      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return json({ ok: false, error: "Not found" }, request, env, 404);
    } catch (error) {
      return json({ ok: false, error: error.message || "Request failed" }, request, env, error.status || 500);
    }
  },

  async queue(batch, env) {
    for (const message of batch.messages || []) {
      try {
        await processBackgroundJobMessage(env, message.body);
        message.ack?.();
      } catch (error) {
        if (isPermanentImageError(error)) {
          await failQueuedMessage(env, message.body, error);
          message.ack?.();
        } else {
          message.retry?.({ delaySeconds: 30 });
        }
      }
    }
  },
};

async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  const configured = String(env.ESNTLS_STUDIO_ADMIN_PASSWORD || "");
  if (!configured) throw statusError("Studio login is not configured.", 500);
  if (!(await constantTimeEqual(String(body.password || ""), configured))) {
    throw statusError("Incorrect admin password.", 401);
  }

  const maxAge = sessionMaxAgeSeconds(env);
  const token = await createSessionToken(env, Date.now() + maxAge * 1000);
  const response = json({ ok: true, authenticated: true }, request, env);
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
  );
  return response;
}

function logout(request, env) {
  const response = json({ ok: true, authenticated: false }, request, env);
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );
  return response;
}

async function requireAdmin(request, env) {
  if (!(await isAdmin(request, env))) {
    throw statusError("Your Studio session has expired. Log in again.", 401);
  }
  return true;
}

async function isAdmin(request, env) {
  const token = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return false;
  return await verifySessionToken(env, token);
}

function cookieValue(header, name) {
  for (const part of String(header || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function sessionMaxAgeSeconds(env) {
  const days = Math.max(1, Math.min(Number(env.ESNTLS_STUDIO_SESSION_DAYS || 30), 90));
  return Math.round(days * 24 * 60 * 60);
}

async function createSessionToken(env, expiresAt) {
  const secret = String(env.ESNTLS_STUDIO_SESSION_SECRET || "");
  if (!secret) throw statusError("Studio session secret is not configured.", 500);
  const payload = base64UrlEncode(JSON.stringify({ v: SESSION_VERSION, exp: expiresAt, nonce: crypto.randomUUID() }));
  const signature = await hmacSha256(secret, payload);
  return `${payload}.${signature}`;
}

async function verifySessionToken(env, token) {
  const secret = String(env.ESNTLS_STUDIO_SESSION_SECRET || "");
  if (!secret) return false;
  const [payload, suppliedSignature] = String(token || "").split(".");
  if (!payload || !suppliedSignature) return false;
  const expectedSignature = await hmacSha256(secret, payload);
  if (!(await constantTimeEqual(suppliedSignature, expectedSignature))) return false;
  try {
    const parsed = JSON.parse(base64UrlDecode(payload));
    return parsed.v === SESSION_VERSION && Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}

async function hmacSha256(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return base64UrlEncode(signature);
}

async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(left))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(right))),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    mismatch |= (a[index] || 0) ^ (b[index] || 0);
  }
  return mismatch === 0;
}

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

async function readCatalog(env) {
  if (!env.ESNTLS_CATALOG) throw statusError("ESNTLS catalog storage is not configured.", 500);
  const object = await env.ESNTLS_CATALOG.get(CATALOG_KEY);
  if (!object) return { envelope: null, products: [] };
  const payload = await object.json();
  return {
    envelope: Array.isArray(payload) ? null : payload,
    products: Array.isArray(payload) ? payload : Array.isArray(payload.products) ? payload.products : [],
  };
}

async function writeCatalog(env, catalog) {
  const payload = catalog.envelope ? { ...catalog.envelope, products: catalog.products } : catalog.products;
  await env.ESNTLS_CATALOG.put(CATALOG_KEY, `${JSON.stringify(payload, null, 2)}\n`, {
    httpMetadata: { contentType: JSON_TYPE, cacheControl: "no-cache" },
  });
}

function numericPrice(value) {
  const match = String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function splitValues(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
  return [...new Set(list.map((item) => String(item?.size ?? item ?? "").trim()).filter(Boolean))];
}

function splitImageValues(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
  return [...new Set(list.map((item) => String(item?.url ?? item ?? "").trim()).filter(Boolean))];
}

function isDefaultClothingSizes(sizes) {
  const normalized = splitValues(sizes).map((size) => size.toUpperCase());
  return normalized.length > 0 && normalized.every((size) => DEFAULT_CLOTHING_SIZES.includes(size));
}

function isFootwearProduct(name, categories) {
  return /\b(footwear|shoe|shoes|sneaker|sneakers|trainer|trainers|sandals?|slides?|sliders?|gats?|b22|b30|asics|gel|kayano|saucony)\b/i
    .test(`${name || ""} ${splitValues(categories).join(" ")}`);
}

export function normalizeProductSizes(sizes, name, categories) {
  const values = splitValues(sizes);
  if (isFootwearProduct(name, categories) && (!values.length || isDefaultClothingSizes(values))) {
    return DEFAULT_FOOTWEAR_SIZES;
  }
  return values;
}

function checkoutUrlForAdmin(product) {
  return product.checkoutLinks?.shopify || product.shopifyPlaceholder?.shopifyUrl ||
    (/\.myshopify\.com|\/products\//i.test(String(product.link || "")) ? product.link : "");
}

function adminProductShape(product) {
  const categories = splitValues(product.category || product.categories);
  const sizeValues = normalizeProductSizes(product.sizes, product.name || product.title, categories);
  const sizes = sizeValues.map((size) => ({ size, stock: 999999 }));
  return {
    id: String(product.id),
    name: product.name || product.title || "",
    brand: product.brand || "Other",
    price_gbp: numericPrice(product.price),
    sale_price_gbp: product.originalPrice ? numericPrice(product.price) : null,
    size_type: /footwear|shoe|sneaker|trainer|b22|b30/i.test(`${categories.join(" ")} ${product.name || ""}`) ? "shoe" : "clothing",
    active: product.active !== false && product.archived !== true && product.hidden !== true,
    supplier_name: product.supplierName || product.supplier_name || "",
    supplier_url: product.supplierLink || product.supplierUrl || product.supplier_url || "",
    categories,
    colours: splitValues(product.variationValues || product.colours || product.colors),
    sizes,
    images: splitImageValues(product.images).map((url) => ({ url })),
    description: product.description || `${product.delivery || "7-12 Days"} delivery.`,
    delivery: product.delivery || "7-12 Days",
    shopify_url: checkoutUrlForAdmin(product),
    raw: product,
  };
}

async function listAdminProducts(request, env) {
  const catalog = await readCatalog(env);
  return json({ ok: true, products: catalog.products.map(adminProductShape) }, request, env);
}

function nextProductId(products) {
  return Math.max(36, ...products.map((product) => Number(product.id) || 0)) + 1;
}

function inferBrand(categories, fallback = "Other") {
  const match = splitValues(categories).find((category) => BRAND_CATEGORIES.some((brand) => brand.toLowerCase() === category.toLowerCase()));
  return match || fallback || "Other";
}

function productRecordFromAdmin(body, existing = {}, id) {
  const categories = splitValues(body.categories || body.category);
  const colours = splitValues(body.colours || body.colors || body.variationValues);
  const name = String(body.name || existing.name).trim();
  const sizes = normalizeProductSizes(body.sizes, name, categories.length ? categories : splitValues(existing.category || "Footwear"));
  const price = numericPrice(body.price_gbp ?? body.price);
  if (!name) throw statusError("Product name is required.", 400);
  if (!price) throw statusError("Product price is required.", 400);
  const images = splitImageValues(body.images || existing.images);
  if (!images.length) throw statusError("Add at least one product image.", 400);
  return {
    ...existing,
    id: id ?? existing.id,
    name,
    category: (categories.length ? categories : splitValues(existing.category || "Footwear")).join(","),
    brand: String(body.brand || inferBrand(categories, existing.brand)).trim() || "Other",
    price: `£${price.toFixed(2)}`,
    originalPrice: body.sale_price_gbp ? `£${numericPrice(body.price_gbp).toFixed(2)}` : existing.originalPrice,
    link: body.link ?? existing.link ?? "",
    sizes,
    variationName: colours.length ? "Colour" : "",
    variationValues: colours,
    delivery: String(body.delivery || existing.delivery || "7-12 Days"),
    images,
    description: String(body.description || existing.description || ""),
    supplierName: String(body.supplier_name || body.supplierName || existing.supplierName || ""),
    supplierLink: String(body.supplier_url || body.supplierLink || existing.supplierLink || ""),
    created_at: existing.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    active: body.active !== false,
    archived: body.active === false,
  };
}

async function createAdminProduct(request, env) {
  const body = await request.json().catch(() => ({}));
  const catalog = await readCatalog(env);
  const product = productRecordFromAdmin(body, {}, nextProductId(catalog.products));
  catalog.products.unshift(product);
  await writeCatalog(env, catalog);
  const publicProduct = adminProductShape(product);
  return json({ ok: true, ...publicProduct, product: publicProduct }, request, env, 201);
}

async function updateAdminProduct(request, env, id) {
  const body = await request.json().catch(() => ({}));
  const catalog = await readCatalog(env);
  const index = catalog.products.findIndex((product) => String(product.id) === String(id));
  if (index < 0) throw statusError("Product was not found.", 404);
  catalog.products[index] = productRecordFromAdmin(body, catalog.products[index], catalog.products[index].id);
  await writeCatalog(env, catalog);
  const publicProduct = adminProductShape(catalog.products[index]);
  return json({ ok: true, ...publicProduct, product: publicProduct }, request, env);
}

async function deleteAdminProduct(request, env, id) {
  const catalog = await readCatalog(env);
  const index = catalog.products.findIndex((product) => String(product.id) === String(id));
  if (index < 0) throw statusError("Product was not found.", 404);
  const [deleted] = catalog.products.splice(index, 1);
  await writeCatalog(env, catalog);
  return json({ ok: true, deleted: { id: deleted.id, name: deleted.name } }, request, env);
}

async function callEsntlsStoreApi(env, path, body) {
  if (!env.ESNTLS_STORE_API || !env.ESNTLS_STORE_SERVICE_TOKEN) {
    throw statusError("Secure ESNTLS store connection is not configured.", 500);
  }
  const response = await env.ESNTLS_STORE_API.fetch(`https://esntls-store.internal/${path.replace(/^\/+/, "")}`, {
    method: "POST",
    headers: {
      "content-type": JSON_TYPE,
      "x-esntls-service-token": env.ESNTLS_STORE_SERVICE_TOKEN,
    },
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw statusError(payload.error || payload.detail || `ESNTLS store API failed (${response.status}).`, response.status);
  return payload;
}

async function createAdminShopifyBlank(request, env, id) {
  const body = await request.json().catch(() => ({}));
  const catalog = await readCatalog(env);
  const product = catalog.products.find((entry) => String(entry.id) === String(id));
  const sourceImage = await sourceImagePayloadForProduct(env, product).catch(() => null);
  const result = await callEsntlsStoreApi(env, "shopify-create-product", {
    productId: id,
    createWixBackup: true,
    shopifyTitleOverride: String(body.blank_title || "").trim(),
    sourceImage,
  });
  return json({
    ok: true,
    already: result.status === "existing",
    shopify_url: result.shopifyUrl,
    shopify_product_id: result.shopify?.shopifyProductId || "",
    shopify_handle: result.shopify?.shopifyUrl?.split("/products/")[1] || "",
    wix_backup: result.wixBackup || null,
  }, request, env);
}

async function listAdminOrders(request, env) {
  const object = await env.ESNTLS_CATALOG?.get("wix-orders.json");
  if (!object) return json({ ok: true, orders: [] }, request, env);
  const payload = await object.json();
  const orders = (payload.orders || []).map((order) => ({
    id: order.number || order.id,
    user_email: order.buyer?.email || "",
    total_gbp: numericPrice(order.total),
    status: order.fulfillmentStatus || order.status || "",
  }));
  return json({ ok: true, orders }, request, env);
}

async function importYupooImages(request, env) {
  const body = await request.json().catch(() => ({}));
  const sourceUrl = parseYupooPageUrl(body.url);
  const limit = yupooImportLimit(env, body.limit);
  const candidates = [];
  const visitedPages = new Set();
  let pagesScanned = 0;

  if (isLikelyYupooProductImageUrl(sourceUrl)) {
    candidates.push({ url: sourceUrl.toString(), pageUrl: sourceUrl.toString(), score: 120, order: 0 });
  } else {
    const firstHtml = await fetchYupooHtml(sourceUrl);
    pagesScanned += 1;
    visitedPages.add(sourceUrl.toString());
    candidates.push(...extractYupooImageCandidates(firstHtml, sourceUrl));

    const isAlbumPage = /\/albums\/\d+/i.test(sourceUrl.pathname);
    const albumLinks = isAlbumPage ? [] : extractYupooAlbumLinks(firstHtml, sourceUrl);
    for (const albumUrl of albumLinks.slice(0, 12)) {
      if (visitedPages.has(albumUrl)) continue;
      if (chooseBestYupooImages(candidates).length >= limit) break;
      try {
        const html = await fetchYupooHtml(new URL(albumUrl));
        visitedPages.add(albumUrl);
        pagesScanned += 1;
        candidates.push(...extractYupooImageCandidates(html, new URL(albumUrl)));
      } catch {
        // Some Yupoo albums block scraping or require a password; keep any images already found.
      }
    }
  }

  const allImages = chooseBestYupooImages(candidates);
  if (!allImages.length) {
    throw statusError("No Yupoo product images were found on that link.", 404);
  }

  const selected = allImages.slice(0, limit);
  const images = selected.map((candidate, index) => {
    const contentType = contentTypeFromImageUrl(candidate.url) || "image/jpeg";
    return {
      url: candidate.url,
      previewUrl: candidate.url,
      pageUrl: candidate.pageUrl || sourceUrl.toString(),
      filename: yupooFilename(candidate.url, index + 1, contentType),
      contentType,
    };
  });

  return json(
    {
      ok: true,
      sourceUrl: sourceUrl.toString(),
      images,
      totalFound: allImages.length,
      imported: images.length,
      failed: 0,
      truncated: allImages.length > selected.length,
      limit,
      pagesScanned,
      errors: [],
    },
    request,
    env,
  );
}

async function getYupooPreview(request, env) {
  const requestUrl = new URL(request.url);
  const imageUrl = parseYupooImageUrl(requestUrl.searchParams.get("url"));
  const referer = yupooReferer(requestUrl.searchParams.get("pageUrl"), imageUrl);
  const response = await fetch(imageUrl.toString(), {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      referer,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw statusError(`Yupoo preview could not be loaded (${response.status}).`, 502);
  }

  const fallbackType = contentTypeFromImageUrl(imageUrl.toString()) || "image/jpeg";
  const contentType = normalizeImageContentType(response.headers.get("content-type")) || fallbackType;
  if (!contentType.startsWith("image/")) {
    throw statusError("Yupoo returned a non-image preview response.", 502);
  }

  const buffer = await response.arrayBuffer();
  const maxMb = 20;
  if (buffer.byteLength > maxMb * 1024 * 1024) {
    throw statusError("Yupoo preview image is larger than 20MB.", 400);
  }

  return new Response(buffer, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600",
      ...corsHeaders(request, env),
    },
  });
}

async function generatePreviews(request, env) {
  const form = await request.formData();
  const extraInstruction = normalizeExtraInstruction(form.get("extraInstruction"));
  const imageQuality = requestedImageQuality(env, form.get("quality"));
  const uploadedFiles = form
    .getAll("products")
    .filter((file) => file && typeof file === "object" && file.size > 0);
  const productUrlItems = parseProductUrlItems(form.get("productUrls"));
  const productFiles = [...uploadedFiles];
  const generationMode = normalizeGenerationMode(form.get("mode"));
  const productModes = parseProductModes(form.get("productModes"), uploadedFiles.length + productUrlItems.length, generationMode);

  if (!uploadedFiles.length && !productUrlItems.length) {
    throw statusError("Upload at least one product image.", 400);
  }

  if (uploadedFiles.length + productUrlItems.length > maxBulkImages(env)) {
    throw statusError(`Upload ${maxBulkImages(env)} images or fewer per batch.`, 400);
  }

  for (const item of productUrlItems) {
    productFiles.push(await fetchRemoteProductFile(item));
  }

  const submittedBackground = form.get("background");
  const backgroundFile =
    submittedBackground && typeof submittedBackground === "object" && submittedBackground.size > 0
      ? submittedBackground
      : await loadDefaultBackgroundFile(request, env);
  const normalizedBackgroundFile = await normalizeImageFileForOpenAi(backgroundFile, "ESNTLS Club background");

  const results = [];
  const errors = [];

  for (let index = 0; index < productFiles.length; index += 1) {
    let productFile = productFiles[index];
    try {
      productFile = await normalizeImageFileForOpenAi(productFile, `Product ${index + 1}`);
      if ((productModes[index] || generationMode) === "keep") {
        const id = crypto.randomUUID();
        const contentType = productFile.type || JPEG_TYPE;
        const filename = normalizedImageFilename(productFile.name, `product-${index + 1}`, contentType);
        const b64 = arrayBufferToBase64(await productFile.arrayBuffer());
        results.push({
          id,
          sourceIndex: index,
          originalName: productFile.name || `product-${index + 1}`,
          filename,
          contentType,
          b64,
          dataUrl: `data:${contentType};base64,${b64}`,
          mode: "keep",
          prompt: "Original image kept without generation.",
          imageSize: "original",
          saved: false,
        });
        continue;
      }
      const generated = await generateFlatlayComposite({
        env,
        productFile,
        backgroundFile: normalizedBackgroundFile,
        generationMode: productModes[index] || generationMode,
        extraInstruction,
        imageQuality,
      });

      const id = crypto.randomUUID();
      const filename = outputFilename(productFile.name, id, generated.contentType);
      results.push({
        id,
        sourceIndex: index,
        originalName: productFile.name || `product-${index + 1}`,
        filename,
        contentType: generated.contentType,
        b64: generated.b64,
        dataUrl: `data:${generated.contentType};base64,${generated.b64}`,
        mode: generated.mode,
        prompt: generated.prompt,
        imageSize: generated.imageSize,
        saved: false,
      });
    } catch (error) {
      errors.push({
        originalName: productFile.name || `product-${index + 1}`,
        error: error.message || "Generation failed.",
      });
    }
  }

  return json({ ok: true, results, errors }, request, env);
}

function parseJobProduct(value) {
  if (!value) return null;
  let body;
  try {
    body = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw statusError("Product details were not valid JSON.", 400);
  }
  const name = String(body?.name || "").trim();
  const price = numericPrice(body?.price);
  if (!name) throw statusError("Enter a product name before starting the job.", 400);
  if (!price) throw statusError("Enter a valid product price before starting the job.", 400);
  const categories = splitValues(body.categories);
  return {
    name,
    price,
    categories,
    colours: splitValues(body.colours || body.colors),
    sizes: normalizeProductSizes(body.sizes, name, categories),
    supplierName: String(body.supplierName || "").trim(),
    supplierUrl: String(body.supplierUrl || "").trim(),
    delivery: String(body.delivery || "").trim(),
    yupooUrl: String(body.yupooUrl || "").trim(),
    createProduct: body.createProduct !== false,
    createCheckout: body.createCheckout !== false,
    checkoutTitle: String(body.checkoutTitle || "").trim(),
  };
}

function safeIdempotencyKey(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 120);
}

function idempotencyRecordKey(env, key) {
  return `${cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/")}idempotency/${key}.json`;
}

async function readIdempotentJobId(env, key) {
  const object = await env.ESNTLS_STUDIO_MEDIA.get(idempotencyRecordKey(env, key));
  if (!object) return "";
  const record = await object.json().catch(() => ({}));
  return String(record.jobId || "");
}

async function writeIdempotentJobId(env, key, jobId) {
  await env.ESNTLS_STUDIO_MEDIA.put(
    idempotencyRecordKey(env, key),
    JSON.stringify({ key, jobId, createdAt: new Date().toISOString() }),
    { httpMetadata: { contentType: JSON_TYPE, cacheControl: "private, no-store" } },
  );
}

async function storeKeptJobResult(env, jobId, index, id, filename, contentType, bytes) {
  const outputName = `${safeFilename(filename).replace(/\.[a-z0-9]+$/i, "")}-original.${extensionForContentType(contentType)}`;
  const key = `${jobPrefix(env, jobId)}outputs/${String(index + 1).padStart(2, "0")}-${id}-${outputName}`;
  await env.ESNTLS_STUDIO_MEDIA.put(key, bytes, {
    httpMetadata: { contentType, cacheControl: "private, max-age=604800" },
    customMetadata: { brand: BRAND.name, role: "kept-original", createdBy: "esntls-photo-studio-v2-job" },
  });
  return {
    id,
    key,
    filename: outputName,
    originalName: filename,
    contentType,
    size: bytes.byteLength,
    rawUrl: `/api/media/raw?key=${encodeURIComponent(key)}`,
    mode: "keep",
    prompt: "Original image kept without generation.",
    imageSize: "original",
    saved: false,
  };
}

async function createBackgroundJob(request, env, ctx) {
  if (!env.ESNTLS_STUDIO_MEDIA) {
    throw statusError("ESNTLS_STUDIO_MEDIA R2 binding is not configured.", 500);
  }

  const form = await request.formData();
  const uploadedFiles = form
    .getAll("products")
    .filter((file) => file && typeof file === "object" && file.size > 0);
  const productUrlItems = parseProductUrlItems(form.get("productUrls"));
  const total = uploadedFiles.length + productUrlItems.length;
  if (!total) {
    throw statusError("Upload at least one product image.", 400);
  }
  if (total > maxBulkImages(env)) {
    throw statusError(`Upload ${maxBulkImages(env)} images or fewer per batch.`, 400);
  }

  const product = parseJobProduct(form.get("product"));
  const idempotencyKey = safeIdempotencyKey(form.get("idempotencyKey"));
  if (idempotencyKey) {
    const existingId = await readIdempotentJobId(env, idempotencyKey);
    if (existingId) {
      const existingJob = await readJob(env, existingId);
      if (existingJob) {
        return json({ ok: true, job: publicJob(existingJob), duplicate: true }, request, env, 200);
      }
    }
  }

  const jobId = crypto.randomUUID();
  const mode = normalizeGenerationMode(form.get("mode"));
  const extraInstruction = normalizeExtraInstruction(form.get("extraInstruction"));
  const imageQuality = requestedImageQuality(env, form.get("quality"));
  const productModes = parseProductModes(form.get("productModes"), total, mode);
  const prefix = cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/");
  const jobPrefixValue = jobPrefix(env, jobId);
  const now = new Date().toISOString();
  const items = [];

  let itemIndex = 0;
  for (const file of uploadedFiles) {
    const normalizedFile = await normalizeImageFileForOpenAi(file, `Product ${itemIndex + 1}`);
    const contentType = normalizedFile.type;
    const filename = safeFilename(normalizedFile.name || `product-${itemIndex + 1}.${extensionForContentType(contentType)}`);
    const sourceKey = `${jobPrefixValue}sources/${String(itemIndex + 1).padStart(2, "0")}-${crypto.randomUUID()}-${filename}`;
    const bytes = await normalizedFile.arrayBuffer();
    await env.ESNTLS_STUDIO_MEDIA.put(sourceKey, bytes, {
      httpMetadata: { contentType },
      customMetadata: { brand: BRAND.name, role: "job-source", originalName: filename },
    });
    const itemMode = productModes[itemIndex] || mode;
    const itemId = crypto.randomUUID();
    const item = {
      id: itemId,
      order: itemIndex,
      status: itemMode === "keep" ? "complete" : "queued",
      mode: itemMode,
      originalName: filename,
      sourceKey,
      contentType,
      size: bytes.byteLength,
    };
    if (itemMode === "keep") {
      item.finishedAt = now;
      item.result = await storeKeptJobResult(env, jobId, itemIndex, itemId, filename, contentType, bytes);
    }
    items.push(item);
    itemIndex += 1;
  }

  for (const item of productUrlItems) {
    const itemMode = productModes[itemIndex] || mode;
    items.push({
      id: crypto.randomUUID(),
      order: itemIndex,
      status: "queued",
      mode: itemMode,
      originalName: item.filename || `remote-product-${itemIndex + 1}.jpg`,
      remote: item,
    });
    itemIndex += 1;
  }

  const background = { kind: "default", path: BRAND.defaultBackgroundPath };

  const job = {
    id: jobId,
    status: "queued",
    mode,
    prefix,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    total: items.length,
    completed: items.filter((item) => item.status === "complete").length,
    failed: 0,
    background,
    extraInstruction,
    imageQuality,
    product,
    idempotencyKey,
    autoProduct: product?.createProduct ? { status: "waiting", productId: null, error: null } : null,
    items,
  };

  await writeJob(env, job);
  if (idempotencyKey) await writeIdempotentJobId(env, idempotencyKey, jobId);
  const enqueueResult = await enqueueBackgroundJob(env, job, ctx);
  if (!items.some((item) => item.status === "queued")) {
    await finalizeJobProgress(env, (await readJob(env, jobId)) || job);
  }
  const queuedJob = await readJob(env, jobId);
  return json({ ok: true, job: publicJob(queuedJob || job), queue: enqueueResult }, request, env, 202);
}

async function getBackgroundJobs(request, env, ctx) {
  if (!env.ESNTLS_STUDIO_MEDIA) {
    throw statusError("ESNTLS_STUDIO_MEDIA R2 binding is not configured.", 500);
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    let job = await readJob(env, id);
    if (!job) throw statusError("Background job was not found.", 404);
    if (isStaleJob(job)) {
      job = await resumeJobInPlace(env, job, ctx, "stale-read-recovery");
    }
    return json({ ok: true, job: publicJob(job) }, request, env);
  }

  const prefix = `${cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/")}jobs/`;
  const limit = Math.min(Number(url.searchParams.get("limit") || 12), 30);
  const listed = await env.ESNTLS_STUDIO_MEDIA.list({ prefix, limit: 100 });
  const jobKeys = listed.objects
    .map((object) => object.key)
    .filter((key) => key.endsWith("/job.json"));
  const jobs = [];
  for (const key of jobKeys) {
    const object = await env.ESNTLS_STUDIO_MEDIA.get(key);
    if (!object) continue;
    const job = await object.json();
    jobs.push(publicJob(job, { includeItems: false }));
  }
  jobs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return json({ ok: true, jobs: jobs.slice(0, limit), truncated: listed.truncated || jobs.length > limit, cursor: listed.cursor || null }, request, env);
}

async function deleteBackgroundJob(request, env) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) throw statusError("Missing background job id.", 400);
  const job = await readJob(env, id);
  if (!job) throw statusError("Background job was not found.", 404);
  if (!isTerminalJobStatus(job.status)) {
    throw statusError("Cancel the running job before removing it.", 409);
  }

  const prefix = jobPrefix(env, id);
  let cursor;
  do {
    const listed = await env.ESNTLS_STUDIO_MEDIA.list({ prefix, cursor, limit: 1000 });
    const keys = listed.objects.map((object) => object.key);
    if (keys.length) await env.ESNTLS_STUDIO_MEDIA.delete(keys);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  if (job.idempotencyKey) {
    await env.ESNTLS_STUDIO_MEDIA.delete(idempotencyRecordKey(env, job.idempotencyKey));
  }
  return json({ ok: true, deleted: { id, productId: job.autoProduct?.productId || null } }, request, env);
}

async function resumeBackgroundJob(request, env, ctx) {
  if (!env.ESNTLS_STUDIO_MEDIA) {
    throw statusError("ESNTLS_STUDIO_MEDIA R2 binding is not configured.", 500);
  }

  const body = await request.json().catch(() => ({}));
  const id = body.id || new URL(request.url).searchParams.get("id");
  if (!id) throw statusError("Missing background job id.", 400);
  let job = await readJob(env, id);
  if (!job) throw statusError("Background job was not found.", 404);
  if (isTerminalJobStatus(job.status)) {
    return json({ ok: true, job: publicJob(job), alreadyFinished: true }, request, env);
  }
  job = await resumeJobInPlace(env, job, ctx, "manual-resume");
  return json({ ok: true, job: publicJob(job) }, request, env, 202);
}

async function retryFailedBackgroundJob(request, env, ctx) {
  if (!env.ESNTLS_STUDIO_MEDIA) {
    throw statusError("ESNTLS_STUDIO_MEDIA R2 binding is not configured.", 500);
  }

  const body = await request.json().catch(() => ({}));
  const id = body.id || new URL(request.url).searchParams.get("id");
  if (!id) throw statusError("Missing background job id.", 400);

  const job = await readJob(env, id);
  if (!job) throw statusError("Background job was not found.", 404);

  const now = new Date().toISOString();
  let retryCount = 0;
  for (const item of job.items || []) {
    if (item.status !== "failed") continue;
    item.status = "queued";
    item.error = null;
    item.finishedAt = null;
    item.retriedAt = now;
    item.retryCount = Number(item.retryCount || 0) + 1;
    retryCount += 1;
  }

  if (!retryCount) {
    return json({ ok: true, job: publicJob(job), retried: 0 }, request, env);
  }

  job.completed = (job.items || []).filter((entry) => entry.status === "complete").length;
  job.failed = 0;
  job.cancelled = (job.items || []).filter((entry) => entry.status === "cancelled").length;
  job.status = "queued";
  job.finishedAt = null;
  job.lastRetriedAt = now;
  await writeJob(env, job);
  const queue = await enqueueBackgroundJob(env, job, ctx, "retry-failed");
  const queuedJob = await readJob(env, id);
  return json({ ok: true, job: publicJob(queuedJob || job), retried: retryCount, queue }, request, env, 202);
}

async function retryBackgroundProduct(request, env) {
  const body = await request.json().catch(() => ({}));
  const id = body.id || new URL(request.url).searchParams.get("id");
  if (!id) throw statusError("Missing background job id.", 400);
  let job = await readJob(env, id);
  if (!job) throw statusError("Background job was not found.", 404);
  if (job.status !== "complete") throw statusError("Every requested image must finish before retrying product creation.", 409);
  job.autoProduct = { ...(job.autoProduct || {}), status: "waiting", error: null, retriedAt: new Date().toISOString() };
  await writeJob(env, job);
  job = await createProductFromCompletedJob(env, id);
  return json({ ok: true, job: publicJob(job) }, request, env, job.autoProduct?.status === "complete" ? 200 : 500);
}

async function cancelBackgroundJob(request, env) {
  if (!env.ESNTLS_STUDIO_MEDIA) {
    throw statusError("ESNTLS_STUDIO_MEDIA R2 binding is not configured.", 500);
  }

  const body = await request.json().catch(() => ({}));
  const id = body.id || new URL(request.url).searchParams.get("id");
  if (!id) throw statusError("Missing background job id.", 400);

  const job = await readJob(env, id);
  if (!job) throw statusError("Background job was not found.", 404);
  if (isTerminalJobStatus(job.status)) {
    return json({ ok: true, job: publicJob(job), alreadyFinished: true }, request, env);
  }

  const now = new Date().toISOString();
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
  job.completed = (job.items || []).filter((entry) => entry.status === "complete").length;
  job.failed = (job.items || []).filter((entry) => entry.status === "failed").length;
  job.cancelled = (job.items || []).filter((entry) => entry.status === "cancelled").length;
  await writeJob(env, job);

  return json({ ok: true, job: publicJob(job) }, request, env);
}

async function enqueueBackgroundJob(env, job, ctx, reason = "created") {
  if (job.status === "cancelled") {
    return { method: "none", count: 0 };
  }

  const pending = (job.items || [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && item.status === "queued");

  if (!pending.length) {
    await finalizeJobProgress(env, job);
    return { method: "none", count: 0 };
  }

  job.status = job.startedAt ? "running" : "queued";
  job.finishedAt = null;
  if (!env.ESNTLS_STUDIO_QUEUE || typeof env.ESNTLS_STUDIO_QUEUE.sendBatch !== "function") {
    throw statusError("The ESNTLS Club background queue is not configured.", 500);
  }

  job.queue = {
    method: "queue",
    reason,
    count: pending.length,
    enqueuedAt: new Date().toISOString(),
  };
  await writeJob(env, job);

  const messages = pending.map(({ item, index }) => ({
    body: {
      type: "esntls-photo-studio-v2-item",
      jobId: job.id,
      itemId: item.id,
      index,
    },
  }));

  for (let index = 0; index < messages.length; index += 100) {
    await env.ESNTLS_STUDIO_QUEUE.sendBatch(messages.slice(index, index + 100));
  }

  return { method: "queue", count: messages.length };
}

async function resumeJobInPlace(env, job, ctx, reason) {
  for (const item of job.items || []) {
    if (item.status === "running") {
      item.status = "queued";
      item.error = null;
      item.resumedAt = new Date().toISOString();
    }
  }

  job.completed = (job.items || []).filter((entry) => entry.status === "complete").length;
  job.failed = (job.items || []).filter((entry) => entry.status === "failed").length;
  job.status = job.completed + job.failed >= (job.total || 0) ? job.status : "queued";
  job.finishedAt = null;
  await writeJob(env, job);
  await enqueueBackgroundJob(env, job, ctx, reason);
  return (await readJob(env, job.id)) || job;
}

function isStaleJob(job) {
  if (!job || isTerminalJobStatus(job.status)) return false;
  if (job.queue?.method === "queue") return false;
  const updatedAt = Date.parse(job.updatedAt || job.startedAt || job.createdAt || "");
  if (!Number.isFinite(updatedAt)) return false;
  const incomplete = (job.completed || 0) + (job.failed || 0) < (job.total || job.items?.length || 0);
  return incomplete && Date.now() - updatedAt > JOB_STALE_AFTER_MS;
}

function isJobItemStale(item) {
  const startedAt = Date.parse(item?.lastAttemptAt || item?.startedAt || "");
  return !Number.isFinite(startedAt) || Date.now() - startedAt > 5 * 60 * 1000;
}

function isTerminalJobStatus(status) {
  return TERMINAL_JOB_STATUSES.includes(String(status || ""));
}

async function processBackgroundJob(env, jobId) {
  let job = await readJob(env, jobId);
  if (!job || isTerminalJobStatus(job.status)) return;

  for (let index = 0; index < job.items.length; index += 1) {
    job = await readJob(env, jobId);
    if (!job || isTerminalJobStatus(job.status)) return;
    const item = job.items[index];
    if (!item || ["complete", "failed", "cancelled"].includes(item.status)) continue;
    await processBackgroundJobItem(env, jobId, item.id, index);
  }
}

async function processBackgroundJobMessage(env, rawBody) {
  const body = normalizeQueueMessageBody(rawBody);
  if (!body?.jobId) return;
  await processBackgroundJobItem(env, body.jobId, body.itemId, Number(body.index));
}

function normalizeQueueMessageBody(value) {
  if (typeof value !== "string") return value || {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function processBackgroundJobItem(env, jobId, itemId, fallbackIndex = 0) {
  let job = await readJob(env, jobId);
  if (!job || isTerminalJobStatus(job.status)) return;

  const indexById = (job.items || []).findIndex((entry) => entry.id === itemId);
  const index = indexById >= 0 ? indexById : fallbackIndex;
  const item = job.items?.[index];
  if (!item || item.status === "complete" || item.status === "failed" || item.status === "cancelled") {
    await finalizeJobProgress(env, job);
    return;
  }
  if (item.status === "running" && !isJobItemStale(item)) {
    return;
  }

  item.status = "running";
  item.startedAt = item.startedAt || new Date().toISOString();
  item.lastAttemptAt = new Date().toISOString();
  item.error = null;
  job.status = "running";
  job.startedAt = job.startedAt || new Date().toISOString();
  job.finishedAt = null;
  await writeJob(env, job);

  try {
    let productFile = item.remote ? await fetchRemoteProductFile(item.remote) : await fileFromR2(env, item.sourceKey, item.originalName);
    productFile = await normalizeImageFileForOpenAi(productFile, `Product ${index + 1}`);
    if (item.mode === "keep") {
      const bytes = new Uint8Array(await productFile.arrayBuffer());
      item.status = "complete";
      item.finishedAt = new Date().toISOString();
      item.result = await storeKeptJobResult(
        env,
        jobId,
        index,
        item.id,
        productFile.name || item.originalName,
        productFile.type || item.contentType || JPEG_TYPE,
        bytes,
      );
      await finalizeJobProgress(env, job);
      return;
    }
    const backgroundFile = await backgroundFileForJob(env, job);
    const generated = await generateFlatlayComposite({
      env,
      productFile,
      backgroundFile,
      generationMode: item.mode || job.mode,
      extraInstruction: job.extraInstruction || "",
      imageQuality: job.imageQuality,
    });
    const latestJob = await readJob(env, jobId);
    const latestItem = latestJob?.items?.find((entry) => entry.id === item.id);
    if (latestJob?.status === "cancelled" || latestItem?.status === "cancelled") {
      return;
    }
    const id = crypto.randomUUID();
    const filename = outputFilename(productFile.name || item.originalName, id, generated.contentType);
    const bytes = base64ToUint8Array(generated.b64);
    const key = `${jobPrefix(env, jobId)}outputs/${String(index + 1).padStart(2, "0")}-${id}-${filename}`;
    await env.ESNTLS_STUDIO_MEDIA.put(key, bytes, {
      httpMetadata: {
        contentType: generated.contentType,
        cacheControl: "private, max-age=604800",
      },
      customMetadata: {
        brand: BRAND.name,
        source: item.originalName || "",
        createdBy: "esntls-photo-studio-v2-job",
      },
    });
    const storedJob = await readJob(env, jobId);
    const storedItem = storedJob?.items?.find((entry) => entry.id === item.id);
    if (storedJob?.status === "cancelled" || storedItem?.status === "cancelled") {
      return;
    }

    item.status = "complete";
    item.finishedAt = new Date().toISOString();
    item.result = {
      id,
      key,
      filename,
      originalName: item.originalName || productFile.name || `product-${index + 1}`,
      contentType: generated.contentType,
      size: bytes.byteLength,
      rawUrl: `/api/media/raw?key=${encodeURIComponent(key)}`,
      mode: generated.mode,
      prompt: generated.prompt,
      imageSize: generated.imageSize,
      saved: false,
    };
  } catch (error) {
    item.status = "failed";
    item.finishedAt = new Date().toISOString();
    item.error = error.message || "Generation failed.";
    item.permanent = isPermanentImageError(error);
  }

  const latestBeforeFinalize = await readJob(env, jobId);
  if (latestBeforeFinalize?.status === "cancelled") return;
  await finalizeJobProgress(env, job);
}

async function finalizeJobProgress(env, job) {
  job.completed = job.items.filter((entry) => entry.status === "complete").length;
  job.failed = job.items.filter((entry) => entry.status === "failed").length;
  job.cancelled = job.items.filter((entry) => entry.status === "cancelled").length;
  const total = job.total || job.items.length || 0;
  if (job.status === "cancelled") {
    job.finishedAt = job.finishedAt || new Date().toISOString();
  } else if (job.completed + job.failed + job.cancelled >= total) {
    if (job.cancelled && !job.completed && !job.failed) {
      job.status = "cancelled";
    } else if (job.cancelled) {
      job.status = job.completed > 0 ? "partial" : "failed";
    } else {
      job.status = job.completed === total ? "complete" : job.completed > 0 ? "partial" : "failed";
    }
    job.finishedAt = new Date().toISOString();
  } else {
    job.status = "running";
    job.finishedAt = null;
  }
  await writeJob(env, job);
  if (job.status === "complete" && job.product?.createProduct && job.autoProduct?.status === "waiting") {
    await createProductFromCompletedJob(env, job.id);
  }
}

async function createProductFromCompletedJob(env, jobId) {
  let job = await readJob(env, jobId);
  if (!job || job.status !== "complete" || !job.product?.createProduct) return job;
  if (["creating", "complete"].includes(job.autoProduct?.status)) return job;

  job.autoProduct = { ...(job.autoProduct || {}), status: "creating", error: null, startedAt: new Date().toISOString() };
  await writeJob(env, job);

  try {
    const images = await saveJobImagesForProduct(env, job);
    await ensurePublicImageUrlsReady(images);
    const checkoutSourceImage = await sourceImagePayloadFromUrl(env, images[0]).catch(() => null);
    const catalog = await readCatalog(env);
    let product = catalog.products.find((entry) => entry.studioJobId === job.id);
    if (!product) {
      const categories = job.product.categories.length ? job.product.categories : ["New Items"];
      const id = nextProductId(catalog.products);
      product = {
        id,
        name: job.product.name,
        category: categories.join(","),
        brand: inferBrand(categories),
        price: `£${Number(job.product.price).toFixed(2)}`,
        link: "",
        sizes: job.product.sizes,
        variationName: job.product.colours.length ? "Colour" : "",
        variationValues: job.product.colours,
        delivery: job.product.delivery || env.ESNTLS_STUDIO_DEFAULT_DELIVERY || "7-12 Days",
        images,
        supplierName: job.product.supplierName,
        supplierLink: job.product.supplierUrl,
        yupooUrl: job.product.yupooUrl,
        created_at: new Date().toISOString(),
        active: true,
        studioJobId: job.id,
        studioSource: "esntls-photo-studio-v2",
      };
      catalog.products.unshift(product);
      await writeCatalog(env, catalog);
    }

    let checkout = null;
    if (job.product.createCheckout && String(env.ESNTLS_STUDIO_AUTO_CHECKOUT || "true").toLowerCase() !== "false") {
      try {
        await setCatalogProductActive(env, product.id, true);
        checkout = await callEsntlsStoreApi(env, "shopify-create-product", {
          productId: product.id,
          createWixBackup: true,
          shopifyTitleOverride: job.product.checkoutTitle || "",
          sourceImage: checkoutSourceImage,
        });
      } catch (error) {
        await setCatalogProductActive(env, product.id, false, error.message);
        throw new Error(`Product images finished, but checkout creation failed. The product was kept in draft: ${error.message}`);
      }
    }

    job = (await readJob(env, jobId)) || job;
    job.autoProduct = {
      status: "complete",
      productId: product.id,
      productName: product.name,
      shopifyUrl: checkout?.shopifyUrl || "",
      wixUrl: checkout?.wixBackup?.url || "",
      finishedAt: new Date().toISOString(),
      error: null,
    };
    await writeJob(env, job);
    return job;
  } catch (error) {
    job = (await readJob(env, jobId)) || job;
    job.autoProduct = {
      ...(job.autoProduct || {}),
      status: "failed",
      error: error.message || "Product creation failed.",
      finishedAt: new Date().toISOString(),
    };
    await writeJob(env, job);
    return job;
  }
}

async function saveJobImagesForProduct(env, job) {
  const ordered = [...(job.items || [])].sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  const urls = [];
  const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  for (const item of ordered) {
    if (item.status !== "complete" || !item.result?.key || item.result.deleted) {
      throw statusError("Every selected product image must finish before the product is created.", 409);
    }
    if (item.result.savedKey) {
      urls.push(mediaPublicUrl(env, item.result.savedKey));
      continue;
    }
    const object = await env.ESNTLS_STUDIO_MEDIA.get(item.result.key);
    if (!object) throw statusError(`Finished image ${item.originalName} was not found.`, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    const contentType = headers.get("content-type") || item.result.contentType || JPEG_TYPE;
    const savedKey = `${cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/")}generated/${datePath}/${String(Number(item.order || 0) + 1).padStart(2, "0")}-${crypto.randomUUID()}-${safeFilename(item.result.filename)}`;
    await env.ESNTLS_STUDIO_MEDIA.put(savedKey, await object.arrayBuffer(), {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { brand: BRAND.name, source: item.originalName || "", createdBy: "esntls-photo-studio-v2-product" },
    });
    item.result.saved = true;
    item.result.savedKey = savedKey;
    item.result.publicUrl = mediaPublicUrl(env, savedKey);
    urls.push(item.result.publicUrl);
  }
  await writeJob(env, job);
  return urls;
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryImageRead(status) {
  return [404, 408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

async function ensurePublicImageUrlsReady(urls) {
  for (const url of urls || []) {
    await ensurePublicImageUrlReady(url);
  }
}

async function ensurePublicImageUrlReady(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) return;
  let lastStatus = 0;
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { method: "GET", headers: { accept: "image/*,*/*" } });
      if (response.ok) {
        await response.body?.cancel?.();
        return;
      }
      lastStatus = response.status;
      await response.body?.cancel?.();
      if (!shouldRetryImageRead(response.status)) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 5) await wait(200 * attempt);
  }
  throw statusError(`Saved product image is not publicly readable yet${lastStatus ? ` (HTTP ${lastStatus})` : ""}${lastError ? `: ${lastError.message}` : "."}`, 502);
}

async function sourceImagePayloadForProduct(env, product) {
  const firstImage = splitImageValues(product?.images || product?.image).find(Boolean);
  return await sourceImagePayloadFromUrl(env, firstImage);
}

function mediaKeyFromPublicUrl(env, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw, env.ESNTLS_STUDIO_PUBLIC_URL || "https://studio.local");
  } catch {
    return "";
  }
  if (!url.pathname.startsWith("/media/")) return "";
  const key = url.pathname.slice("/media/".length).split("/").map((part) => decodeURIComponent(part)).join("/");
  const allowedPrefix = `${cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/")}generated/`;
  return key.startsWith(allowedPrefix) ? key : "";
}

async function sourceImagePayloadFromUrl(env, url) {
  if (!env.ESNTLS_STUDIO_MEDIA) return null;
  const key = mediaKeyFromPublicUrl(env, url);
  if (!key) return null;
  const object = await env.ESNTLS_STUDIO_MEDIA.get(key);
  if (!object) return null;
  if (Number(object.size || 0) > 8 * 1024 * 1024) return null;
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const contentType = headers.get("content-type") || JPEG_TYPE;
  return {
    filename: safeFilename(key.split("/").pop() || "source.jpg"),
    contentType,
    base64: arrayBufferToBase64(await object.arrayBuffer()),
  };
}

async function setCatalogProductActive(env, productId, active, error = "") {
  const catalog = await readCatalog(env);
  const product = catalog.products.find((entry) => String(entry.id) === String(productId));
  if (!product) return;
  product.active = active;
  product.archived = !active;
  if (error) product.checkoutCreationError = error;
  else delete product.checkoutCreationError;
  await writeCatalog(env, catalog);
}

async function fileFromR2(env, key, fallbackName) {
  const object = await env.ESNTLS_STUDIO_MEDIA.get(key);
  if (!object) {
    throw statusError("Stored job source image was not found.", 404);
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const contentType = headers.get("content-type") || "image/jpeg";
  const bytes = await object.arrayBuffer();
  const filename = fallbackName || key.split("/").pop() || `image.${extensionForContentType(contentType)}`;
  if (typeof File === "function") {
    return new File([bytes], filename, { type: contentType });
  }
  const blob = new Blob([bytes], { type: contentType });
  blob.name = filename;
  return blob;
}

async function backgroundFileForJob(env, job) {
  if (job.background?.kind === "stored" && job.background.key) {
    return await normalizeImageFileForOpenAi(await fileFromR2(env, job.background.key, job.background.filename), "ESNTLS Club background");
  }
  return await loadDefaultBackgroundFileFromUrl(env);
}

async function loadDefaultBackgroundFileFromUrl(env) {
  const response = env.ASSETS
    ? await env.ASSETS.fetch(new Request(`https://studio-assets.local${env.ESNTLS_STUDIO_BACKGROUND_PATH || BRAND.defaultBackgroundPath}`))
    : await fetch(`${String(env.ESNTLS_STUDIO_PUBLIC_URL || "").replace(/\/$/, "")}${BRAND.defaultBackgroundPath}`);
  if (!response.ok) {
    throw statusError("Default ESNTLS Club background asset was not found.", 500);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  return new Blob([await response.arrayBuffer()], { type: contentType });
}

function jobPrefix(env, jobId) {
  return `${cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/")}jobs/${jobId}/`;
}

function jobRecordKey(env, jobId) {
  return `${jobPrefix(env, jobId)}job.json`;
}

function isJobOutputKey(env, key) {
  const jobsPrefix = `${cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/")}jobs/`;
  return String(key || "").startsWith(jobsPrefix) && String(key || "").includes("/outputs/");
}

function jobIdFromOutputKey(env, key) {
  const jobsPrefix = `${cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/")}jobs/`;
  const text = String(key || "");
  if (!text.startsWith(jobsPrefix)) return "";
  const parts = text.slice(jobsPrefix.length).split("/");
  return parts[1] === "outputs" ? parts[0] : "";
}

async function readJob(env, jobId) {
  const object = await env.ESNTLS_STUDIO_MEDIA.get(jobRecordKey(env, jobId));
  if (!object) return null;
  return await object.json();
}

async function writeJob(env, job) {
  const record = { ...job, updatedAt: new Date().toISOString() };
  await env.ESNTLS_STUDIO_MEDIA.put(jobRecordKey(env, job.id), JSON.stringify(record, null, 2), {
    httpMetadata: {
      contentType: JSON_TYPE,
      cacheControl: "private, max-age=0, no-store",
    },
    customMetadata: {
      brand: BRAND.name,
      createdBy: "esntls-photo-studio-v2-job",
    },
  });
  return record;
}

async function markJobOutputDeleted(env, key) {
  const jobId = jobIdFromOutputKey(env, key);
  if (!jobId) return;
  const job = await readJob(env, jobId);
  if (!job) return;
  const item = (job.items || []).find((entry) => entry.result?.key === key);
  if (!item?.result) return;
  item.result.deleted = true;
  item.result.deletedAt = new Date().toISOString();
  await writeJob(env, job);
}

function publicJob(job, options = {}) {
  const includeItems = options.includeItems !== false;
  const publicValue = {
    id: job.id,
    status: job.status,
    mode: job.mode,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    total: job.total || job.items?.length || 0,
    completed: job.completed || 0,
    failed: job.failed || 0,
    cancelled: job.cancelled || 0,
    productName: job.product?.name || "",
    product: job.product ? {
      name: job.product.name,
      price: job.product.price,
      categories: job.product.categories || [],
      colours: job.product.colours || [],
      sizes: job.product.sizes || [],
      supplierName: job.product.supplierName || "",
      supplierUrl: job.product.supplierUrl || "",
    } : null,
    autoProduct: job.autoProduct || null,
  };
  if (includeItems) {
    publicValue.items = (job.items || []).map((item, index) => ({
      id: item.id,
      status: item.status,
      mode: item.mode || job.mode,
      originalName: item.originalName || `product-${index + 1}`,
      error: item.error || null,
      permanent: Boolean(item.permanent),
      result: item.result || null,
    }));
  }
  return publicValue;
}

async function saveGeneratedImages(request, env) {
  if (!env.ESNTLS_STUDIO_MEDIA) {
    throw statusError("ESNTLS_STUDIO_MEDIA R2 binding is not configured.", 500);
  }

  const body = await request.json();
  const images = Array.isArray(body.images) ? body.images : body.image ? [body.image] : [];

  if (!images.length) {
    throw statusError("No generated images were supplied to save.", 400);
  }

  const saved = [];
  const prefix = cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/");
  const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, "/");

  for (const image of images) {
    let contentType = image.contentType || PNG_TYPE;
    let bytes;
    if (image.key) {
      const sourceKey = String(image.key);
      if (!isJobOutputKey(env, sourceKey)) {
        throw statusError("Saved image key is outside the generated job output library.", 400);
      }
      const object = await env.ESNTLS_STUDIO_MEDIA.get(sourceKey);
      if (!object) {
        throw statusError("Generated job image was not found.", 404);
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      contentType = image.contentType || headers.get("content-type") || PNG_TYPE;
      bytes = new Uint8Array(await object.arrayBuffer());
    } else {
      const b64 = stripDataUrl(image.b64 || image.dataUrl || "");
      if (!b64) {
        throw statusError("Saved image is missing base64 content.", 400);
      }
      bytes = base64ToUint8Array(b64);
    }

    const key = `${prefix}generated/${datePath}/${crypto.randomUUID()}-${safeFilename(image.filename || "esntls-output.png")}`;

    await env.ESNTLS_STUDIO_MEDIA.put(key, bytes, {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: {
        brand: BRAND.name,
        source: image.originalName || "",
        createdBy: "esntls-photo-studio-v2",
      },
    });

    saved.push({
      key,
      filename: image.filename || key.split("/").pop(),
      contentType,
      size: bytes.byteLength,
      publicUrl: mediaPublicUrl(env, key),
      rawUrl: `/api/media/raw?key=${encodeURIComponent(key)}`,
    });
  }

  return json({ ok: true, saved }, request, env);
}

async function listMedia(request, env) {
  if (!env.ESNTLS_STUDIO_MEDIA) {
    throw statusError("ESNTLS_STUDIO_MEDIA R2 binding is not configured.", 500);
  }

  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || `${cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/")}generated/`;
  const limit = Math.min(Number(url.searchParams.get("limit") || 60), 100);
  const listed = await env.ESNTLS_STUDIO_MEDIA.list({ prefix, limit });

  return json(
    {
      ok: true,
      objects: listed.objects.map((object) => ({
        key: object.key,
        size: object.size,
        uploaded: object.uploaded,
        publicUrl: mediaPublicUrl(env, object.key),
        rawUrl: `/api/media/raw?key=${encodeURIComponent(object.key)}`,
      })),
      truncated: listed.truncated,
      cursor: listed.cursor || null,
    },
    request,
    env,
  );
}

async function getMediaObject(request, env) {
  if (!env.ESNTLS_STUDIO_MEDIA) {
    throw statusError("ESNTLS_STUDIO_MEDIA R2 binding is not configured.", 500);
  }

  const key = new URL(request.url).searchParams.get("key");
  if (!key) {
    throw statusError("Missing media key.", 400);
  }

  const object = await env.ESNTLS_STUDIO_MEDIA.get(key);
  if (!object) {
    throw statusError("Media object not found.", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", headers.get("cache-control") || "private, max-age=60");
  return new Response(object.body, { headers });
}

async function getPublicMediaObject(request, env, encodedKey) {
  if (!env.ESNTLS_STUDIO_MEDIA) throw statusError("Studio media storage is not configured.", 500);
  const key = String(encodedKey || "").split("/").map((part) => decodeURIComponent(part)).join("/");
  const allowedPrefix = `${cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/")}generated/`;
  if (!key.startsWith(allowedPrefix)) throw statusError("Media object is not public.", 403);
  const object = await env.ESNTLS_STUDIO_MEDIA.get(key);
  if (!object) throw statusError("Media object not found.", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", headers.get("cache-control") || "public, max-age=31536000, immutable");
  headers.set("access-control-allow-origin", "*");
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function deleteMediaObject(request, env) {
  if (!env.ESNTLS_STUDIO_MEDIA) {
    throw statusError("ESNTLS_STUDIO_MEDIA R2 binding is not configured.", 500);
  }

  const url = new URL(request.url);
  let key = url.searchParams.get("key");
  if (!key && (request.headers.get("content-type") || "").includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    key = body.key;
  }

  if (!key) {
    throw statusError("Missing media key.", 400);
  }

  const allowedPrefix = `${cleanPrefix(env.ESNTLS_STUDIO_R2_PREFIX || "photo-studio-v2/")}generated/`;
  const isGeneratedImage = key.startsWith(allowedPrefix);
  const isJobImage = isJobOutputKey(env, key);
  if (!isGeneratedImage && !isJobImage) {
    throw statusError("Media key is outside the generated image library.", 400);
  }

  await env.ESNTLS_STUDIO_MEDIA.delete(key);
  if (isJobImage) {
    await markJobOutputDeleted(env, key);
  }
  return json({ ok: true, deleted: { key } }, request, env);
}

async function generateFlatlayComposite({
  env,
  productFile,
  backgroundFile,
  generationMode,
  extraInstruction = "",
  imageQuality,
}) {
  const apiKey = env.OPENAI_API_KEY || env.ESNTLS_STUDIO_OPENAI_API_KEY;
  if (!apiKey) {
    throw statusError("Missing OPENAI_API_KEY or ESNTLS_STUDIO_OPENAI_API_KEY.", 500);
  }

  const mode = normalizeGenerationMode(generationMode);
  const prompt = buildGenerationPrompt(productFile.name, mode, extraInstruction);
  const model = env.ESNTLS_STUDIO_OPENAI_IMAGE_MODEL || env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const size = outputSizeForMode(env, model, mode);
  const quality = requestedImageQuality(env, imageQuality);
  const outputFormat = outputFormatForEnv(env);
  const outputContentType = contentTypeForOutputFormat(outputFormat);
  const outputCompression = outputCompressionForEnv(env);
  const firstAttempt = await callOpenAiImagesEdit({
    apiKey,
    model,
    size,
    quality,
    outputFormat,
    outputContentType,
    outputCompression,
    prompt,
    productFile,
    backgroundFile,
    imageField: "image[]",
  });

  let finalAttempt = firstAttempt;
  if (!firstAttempt.ok && shouldRetryWithRepeatedImageField(firstAttempt.errorText)) {
    finalAttempt = await callOpenAiImagesEdit({
      apiKey,
      model,
      size,
      quality,
      outputFormat,
      outputContentType,
      outputCompression,
      prompt,
      productFile,
      backgroundFile,
      imageField: "image",
    });
  }

  if (!finalAttempt.ok) {
    throw statusError(`OpenAI image edit failed: ${finalAttempt.errorText}`, 502);
  }

  return { ...finalAttempt.image, prompt, imageSize: size, mode };
}

async function callOpenAiImagesEdit({
  apiKey,
  model,
  size,
  quality,
  outputFormat,
  outputContentType,
  outputCompression,
  prompt,
  productFile,
  backgroundFile,
  imageField,
}) {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("background", "opaque");
  form.append("output_format", outputFormat);
  form.append("quality", quality);
  if (outputFormat !== "png") {
    form.append("output_compression", String(outputCompression));
  }
  form.append(imageField, productFile, productFile.name || "product.png");
  form.append(imageField, backgroundFile, backgroundFile.name || "esntls-background.png");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const responseText = await response.text();
  let payload = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      errorText: payload?.error?.message || responseText || `${response.status} ${response.statusText}`,
    };
  }

  const first = payload?.data?.[0];
  if (first?.b64_json) {
    return {
      ok: true,
      image: {
        b64: first.b64_json,
        contentType: outputContentType,
      },
    };
  }

  if (first?.url) {
    const imageResponse = await fetch(first.url);
    if (!imageResponse.ok) {
      return { ok: false, errorText: `Generated image URL download failed: ${imageResponse.status}` };
    }
    const contentType = imageResponse.headers.get("content-type") || PNG_TYPE;
    return {
      ok: true,
      image: {
        b64: arrayBufferToBase64(await imageResponse.arrayBuffer()),
        contentType,
      },
    };
  }

  return { ok: false, errorText: "OpenAI response did not include b64_json or url." };
}

export function buildGenerationPrompt(productName, mode, extraInstruction = "") {
  let prompt;
  if (mode === "keep-crop") prompt = buildKeepCropPrompt(productName);
  else if (mode === "auto") prompt = buildAutoPrompt(productName);
  else prompt = buildFlatlayPrompt(productName);

  const instruction = normalizeExtraInstruction(extraInstruction);
  if (!instruction) return prompt;

  return [
    prompt,
    "Additional studio instruction:",
    instruction,
    "Apply the additional instruction only where it does not conflict with preserving the product's identity, branding, shape, colour, texture, details, item count, or the constraints above.",
  ].join("\n");
}

function buildAutoPrompt(productName) {
  return buildKeepCropPrompt(productName);
}

function buildKeepCropPrompt(productName) {
  return [
    "Use case: exact background-only replacement for a close-up ESNTLS Club product photo.",
    `Input image 1 is the product photo${productName ? ` named ${productName}` : ""}. Input image 2 is the exact ESNTLS Club green artificial-grass background.`,
    "Replace only the visible non-product background with the supplied grass. Preserve the exact framing, crop, product position, visible scale, perspective, rotation, camera distance, and composition.",
    "Never zoom out, zoom in, center, shrink, enlarge, rotate, straighten, re-angle, re-crop, extend the canvas, or complete missing product areas. Keep anything cut off in the source cut off in the output.",
    "Preserve the exact number of visible products and their arrangement. If there are multiple items, keep the same items, same overlap order, same spacing, and same visible scale.",
    "Preserve the product exactly: shape, silhouette, colour, branding, logos, writing, material, texture, stitching, fabric grain, mesh holes, tags, defects, marks, wear, folds, item count, proportions, and edge details.",
    "Do not smooth, clean, redraw, repaint, recolour, relight, retouch, redesign, repair, de-wrinkle, upscale, or invent product details.",
    "Preserve the supplied grass background's exact colour, texture, blade pattern, lighting, and natural imperfections. Do not generate different grass or an outdoor scene.",
    "Add only a subtle natural contact shadow and slight grass compression where the visible product touches the grass. No unrealistic, harsh, glossy, floating, or oversized shadows.",
    "Do not add text, logos, props, hands, hangers, walls, extra products, scenery, labels, or watermarks.",
    "Output must be 3:4 where the model supports it, while preserving the exact source framing within that canvas. If anything is uncertain, preserve the uploaded product and framing instead of improving it.",
  ].join("\n");
}

function buildFlatlayPrompt(productName) {
  return [
    "Use case: realistic ecommerce flat-lay background replacement for ESNTLSCLUB.",
    `Input image 1 is the product photo${productName ? ` named ${productName}` : ""}.`,
    "Input image 2 is the original ESNTLSCLUB green artificial-grass background. Use it as the physical ground surface that the product is lying on.",
    "Create a 3:4 overhead flat-lay product photo where the product appears naturally placed on that exact supplied grass background.",
    "Preserve the product exactly: its shape, silhouette, colour, logos, printed text, texture, stitching, fabric grain, mesh holes, tags, defects, marks, wear, folds, and edge details.",
    "Preserve the exact number of products shown. Do not add duplicates, alternative colourways, extra garments, props, or a different arrangement. If the input contains a group or set, keep the same items and overlap order.",
    "Do not smooth, repaint, recolour, relight, retouch, redesign, clean, repair, de-wrinkle, upscale, or restyle the product. Avoid AI smoothing and retain genuine fabric and material texture.",
    "Preserve the supplied ESNTLSCLUB background's exact green grass colour, texture, blade pattern, lighting, and natural imperfections. Do not replace it with different grass or generate a new outdoor environment.",
    "Do not invent, duplicate, extend, or add ESNTLSCLUB text, logos, watermarks, labels, props, hands, hangers, flowers, plants, soil, walls, or scenery.",
    "Only add subtle realism where the product touches the grass: a soft natural contact shadow, slight grass compression, and a small amount of grass naturally overlapping the lowest product edges.",
    "Shadows must be soft and believable. Do not create dramatic, floating, glossy, harsh, oversized, or unrealistic shadows.",
    "Keep realistic product scale and perspective. Size the product proportionally to the background like a genuine overhead photograph, not an oversized pasted cutout.",
    "Leave visible green grass around the product on every side. Most clothing should fill approximately 50-68% of the canvas. Shoes, watches, jewellery, and smaller accessories should appear proportionally smaller.",
    "Do not let the product touch the image borders unless it is already intentionally cropped in the source image.",
    "Centre the product like a clean ecommerce flat-lay. The result should look naturally photographed on grass, not AI-generated or digitally composited.",
    "If anything is uncertain, prioritise preserving the uploaded product and supplied grass background over inventing or improving details.",
  ].join("\n");
}

function shouldRetryWithRepeatedImageField(errorText) {
  return /image\[\]|unknown parameter|invalid parameter|missing required parameter|expected.*image|invalid image|image file|array/i.test(
    String(errorText || ""),
  );
}

function parseProductUrlItems(value) {
  if (!value) return [];

  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw statusError("Remote product image URLs were invalid.", 400);
  }

  const values = Array.isArray(parsed) ? parsed : [parsed];
  return values.map((item, index) => {
    const raw = typeof item === "string" ? { url: item } : item || {};
    const url = parseYupooImageUrl(raw.url);
    return {
      url: url.toString(),
      pageUrl: raw.pageUrl || `${url.origin}/`,
      filename: safeFilename(raw.filename || yupooFilename(url.toString(), index + 1, contentTypeFromImageUrl(url.toString()) || "image/jpeg")),
    };
  });
}

function parseYupooImageUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw statusError("Remote product image URL was invalid.", 400);
  }

  if (!["http:", "https:"].includes(url.protocol) || !isLikelyYupooProductImageUrl(url)) {
    throw statusError("Remote product image URL must be a Yupoo product photo.", 400);
  }

  url.protocol = "https:";
  url.hash = "";
  return url;
}

function yupooReferer(value, imageUrl) {
  try {
    const url = new URL(String(value || ""), `${imageUrl.origin}/`);
    if (["http:", "https:"].includes(url.protocol) && isYupooHost(url.hostname)) {
      url.protocol = "https:";
      return url.toString();
    }
  } catch {
    // Fall back to the image origin when the source page is absent or malformed.
  }
  return `${imageUrl.origin}/`;
}

async function fetchRemoteProductFile(item) {
  const url = parseYupooImageUrl(item.url);
  const response = await fetch(url.toString(), {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      referer: item.pageUrl || `${url.origin}/`,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw statusError(`Yupoo image could not be downloaded (${response.status}).`, 502);
  }

  const fallbackType = contentTypeFromImageUrl(url.toString()) || "image/jpeg";
  const contentType = normalizeImageContentType(response.headers.get("content-type")) || fallbackType;
  if (!contentType.startsWith("image/")) {
    throw statusError("Yupoo returned a non-image response.", 502);
  }

  const buffer = await response.arrayBuffer();
  const maxMb = 20;
  if (buffer.byteLength > maxMb * 1024 * 1024) {
    throw statusError("Yupoo image is larger than 20MB.", 400);
  }

  const filename = safeFilename(item.filename || yupooFilename(url.toString(), 1, contentType));
  if (typeof File === "function") {
    return new File([buffer], filename, { type: contentType });
  }

  const blob = new Blob([buffer], { type: contentType });
  blob.name = filename;
  return blob;
}

function parseYupooPageUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw statusError("Paste a valid Yupoo link.", 400);
  }

  if (!["http:", "https:"].includes(url.protocol) || !isYupooHost(url.hostname)) {
    throw statusError("Paste a valid Yupoo link.", 400);
  }

  url.protocol = "https:";
  return url;
}

async function fetchYupooHtml(url) {
  const response = await fetch(url.toString(), {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-GB,en;q=0.9",
      referer: `${url.origin}/`,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw statusError(`Yupoo link could not be loaded (${response.status}).`, 502);
  }

  return await response.text();
}

function extractYupooImageCandidates(html, pageUrl) {
  const candidates = [];
  let order = 0;
  const attrRegex = /\b(data-origin-src|data-src|src|href)=["']([^"']+)["']/gi;
  let match;

  while ((match = attrRegex.exec(html))) {
    const url = normalizeYupooImageUrl(match[2], pageUrl);
    if (!url) continue;
    candidates.push({
      url,
      pageUrl: pageUrl.toString(),
      score: yupooImageScore(url, match[1]),
      order: order++,
    });
  }

  const escapedRegex = /(?:https?:)?(?:\\\/\\\/|\/\/)photo\.yupoo\.com(?:\\\/|\/)[^"'<>\s)]+?(?:jpe?g|png|webp|gif|avif)/gi;
  while ((match = escapedRegex.exec(html))) {
    const url = normalizeYupooImageUrl(match[0], pageUrl);
    if (!url) continue;
    candidates.push({
      url,
      pageUrl: pageUrl.toString(),
      score: yupooImageScore(url, "embedded"),
      order: order++,
    });
  }

  return candidates;
}

function extractYupooAlbumLinks(html, pageUrl) {
  const links = [];
  const seen = new Set();
  const hrefRegex = /\bhref=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html))) {
    const value = cleanEmbeddedUrl(match[1]);
    let url;
    try {
      url = new URL(value, pageUrl);
    } catch {
      continue;
    }
    if (!isYupooHost(url.hostname) || !/\/albums\/\d+/i.test(url.pathname)) continue;
    url.protocol = "https:";
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(key);
  }

  return links;
}

function chooseBestYupooImages(candidates) {
  const bestByImage = new Map();

  for (const candidate of candidates) {
    const key = yupooImageFamilyKey(candidate.url);
    const existing = bestByImage.get(key);
    if (!existing) {
      bestByImage.set(key, candidate);
    } else if (candidate.score > existing.score) {
      bestByImage.set(key, { ...candidate, order: existing.order });
    }
  }

  return [...bestByImage.values()].sort((a, b) => a.order - b.order);
}

function normalizeYupooImageUrl(value, pageUrl) {
  let cleaned = cleanEmbeddedUrl(value);
  if (!cleaned || cleaned.startsWith("data:")) return null;
  if (cleaned.startsWith("//")) cleaned = `https:${cleaned}`;

  let url;
  try {
    url = new URL(cleaned, pageUrl);
  } catch {
    return null;
  }

  if (!isLikelyYupooProductImageUrl(url)) return null;
  url.protocol = "https:";
  url.hash = "";
  return url.toString();
}

function cleanEmbeddedUrl(value) {
  return decodeHtmlEntities(String(value || "").trim())
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/^["']|["']$/g, "");
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&#39;/g, "'");
}

function isYupooHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "yupoo.com" || host.endsWith(".yupoo.com");
}

function isYupooPhotoHost(hostname) {
  return String(hostname || "").toLowerCase() === "photo.yupoo.com";
}

function isLikelyImageUrl(url) {
  const path = String(url.pathname || "").toLowerCase();
  return /\.(?:jpe?g|png|webp)$/.test(path) || /\/(?:big|small)\.jpe?g$/.test(path);
}

function isLikelyYupooProductImageUrl(url) {
  if (!isYupooPhotoHost(url.hostname) || !isLikelyImageUrl(url)) return false;
  const path = String(url.pathname || "").toLowerCase();
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  if (/(?:^|[-_/])(avatar|banner|brand|button|captcha|cart|close|empty|flag|icon|logo|qrcode|qr|search|sprite|wechat|weixin)(?:[-_.\/]|$)/i.test(path)) {
    return false;
  }
  return true;
}

function yupooImageScore(url, source) {
  const path = new URL(url).pathname.toLowerCase();
  let score = source === "data-origin-src" ? 100 : source === "data-src" ? 80 : source === "src" ? 50 : 35;
  if (!isLikelyYupooProductImageUrl(new URL(url))) score -= 1000;
  if (/\/(?:big)\.jpe?g$/.test(path)) score += 12;
  if (/\/(?:small)\.jpe?g$/.test(path)) score -= 18;
  if (/\/[a-f0-9]{6,}\.(?:jpe?g|png|webp|gif|avif)$/i.test(path)) score += 20;
  return score;
}

function yupooImageFamilyKey(value) {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname === "photo.yupoo.com" && parts.length >= 2) {
    return `${url.hostname}/${parts[0]}/${parts[1]}`;
  }
  return `${url.hostname}${url.pathname.replace(/\/(?:big|small)\.(jpe?g)$/i, "/$1")}`;
}

async function fetchYupooImage(imageUrl, referer) {
  const response = await fetch(imageUrl, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      referer,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw statusError(`Yupoo image could not be downloaded (${response.status}).`, 502);
  }

  const fallbackType = contentTypeFromImageUrl(imageUrl) || "image/jpeg";
  const contentType = normalizeImageContentType(response.headers.get("content-type")) || fallbackType;
  if (!contentType.startsWith("image/")) {
    throw statusError("Yupoo returned a non-image response.", 502);
  }

  const buffer = await response.arrayBuffer();
  const maxMb = 20;
  if (buffer.byteLength > maxMb * 1024 * 1024) {
    throw statusError("Yupoo image is larger than 20MB.", 400);
  }

  return {
    contentType,
    size: buffer.byteLength,
    b64: arrayBufferToBase64(buffer),
  };
}

function normalizeImageContentType(value) {
  const type = String(value || "").split(";")[0].trim().toLowerCase();
  if (type === "image/jpg" || type === "image/pjpeg") return "image/jpeg";
  return type.startsWith("image/") ? type : "";
}

function openAiImageContentType(value) {
  const type = normalizeImageContentType(value);
  return ["image/jpeg", "image/png", "image/webp"].includes(type) ? type : "";
}

function contentTypeFromImageUrl(value) {
  const path = new URL(value).pathname.toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".avif")) return "image/avif";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

function yupooFilename(value, index, contentType) {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  let name = decodeURIComponent(parts.at(-1) || "");
  if (/^(?:big|small)\.jpe?g$/i.test(name) && parts.length >= 2) {
    name = `${parts.at(-2)}.${extensionForContentType(contentType)}`;
  }
  if (!/\.[a-z0-9]+$/i.test(name)) {
    name = `${name || "image"}.${extensionForContentType(contentType)}`;
  }
  return safeFilename(`yupoo-${String(index).padStart(2, "0")}-${name}`);
}

function extensionForContentType(contentType) {
  return (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/avif": "avif",
    }[contentType] || "jpg"
  );
}

function outputSizeForModel(env, model) {
  const configured = env.ESNTLS_STUDIO_IMAGE_SIZE || env.OPENAI_IMAGE_SIZE;
  if (configured) return configured;
  return String(model || "").startsWith("gpt-image-2") ? "1200x1600" : "auto";
}

function outputSizeForMode(env, model, mode) {
  if (mode === "keep-crop") {
    return env.ESNTLS_STUDIO_KEEP_CROP_IMAGE_SIZE || env.OPENAI_KEEP_CROP_IMAGE_SIZE || "auto";
  }
  if (mode === "auto") {
    return env.ESNTLS_STUDIO_AUTO_IMAGE_SIZE || env.OPENAI_AUTO_IMAGE_SIZE || "auto";
  }
  return outputSizeForModel(env, model);
}

function normalizeGenerationMode(value) {
  const mode = String(value || "").toLowerCase();
  if (mode === "blank") return "blank";
  if (mode === "keep-crop") return "keep-crop";
  if (mode === "keep") return "keep";
  if (mode === "auto") return "auto";
  return "flatlay";
}

export function normalizeExtraInstruction(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string") {
    throw statusError("Extra instructions must be text.", 400);
  }

  const normalized = value.replace(/\0/g, "").replace(/\r\n?/g, "\n").trim();
  if (normalized.length > MAX_EXTRA_INSTRUCTION_LENGTH) {
    throw statusError(`Extra instructions must be ${MAX_EXTRA_INSTRUCTION_LENGTH} characters or fewer.`, 400);
  }
  return normalized;
}

function parseProductModes(value, total, fallbackMode = "auto") {
  const fallback = normalizeGenerationMode(fallbackMode);
  if (!value) return Array.from({ length: total }, () => fallback);

  let parsed = [];
  try {
    parsed = JSON.parse(String(value));
  } catch {
    parsed = [];
  }

  if (!Array.isArray(parsed)) parsed = [];
  return Array.from({ length: total }, (_, index) => normalizeGenerationMode(parsed[index] || fallback));
}

export function normalizeImageQuality(value, fallback = "medium") {
  const normalizedFallback = ["low", "medium", "high", "auto"].includes(String(fallback || "").toLowerCase())
    ? String(fallback).toLowerCase()
    : "medium";
  const quality = String(value || "").trim().toLowerCase();
  return ["low", "medium", "high", "auto"].includes(quality) ? quality : normalizedFallback;
}

function outputQualityForEnv(env) {
  return normalizeImageQuality(env.ESNTLS_STUDIO_IMAGE_QUALITY || env.OPENAI_IMAGE_QUALITY, "medium");
}

function requestedImageQuality(env, value) {
  const configured = outputQualityForEnv(env);
  const fallback = ["medium", "high"].includes(configured) ? configured : "medium";
  const requested = normalizeImageQuality(value, fallback);
  return ["medium", "high"].includes(requested) ? requested : fallback;
}

function shopifyBlankImageQualityForEnv(env) {
  return requestedImageQuality(
    env,
    env.ESNTLS_STUDIO_SHOPIFY_BLANK_IMAGE_QUALITY || env.SHOPIFY_BLANK_IMAGE_QUALITY || "medium",
  );
}

function outputFormatForEnv(env) {
  const format = String(env.ESNTLS_STUDIO_OUTPUT_FORMAT || env.OPENAI_OUTPUT_FORMAT || "jpeg").toLowerCase();
  return ["png", "jpeg", "webp"].includes(format) ? format : "jpeg";
}

function outputCompressionForEnv(env) {
  const value = Number(env.ESNTLS_STUDIO_OUTPUT_COMPRESSION || env.OPENAI_OUTPUT_COMPRESSION || 95);
  if (!Number.isFinite(value)) return 95;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function contentTypeForOutputFormat(format) {
  return (
    {
      png: PNG_TYPE,
      jpeg: JPEG_TYPE,
      webp: WEBP_TYPE,
    }[format] || JPEG_TYPE
  );
}

async function getDefaultBackground(request, env) {
  const background = await loadDefaultBackgroundResponse(request, env);
  return new Response(background.body, {
    headers: {
      "content-type": background.headers.get("content-type") || "image/png",
      "cache-control": "public, max-age=3600",
      ...corsHeaders(request, env),
    },
  });
}

async function loadDefaultBackgroundFile(request, env) {
  const response = await loadDefaultBackgroundResponse(request, env);
  const contentType = response.headers.get("content-type") || "image/png";
  return new Blob([await response.arrayBuffer()], { type: contentType });
}

async function loadDefaultBackgroundResponse(request, env) {
  const response = env.ASSETS
    ? await env.ASSETS.fetch(new Request(new URL(env.ESNTLS_STUDIO_BACKGROUND_PATH || BRAND.defaultBackgroundPath, request.url).toString(), { method: "GET" }))
    : await fetch(`${String(env.ESNTLS_STUDIO_PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, "")}${BRAND.defaultBackgroundPath}`);
  if (!response.ok) {
    throw statusError("Default ESNTLS Club background asset was not found.", 500);
  }
  return response;
}

function validateImageFile(file, label) {
  if (!file || typeof file !== "object" || !file.size) {
    throw statusError(`${label} is missing.`, 400);
  }

  const maxMb = 20;
  if (file.size > maxMb * 1024 * 1024) {
    throw statusError(`${label} is larger than ${maxMb}MB.`, 400);
  }

  return openAiImageContentType(file.type || "");
}

async function normalizeImageFileForOpenAi(file, label) {
  const declaredContentType = validateImageFile(file, label);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedContentType = detectImageContentType(bytes);
  const contentType = detectedContentType || declaredContentType;

  if (!openAiImageContentType(contentType)) {
    throw statusError(`${label} must be a JPEG, PNG, or WebP image file.`, 400);
  }

  const filename = normalizedImageFilename(file.name, label, contentType);
  if (typeof File === "function") {
    return new File([bytes], filename, { type: contentType });
  }

  const blob = new Blob([bytes], { type: contentType });
  blob.name = filename;
  return blob;
}

function detectImageContentType(bytes) {
  if (!bytes || bytes.length < 4) return "";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return PNG_TYPE;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return JPEG_TYPE;
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return WEBP_TYPE;
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (["avif", "heic", "heix", "hevc", "mif1"].includes(brand)) return `image/${brand}`;
  }
  return "";
}

function normalizedImageFilename(name, label, contentType) {
  const fallback = safeFilename(label || "image");
  const base = safeFilename(String(name || fallback).replace(/\.[a-z0-9]+$/i, "")) || fallback;
  return `${base}.${extensionForContentType(contentType)}`;
}

function json(data, request, env, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": JSON_TYPE,
      ...corsHeaders(request, env),
    },
  });
}

function corsHeaders(request, env) {
  const requestOrigin = request.headers.get("origin");
  const allowed = String(env.ESNTLS_STUDIO_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowOrigin = !requestOrigin || allowed.includes(requestOrigin) ? requestOrigin || "*" : allowed[0] || "*";

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-idempotency-key",
    "access-control-max-age": "86400",
    ...(allowOrigin !== "*" ? { "access-control-allow-credentials": "true" } : {}),
    vary: "Origin",
  };
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isPermanentImageError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return /billing hard limit|billing_limit|invalid api key|incorrect api key|authentication|unauthorized|unsupported mime|unsupported file|invalid image|invalid request|content policy|moderation|safety system|missing openai_api_key|must be a jpeg|must be a png|must be a webp|larger than 20mb/.test(message);
}

async function failQueuedMessage(env, rawBody, error) {
  const body = normalizeQueueMessageBody(rawBody);
  if (!body?.jobId) return;
  const job = await readJob(env, body.jobId);
  if (!job || isTerminalJobStatus(job.status)) return;
  const item = (job.items || []).find((entry) => entry.id === body.itemId);
  if (!item || ["complete", "failed", "cancelled"].includes(item.status)) return;
  item.status = "failed";
  item.permanent = true;
  item.error = error?.message || "Permanent image-generation error.";
  item.finishedAt = new Date().toISOString();
  await finalizeJobProgress(env, job);
}

function maxBulkImages(env) {
  return Math.max(1, Math.min(Number(env.ESNTLS_STUDIO_MAX_BULK_IMAGES || 24), 24));
}

function yupooImportLimit(env, requested) {
  return Math.max(1, Math.min(Number(requested || env.ESNTLS_STUDIO_YUPOO_IMPORT_LIMIT || 24), 60));
}

function outputFilename(originalName, id, contentType) {
  const base = safeFilename(originalName || "product.png").replace(/\.[a-z0-9]+$/i, "");
  return `${base}-esntls-bg-${id.slice(0, 8)}.${extensionForContentType(contentType)}`;
}

function safeFilename(value) {
  return String(value || "esntls-output.png")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "esntls-output.png";
}

function cleanPrefix(value) {
  const prefix = String(value || "").replace(/^\/+/, "");
  return prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
}

function mediaPublicUrl(env, key) {
  const base = String(env.ESNTLS_STUDIO_PUBLIC_URL || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function stripDataUrl(value) {
  const text = String(value || "");
  const marker = ";base64,";
  const index = text.indexOf(marker);
  return index >= 0 ? text.slice(index + marker.length) : text;
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
