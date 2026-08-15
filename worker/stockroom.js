// ESNTLS STOCKROOM — member API.
//
// Mounted at /api/stockroom/* by worker/site-cdn-worker.js.
//
// The rest of the site is public files proxied from a public GitHub repo, so
// nothing member-private can live there. Member prices and accounts live in D1
// and are only ever sent to a request carrying a valid session cookie.

const COOKIE_NAME = 'esntls_sr';
const SESSION_DAYS = 14;
const PBKDF2_ITERATIONS = 210000;
const MAX_FAILED_LOGINS = 8;
const FAILED_LOGIN_WINDOW_MINUTES = 15;

// How well each category sells on each platform, 0-1. Used only to break ties
// between platforms whose net is close. Tune from your own sell-through —
// these are starting values, not measurements.
const AUDIENCE_FIT = {
  Footwear:    { ebay: 1.00, depop: 0.90, vinted: 0.55 },
  B22:         { ebay: 1.00, depop: 0.90, vinted: 0.55 },
  B30:         { ebay: 1.00, depop: 0.90, vinted: 0.55 },
  Sneakers:    { ebay: 1.00, depop: 0.90, vinted: 0.55 },
  Sandals:     { vinted: 0.85, depop: 0.80, ebay: 0.70 },
  Jackets:     { depop: 0.95, vinted: 0.85, ebay: 0.80 },
  Outerwear:   { depop: 0.95, vinted: 0.85, ebay: 0.80 },
  Tracksuits:  { depop: 1.00, vinted: 0.85, ebay: 0.70 },
  Shirts:      { depop: 1.00, vinted: 0.90, ebay: 0.60 },
  Bags:        { ebay: 0.95, depop: 0.90, vinted: 0.60 },
  Accessories: { depop: 0.90, ebay: 0.80, vinted: 0.70 },
};
const DEFAULT_FIT = { depop: 0.85, ebay: 0.85, vinted: 0.75 };

const DEFAULT_SETTINGS = {
  postage_pence: 420,
  hold_minutes: 10,
  trade_discount_tier_1: 0,
  trade_discount_tier_2: 3,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time compare so a wrong password cannot be narrowed down by timing.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function derivePasswordHash(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${hash}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  const hash = await derivePasswordHash(password, base64ToBytes(parts[2]), iterations);
  return timingSafeEqual(hash, parts[3]);
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function sessionCookie(token, maxAgeSeconds) {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || '';
}

// "£129.99" -> 12999. "Out of stock" and anything unparseable -> null.
export function priceToPence(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.round(Number.parseFloat(match[1]) * 100);
}

async function loadSettings(env) {
  const rows = await env.STOCKROOM_DB.prepare('SELECT key, value FROM settings').all();
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows.results || []) {
    const numeric = Number(row.value);
    settings[row.key] = Number.isFinite(numeric) ? numeric : row.value;
  }
  return settings;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

// One session per member: every other session for this member is deleted, so a
// second person using the same account logs the first one out.
async function createSession(env, member, request) {
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();

  await env.STOCKROOM_DB.batch([
    env.STOCKROOM_DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(member.id),
    env.STOCKROOM_DB
      .prepare(
        `INSERT INTO sessions (token_hash, member_id, expires_at, ip, user_agent)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        tokenHash,
        member.id,
        expires,
        clientIp(request),
        (request.headers.get('User-Agent') || '').slice(0, 300),
      ),
    env.STOCKROOM_DB
      .prepare(
        `UPDATE members
            SET last_login_at = datetime('now'), login_count = login_count + 1
          WHERE id = ?`,
      )
      .bind(member.id),
  ]);

  return { token, maxAge: SESSION_DAYS * 86400 };
}

async function resolveSession(env, request) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;

  const row = await env.STOCKROOM_DB
    .prepare(
      `SELECT s.token_hash, s.expires_at, m.id, m.email, m.display_name, m.tier, m.status
         FROM sessions s
         JOIN members m ON m.id = s.member_id
        WHERE s.token_hash = ?`,
    )
    .bind(await sha256Hex(token))
    .first();

  if (!row) return null;

  if (new Date(row.expires_at).getTime() < Date.now() || row.status !== 'active') {
    await env.STOCKROOM_DB
      .prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(row.token_hash)
      .run();
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    tier: row.tier,
    tokenHash: row.token_hash,
  };
}

// ---------------------------------------------------------------------------
// Profit model
// ---------------------------------------------------------------------------

function fitFor(categories, slug) {
  let best = 0;
  let matched = false;
  for (const category of categories) {
    const row = AUDIENCE_FIT[category];
    if (row && typeof row[slug] === 'number') {
      matched = true;
      best = Math.max(best, row[slug]);
    }
  }
  return matched ? best : (DEFAULT_FIT[slug] ?? 0.75);
}

// net = resale − wholesale cost − postage − platform fee.
//
// Postage is included because the reseller pays it whether or not the platform
// charges a fee, and leaving it out makes every net look better than it is.
export function netFor(platform, costPence, resalePence, postagePence) {
  const sellingFee = Math.round((resalePence * platform.fee_percent) / 100) + platform.fee_fixed_pence;
  const paymentFee = Math.round((resalePence * platform.pay_percent) / 100) + platform.pay_fixed_pence;
  const postage = postagePence + (platform.ship_pence || 0);
  const netPence = resalePence - costPence - postage - sellingFee - paymentFee;

  return {
    slug: platform.slug,
    name: platform.name,
    feePence: sellingFee + paymentFee,
    postagePence: postage,
    netPence,
    marginPercent: resalePence > 0 ? Math.round((netPence / resalePence) * 100) : 0,
    roiPercent: costPence > 0 ? Math.round((netPence / costPence) * 100) : 0,
    note: platform.note || '',
  };
}

// Ranked by net, then by whether that platform actually shifts this category.
// With UK seller fees at or near zero on all three, platforms frequently tie on
// net exactly — the fee table alone cannot pick a winner.
export function rankPlatforms(platforms, categories, costPence, resalePence, postagePence) {
  return platforms
    .map((platform) => {
      const result = netFor(platform, costPence, resalePence, postagePence);
      result.fit = fitFor(categories, platform.slug);
      result.score = result.netPence * result.fit;
      return result;
    })
    .sort((a, b) => b.score - a.score);
}

function categoriesOf(product) {
  const categories = String(product.category || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (product.brand) categories.push(String(product.brand).trim());
  return categories;
}

export function buildProduct(product, context) {
  const { pricing, meta, sizes = [], platforms = [], postagePence = 0 } = context || {};

  const costPence = pricing ? pricing.member_price_pence : null;
  const feedPence = priceToPence(product.price);
  const resalePence = (pricing && pricing.resale_price_pence) || feedPence;
  const rrpPence = (meta && meta.rrp_pence) || feedPence;
  const categories = categoriesOf(product);

  const unitsInStock = sizes.reduce((total, size) => total + Math.max(0, size.units), 0);

  const item = {
    id: product.id,
    name: product.name,
    brand: product.brand || '',
    categories,
    images: Array.isArray(product.images) ? product.images.slice(0, 8) : [],
    delivery: product.delivery || '',
    lane: (pricing && pricing.lane) || null,
    stockState: pricing ? pricing.stock_state : 'unknown',
    note: (pricing && pricing.note) || '',
    sku: (meta && meta.sku) || null,
    shipsFrom: (meta && meta.ships_from) || null,
    deadstock: Boolean(meta && meta.deadstock),
    verified: Boolean(meta && meta.verified),
    moq: (meta && meta.moq) || 1,
    bulkFrom: (meta && meta.bulk_from) || null,
    sold30d: meta && meta.sold_30d != null ? meta.sold_30d : null,
    costPence,
    resalePence,
    rrpPence,
    // "38% BELOW" on the price card. Only meaningful when an RRP is above cost.
    belowRrpPercent:
      rrpPence && costPence && rrpPence > costPence
        ? Math.round(((rrpPence - costPence) / rrpPence) * 100)
        : null,
    sizes: sizes.map((size) => ({ label: size.size_label, units: size.units })),
    unitsInStock,
    priced: Number.isFinite(costPence) && Number.isFinite(resalePence),
    platforms: [],
    best: null,
  };

  if (!item.priced) return item;

  item.platforms = rankPlatforms(platforms, categories, costPence, resalePence, postagePence);
  const [winner, runnerUp] = item.platforms;
  if (winner) {
    const tied = runnerUp && Math.abs(winner.netPence - runnerUp.netPence) <= 100;
    item.best = {
      slug: winner.slug,
      name: winner.name,
      netPence: winner.netPence,
      reason: tied
        ? `Similar net to ${runnerUp.name}; ${winner.name} sells this category faster`
        : `Highest net after fees on ${winner.name}`,
    };
  }
  return item;
}

// ---------------------------------------------------------------------------
// Catalogue assembly
// ---------------------------------------------------------------------------

async function loadFeed(env) {
  const object = await env.MEDIA_BUCKET.get('products.json');
  if (!object) return [];
  let feed;
  try {
    feed = JSON.parse(await object.text());
  } catch {
    return [];
  }
  const products = Array.isArray(feed) ? feed : feed.products || [];
  return products.filter(
    (product) =>
      product && product.active !== false && product.archived !== true && product.hidden !== true,
  );
}

// Units still free after live holds are subtracted.
async function heldUnits(env) {
  const rows = await env.STOCKROOM_DB
    .prepare(
      `SELECT product_id, size_label, SUM(qty) AS held
         FROM stock_holds
        WHERE released_at IS NULL AND expires_at > datetime('now')
        GROUP BY product_id, size_label`,
    )
    .all();
  const map = new Map();
  for (const row of rows.results || []) {
    map.set(`${row.product_id}|${row.size_label || ''}`, row.held);
  }
  return map;
}

async function loadCatalogue(env) {
  const [feed, settings, pricingRows, platformRows, metaRows, sizeRows, holds] = await Promise.all([
    loadFeed(env),
    loadSettings(env),
    env.STOCKROOM_DB.prepare('SELECT * FROM product_pricing').all(),
    env.STOCKROOM_DB.prepare('SELECT * FROM platforms WHERE active = 1').all(),
    env.STOCKROOM_DB.prepare('SELECT * FROM product_meta').all(),
    env.STOCKROOM_DB.prepare('SELECT * FROM product_sizes ORDER BY position, size_label').all(),
    heldUnits(env),
  ]);

  const pricingById = new Map((pricingRows.results || []).map((row) => [Number(row.product_id), row]));
  const metaById = new Map((metaRows.results || []).map((row) => [Number(row.product_id), row]));
  const sizesById = new Map();
  for (const row of sizeRows.results || []) {
    const held = holds.get(`${row.product_id}|${row.size_label}`) || 0;
    const list = sizesById.get(Number(row.product_id)) || [];
    list.push({ ...row, units: Math.max(0, row.units - held) });
    sizesById.set(Number(row.product_id), list);
  }

  const platforms = platformRows.results || [];
  const items = feed
    .map((product) =>
      buildProduct(product, {
        pricing: pricingById.get(Number(product.id)),
        meta: metaById.get(Number(product.id)),
        sizes: sizesById.get(Number(product.id)) || [],
        platforms,
        postagePence: settings.postage_pence,
      }),
    )
    .filter((item) => item.priced);

  return { items, platforms, settings, unpricedCount: feed.length - items.length };
}

function sortItems(items, mode) {
  const ranked = items.slice();
  ranked.sort((a, b) => {
    // Sold out always sinks: the top of a margin-ranked grid must be buyable.
    const aOut = a.stockState === 'out' || a.unitsInStock === 0 ? 1 : 0;
    const bOut = b.stockState === 'out' || b.unitsInStock === 0 ? 1 : 0;
    if (aOut !== bOut) return aOut - bOut;
    if (mode === 'cost') return a.costPence - b.costPence;
    if (mode === 'roi') return (b.platforms[0]?.roiPercent || 0) - (a.platforms[0]?.roiPercent || 0);
    return (b.platforms[0]?.netPence || 0) - (a.platforms[0]?.netPence || 0);
  });
  return ranked;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

async function recentFailedLogins(env, email, ip) {
  const row = await env.STOCKROOM_DB
    .prepare(
      `SELECT COUNT(*) AS failures
         FROM login_events
        WHERE outcome != 'ok'
          AND (email = ? OR ip = ?)
          AND created_at > datetime('now', ?)`,
    )
    .bind(email, ip, `-${FAILED_LOGIN_WINDOW_MINUTES} minutes`)
    .first();
  return row ? row.failures : 0;
}

async function recordLogin(env, { memberId, email, outcome, request }) {
  await env.STOCKROOM_DB
    .prepare(
      `INSERT INTO login_events (member_id, email, outcome, ip, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      memberId || null,
      email,
      outcome,
      clientIp(request),
      (request.headers.get('User-Agent') || '').slice(0, 300),
    )
    .run();
}

async function handleLogin(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  if (!email || !password) return json({ error: 'Email and password required' }, 400);

  if ((await recentFailedLogins(env, email, clientIp(request))) >= MAX_FAILED_LOGINS) {
    await recordLogin(env, { email, outcome: 'locked', request });
    return json(
      { error: `Too many attempts. Wait ${FAILED_LOGIN_WINDOW_MINUTES} minutes and try again.` },
      429,
    );
  }

  const member = await env.STOCKROOM_DB
    .prepare('SELECT id, email, display_name, tier, status, password_hash FROM members WHERE email = ?')
    .bind(email)
    .first();

  if (!member) {
    // Still run a hash so a missing account does not answer faster than a wrong
    // password, which would let someone enumerate members.
    await derivePasswordHash(password, crypto.getRandomValues(new Uint8Array(16)), PBKDF2_ITERATIONS);
    await recordLogin(env, { email, outcome: 'unknown_email', request });
    return json({ error: 'Email or password is incorrect' }, 401);
  }

  if (!(await verifyPassword(password, member.password_hash))) {
    await recordLogin(env, { memberId: member.id, email, outcome: 'bad_password', request });
    return json({ error: 'Email or password is incorrect' }, 401);
  }

  if (member.status !== 'active') {
    await recordLogin(env, { memberId: member.id, email, outcome: 'locked', request });
    return json({ error: 'This membership is not active. Contact ESNTLS.' }, 403);
  }

  const { token, maxAge } = await createSession(env, member, request);
  await recordLogin(env, { memberId: member.id, email, outcome: 'ok', request });

  return json(
    { member: { email: member.email, displayName: member.display_name, tier: member.tier } },
    200,
    { 'Set-Cookie': sessionCookie(token, maxAge) },
  );
}

async function handleLogout(request, env) {
  const session = await resolveSession(env, request);
  if (session) {
    await env.STOCKROOM_DB
      .prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(session.tokenHash)
      .run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

async function handleMe(request, env, session) {
  return json({
    member: { email: session.email, displayName: session.displayName, tier: session.tier },
  });
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

// Home account figures come from real orders. Before any order exists these are
// zero, which is correct — the design's £4,180 / +£1,264 are placeholders.
async function accountStats(env, memberId) {
  const row = await env.STOCKROOM_DB
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN created_at > datetime('now','-30 days') THEN total_pence END), 0) AS spend30d,
         COALESCE(SUM(CASE WHEN status = 'delivered' THEN projected_net_pence END), 0) AS realised
       FROM orders WHERE member_id = ?`,
    )
    .bind(memberId)
    .first();
  return { spend30dPence: row?.spend30d || 0, realisedPence: row?.realised || 0 };
}

async function handleHome(request, env, session) {
  const { items, settings, platforms } = await loadCatalogue(env);

  const [drop, lots, alerts, stats] = await Promise.all([
    env.STOCKROOM_DB
      .prepare(
        `SELECT * FROM drops
          WHERE active = 1
            AND (starts_at IS NULL OR starts_at <= datetime('now'))
            AND (ends_at   IS NULL OR ends_at   >  datetime('now'))
          ORDER BY id DESC LIMIT 1`,
      )
      .first(),
    env.STOCKROOM_DB.prepare('SELECT * FROM bulk_lots WHERE active = 1 ORDER BY id LIMIT 4').all(),
    env.STOCKROOM_DB
      .prepare('SELECT product_id FROM restock_alerts WHERE member_id = ? AND notified_at IS NULL')
      .bind(session.id)
      .all(),
    accountStats(env, session.id),
  ]);

  const alertIds = new Set((alerts.results || []).map((row) => Number(row.product_id)));
  const byMargin = sortItems(items, 'net');

  return json({
    member: { email: session.email, displayName: session.displayName, tier: session.tier },
    stats: { ...stats, tier: session.tier },
    skuCount: items.reduce((total, item) => total + Math.max(1, item.unitsInStock), 0),
    drop: drop
      ? {
          eyebrow: drop.eyebrow,
          headline: drop.headline,
          ctaLabel: drop.cta_label,
          imageUrl: drop.image_url,
          category: drop.category,
          endsAt: drop.ends_at,
          // "avg +£164 net" is measured across what is actually in the drop.
          avgNetPence: byMargin.length
            ? Math.round(
                byMargin.reduce((total, item) => total + (item.platforms[0]?.netPence || 0), 0) /
                  byMargin.length,
              )
            : null,
        }
      : null,
    categories: [...new Set(items.flatMap((item) => item.categories))].sort(),
    highestMargin: byMargin.slice(0, 8),
    restocks: byMargin.filter((item) => alertIds.has(item.id)).slice(0, 4),
    bulkLots: (lots.results || []).map((lot) => ({
      id: lot.id,
      eyebrow: lot.eyebrow,
      title: lot.title,
      units: lot.units,
      pricePence: lot.price_pence,
      unitPricePence: lot.units > 0 ? Math.round(lot.price_pence / lot.units) : null,
      imageUrl: lot.image_url,
    })),
    platforms: platforms.map((platform) => ({ slug: platform.slug, name: platform.name })),
    settings: { postagePence: settings.postage_pence, holdMinutes: settings.hold_minutes },
  });
}

async function handleBrowse(request, env, session) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim().toLowerCase();
  const category = url.searchParams.get('category') || '';
  const min = Number(url.searchParams.get('min')) || 0;
  const max = Number(url.searchParams.get('max')) || Infinity;
  const inStockOnly = url.searchParams.get('inStock') === '1';
  const sort = url.searchParams.get('sort') || 'net';

  const { items, settings, unpricedCount } = await loadCatalogue(env);

  const filtered = items.filter((item) => {
    if (query && !`${item.name} ${item.brand} ${item.sku || ''}`.toLowerCase().includes(query)) return false;
    if (category && !item.categories.includes(category)) return false;
    if (item.costPence < min * 100 || item.costPence > max * 100) return false;
    if (inStockOnly && (item.stockState === 'out' || item.unitsInStock === 0)) return false;
    return true;
  });

  return json({
    member: { email: session.email, displayName: session.displayName, tier: session.tier },
    categories: [...new Set(items.flatMap((item) => item.categories))].sort(),
    items: sortItems(filtered, sort),
    resultCount: filtered.length,
    unpricedCount,
    settings: { postagePence: settings.postage_pence },
  });
}

async function handleProduct(request, env, session, productId) {
  const { items, platforms, settings } = await loadCatalogue(env);
  const item = items.find((entry) => entry.id === Number(productId));
  if (!item) return json({ error: 'Not found' }, 404);

  const related = sortItems(
    items.filter(
      (entry) => entry.id !== item.id && entry.categories.some((c) => item.categories.includes(c)),
    ),
    'net',
  ).slice(0, 6);

  return json({
    member: { email: session.email, displayName: session.displayName, tier: session.tier },
    item,
    related,
    // The calculator runs client-side against these, so it stays live on the
    // slider without a round trip. Fees are data, never hardcoded in the page.
    platforms: platforms.map((platform) => ({
      slug: platform.slug,
      name: platform.name,
      feePercent: platform.fee_percent,
      feeFixedPence: platform.fee_fixed_pence,
      payPercent: platform.pay_percent,
      payFixedPence: platform.pay_fixed_pence,
      shipPence: platform.ship_pence,
      note: platform.note,
      fit: fitFor(item.categories, platform.slug),
    })),
    settings: { postagePence: settings.postage_pence, holdMinutes: settings.hold_minutes },
  });
}

// Adding to cart reserves units for `hold_minutes`, so two members cannot both
// buy the last pair while one of them is still typing an address.
async function handleHold(request, env, session) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const productId = Number(payload.productId);
  const sizeLabel = payload.sizeLabel || null;
  const qty = Math.max(1, Math.round(Number(payload.qty) || 1));
  if (!Number.isFinite(productId)) return json({ error: 'Unknown product' }, 400);

  const settings = await loadSettings(env);

  const sizeRow = await env.STOCKROOM_DB
    .prepare('SELECT units FROM product_sizes WHERE product_id = ? AND size_label = ?')
    .bind(productId, sizeLabel || '')
    .first();

  const held = await env.STOCKROOM_DB
    .prepare(
      `SELECT COALESCE(SUM(qty), 0) AS held FROM stock_holds
        WHERE product_id = ? AND (size_label IS ? OR size_label = ?)
          AND released_at IS NULL AND expires_at > datetime('now')
          AND member_id != ?`,
    )
    .bind(productId, sizeLabel, sizeLabel || '', session.id)
    .first();

  const available = (sizeRow?.units ?? Infinity) - (held?.held || 0);
  if (Number.isFinite(available) && qty > available) {
    return json({ error: `Only ${Math.max(0, available)} left in that size`, available: Math.max(0, available) }, 409);
  }

  const expiresAt = new Date(Date.now() + settings.hold_minutes * 60000).toISOString();
  await env.STOCKROOM_DB
    .prepare(
      `INSERT INTO stock_holds (member_id, product_id, size_label, qty, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(session.id, productId, sizeLabel, qty, expiresAt)
    .run();

  return json({ ok: true, expiresAt, holdMinutes: settings.hold_minutes });
}

async function handleAlert(request, env, session) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  const productId = Number(payload.productId);
  if (!Number.isFinite(productId)) return json({ error: 'Unknown product' }, 400);

  await env.STOCKROOM_DB
    .prepare('INSERT OR IGNORE INTO restock_alerts (member_id, product_id) VALUES (?, ?)')
    .bind(session.id, productId)
    .run();
  return json({ ok: true });
}

async function handleSaveSearch(request, env, session) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  const query = String(payload.query || '').trim();
  if (!query) return json({ error: 'Nothing to save' }, 400);

  await env.STOCKROOM_DB
    .prepare('INSERT INTO saved_searches (member_id, query) VALUES (?, ?)')
    .bind(session.id, query)
    .run();
  return json({ ok: true });
}

function orderReference() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const code = [...bytes].map((b) => b.toString(36).toUpperCase().padStart(2, '0')).join('');
  return `ESN-${code.slice(0, 6)}`;
}

// Records the order. Deliberately does NOT take payment: no provider is wired
// up, so payment_state stays 'unpaid' and settlement happens out of band.
async function handleOrder(request, env, session) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (!lines.length) return json({ error: 'Cart is empty' }, 400);

  const { items, settings } = await loadCatalogue(env);
  const byId = new Map(items.map((item) => [item.id, item]));

  let subtotal = 0;
  let projectedNet = 0;
  const resolved = [];

  for (const line of lines) {
    const item = byId.get(Number(line.productId));
    if (!item) return json({ error: `Product ${line.productId} is no longer available` }, 409);
    const qty = Math.max(1, Math.round(Number(line.qty) || 1));
    // Price is taken from the catalogue, never from the client, so a tampered
    // cart cannot set its own wholesale price.
    subtotal += item.costPence * qty;
    const net = (item.platforms[0]?.netPence || 0) * qty;
    projectedNet += net;
    resolved.push({
      productId: item.id,
      name: item.name,
      sizeLabel: line.sizeLabel || null,
      qty,
      unitPricePence: item.costPence,
      projectedNetPence: net,
    });
  }

  const tierKey = `trade_discount_tier_${String(session.tier || '').replace(/\D/g, '') || '1'}`;
  const discountPercent = Number(settings[tierKey]) || 0;
  const discount = Math.round((subtotal * discountPercent) / 100);
  const shipping = Math.max(0, Math.round(Number(payload.shippingPence) || 0));
  const total = subtotal - discount + shipping;
  const reference = orderReference();

  const insert = await env.STOCKROOM_DB
    .prepare(
      `INSERT INTO orders
         (member_id, reference, subtotal_pence, discount_pence, shipping_pence, total_pence,
          projected_net_pence, shipping_option, ship_to, payment_method, payment_state, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'placed')`,
    )
    .bind(
      session.id,
      reference,
      subtotal,
      discount,
      shipping,
      total,
      projectedNet,
      payload.shippingOption || null,
      JSON.stringify(payload.shipTo || {}),
      payload.paymentMethod || null,
    )
    .run();

  const orderId = insert.meta.last_row_id;
  await env.STOCKROOM_DB.batch(
    resolved.map((line) =>
      env.STOCKROOM_DB
        .prepare(
          `INSERT INTO order_lines
             (order_id, product_id, name, size_label, qty, unit_price_pence, projected_net_pence)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(orderId, line.productId, line.name, line.sizeLabel, line.qty, line.unitPricePence, line.projectedNetPence),
    ),
  );

  return json({
    ok: true,
    reference,
    totals: { subtotal, discount, discountPercent, shipping, total, projectedNet },
    // The page shows this so nobody believes a card was charged.
    paymentState: 'unpaid',
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

async function handleAdmin(request, env, action) {
  const expected = env.STOCKROOM_ADMIN_TOKEN;
  const supplied = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !supplied || !timingSafeEqual(supplied, expected)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  if (action === 'member') {
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    if (!email || password.length < 10) {
      return json({ error: 'Email and a password of at least 10 characters are required' }, 400);
    }
    await env.STOCKROOM_DB
      .prepare(
        `INSERT INTO members (email, password_hash, display_name, tier, status)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (email) DO UPDATE SET
           password_hash = excluded.password_hash,
           display_name  = excluded.display_name,
           tier          = excluded.tier,
           status        = excluded.status`,
      )
      .bind(
        email,
        await hashPassword(password),
        payload.displayName || null,
        payload.tier || 'stockroom',
        payload.status || 'active',
      )
      .run();
    return json({ ok: true, email });
  }

  if (action === 'pricing') {
    const rows = Array.isArray(payload.pricing) ? payload.pricing : [];
    if (!rows.length) return json({ error: 'No pricing rows supplied' }, 400);
    await env.STOCKROOM_DB.batch(
      rows.map((row) =>
        env.STOCKROOM_DB
          .prepare(
            `INSERT INTO product_pricing
               (product_id, member_price_pence, resale_price_pence, lane, stock_state, note, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT (product_id) DO UPDATE SET
               member_price_pence = excluded.member_price_pence,
               resale_price_pence = excluded.resale_price_pence,
               lane               = excluded.lane,
               stock_state        = excluded.stock_state,
               note               = excluded.note,
               updated_at         = datetime('now')`,
          )
          .bind(
            Number(row.productId),
            Math.round(Number(row.memberPricePence)),
            row.resalePricePence == null ? null : Math.round(Number(row.resalePricePence)),
            row.lane || null,
            row.stockState || 'in_stock',
            row.note || null,
          ),
      ),
    );
    return json({ ok: true, updated: rows.length });
  }

  if (action === 'meta') {
    await env.STOCKROOM_DB
      .prepare(
        `INSERT INTO product_meta
           (product_id, sku, rrp_pence, sold_30d, ships_from, deadstock, verified, moq, bulk_from, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT (product_id) DO UPDATE SET
           sku = excluded.sku, rrp_pence = excluded.rrp_pence, sold_30d = excluded.sold_30d,
           ships_from = excluded.ships_from, deadstock = excluded.deadstock,
           verified = excluded.verified, moq = excluded.moq, bulk_from = excluded.bulk_from,
           updated_at = datetime('now')`,
      )
      .bind(
        Number(payload.productId),
        payload.sku || null,
        payload.rrpPence == null ? null : Math.round(Number(payload.rrpPence)),
        payload.sold30d == null ? null : Math.round(Number(payload.sold30d)),
        payload.shipsFrom || null,
        payload.deadstock ? 1 : 0,
        payload.verified ? 1 : 0,
        Math.max(1, Number(payload.moq) || 1),
        payload.bulkFrom == null ? null : Number(payload.bulkFrom),
      )
      .run();
    return json({ ok: true });
  }

  if (action === 'sizes') {
    const productId = Number(payload.productId);
    const sizes = Array.isArray(payload.sizes) ? payload.sizes : [];
    if (!Number.isFinite(productId) || !sizes.length) {
      return json({ error: 'productId and sizes are required' }, 400);
    }
    await env.STOCKROOM_DB.batch([
      env.STOCKROOM_DB.prepare('DELETE FROM product_sizes WHERE product_id = ?').bind(productId),
      ...sizes.map((size, index) =>
        env.STOCKROOM_DB
          .prepare(
            'INSERT INTO product_sizes (product_id, size_label, units, position) VALUES (?, ?, ?, ?)',
          )
          .bind(productId, String(size.label), Math.max(0, Number(size.units) || 0), index),
      ),
    ]);
    return json({ ok: true, sizes: sizes.length });
  }

  if (action === 'drop') {
    await env.STOCKROOM_DB
      .prepare(
        `INSERT INTO drops (eyebrow, headline, cta_label, image_url, category, starts_at, ends_at, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        payload.eyebrow || null,
        String(payload.headline || 'New drop'),
        payload.ctaLabel || 'Shop the drop',
        payload.imageUrl || null,
        payload.category || null,
        payload.startsAt || null,
        payload.endsAt || null,
      )
      .run();
    return json({ ok: true });
  }

  return json({ error: 'Unknown admin action' }, 404);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function isStockroomPath(pathname) {
  return pathname === '/api/stockroom' || pathname.startsWith('/api/stockroom/');
}

export async function handleStockroom(request, env) {
  const { pathname } = new URL(request.url);
  const route = pathname.replace(/^\/api\/stockroom\/?/, '');
  const method = request.method;

  if (!env.STOCKROOM_DB) {
    return json({ error: 'Stockroom database is not configured' }, 503);
  }

  if (method === 'POST' && route === 'login') return handleLogin(request, env);
  if (method === 'POST' && route === 'logout') return handleLogout(request, env);
  if (method === 'POST' && route.startsWith('admin/')) {
    return handleAdmin(request, env, route.slice('admin/'.length));
  }

  // Everything past this point requires a live session.
  const session = await resolveSession(env, request);
  if (!session) return json({ error: 'Not signed in' }, 401);

  if (method === 'GET' && route === 'me') return handleMe(request, env, session);
  if (method === 'GET' && route === 'home') return handleHome(request, env, session);
  if (method === 'GET' && (route === 'browse' || route === 'catalogue')) {
    return handleBrowse(request, env, session);
  }
  if (method === 'GET' && route.startsWith('product/')) {
    return handleProduct(request, env, session, route.slice('product/'.length));
  }
  if (method === 'POST' && route === 'hold') return handleHold(request, env, session);
  if (method === 'POST' && route === 'alert') return handleAlert(request, env, session);
  if (method === 'POST' && route === 'saved-search') return handleSaveSearch(request, env, session);
  if (method === 'POST' && route === 'order') return handleOrder(request, env, session);

  return json({ error: 'Not found' }, 404);
}
