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
// between platforms whose profit is close. Tune from your own sell-through —
// these are starting values, not measurements.
const AUDIENCE_FIT = {
  Footwear:    { ebay: 1.00, depop: 0.90, vinted: 0.55 },
  B22:         { ebay: 1.00, depop: 0.90, vinted: 0.55 },
  B30:         { ebay: 1.00, depop: 0.90, vinted: 0.55 },
  Sandals:     { vinted: 0.85, depop: 0.80, ebay: 0.70 },
  Jackets:     { depop: 0.95, vinted: 0.85, ebay: 0.80 },
  Tracksuits:  { depop: 1.00, vinted: 0.85, ebay: 0.70 },
  Shirts:      { depop: 1.00, vinted: 0.90, ebay: 0.60 },
  Accessories: { depop: 0.90, ebay: 0.80, vinted: 0.70 },
};
const DEFAULT_FIT = { depop: 0.85, ebay: 0.85, vinted: 0.75 };

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

// profit = proven resale price - platform fees - postage - what the member paid.
// The resale price is the price this product has actually sold at in the ESNTLS
// store, not a scraped market estimate, so it is a floor worth trusting rather
// than a projection.
export function profitFor(platform, memberPence, resalePence) {
  const sellingFee = Math.round((resalePence * platform.fee_percent) / 100) + platform.fee_fixed_pence;
  const paymentFee = Math.round((resalePence * platform.pay_percent) / 100) + platform.pay_fixed_pence;
  const postage = platform.ship_pence;
  const netPence = resalePence - sellingFee - paymentFee - postage;
  const profitPence = netPence - memberPence;

  return {
    slug: platform.slug,
    name: platform.name,
    sellingFeePence: sellingFee,
    paymentFeePence: paymentFee,
    postagePence: postage,
    netPence,
    profitPence,
    marginPercent: resalePence > 0 ? (profitPence / resalePence) * 100 : 0,
    roiPercent: memberPence > 0 ? (profitPence / memberPence) * 100 : 0,
    note: platform.note || '',
  };
}

export function buildProduct(product, pricing, platforms) {
  const memberPence = pricing ? pricing.member_price_pence : null;
  const feedPence = priceToPence(product.price);
  const resalePence = (pricing && pricing.resale_price_pence) || feedPence;

  const categories = String(product.category || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (product.brand) categories.push(String(product.brand).trim());

  const base = {
    id: product.id,
    name: product.name,
    brand: product.brand || '',
    categories,
    images: Array.isArray(product.images) ? product.images.slice(0, 6) : [],
    delivery: product.delivery || '',
    lane: (pricing && pricing.lane) || null,
    stockState: pricing ? pricing.stock_state : 'unknown',
    note: (pricing && pricing.note) || '',
    memberPricePence: memberPence,
    resalePricePence: resalePence,
    priced: Number.isFinite(memberPence) && Number.isFinite(resalePence),
    platforms: [],
    best: null,
  };

  if (!base.priced) return base;

  base.platforms = platforms
    .map((platform) => {
      const result = profitFor(platform, memberPence, resalePence);
      result.fit = fitFor(categories, platform.slug);
      result.score = result.profitPence * result.fit;
      return result;
    })
    .sort((a, b) => b.score - a.score);

  const [winner, runnerUp] = base.platforms;
  if (winner) {
    const closeOnProfit =
      runnerUp && Math.abs(winner.profitPence - runnerUp.profitPence) <= 100;
    base.best = {
      slug: winner.slug,
      name: winner.name,
      profitPence: winner.profitPence,
      // Say which of the two things decided it, so the number is explainable
      // rather than an oracle.
      reason: closeOnProfit
        ? `Similar profit to ${runnerUp.name}; ${winner.name} sells this category faster`
        : `Highest profit after fees (${winner.name})`,
    };
  }

  return base;
}

// ---------------------------------------------------------------------------
// Route handlers
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
    {
      member: {
        email: member.email,
        displayName: member.display_name,
        tier: member.tier,
      },
    },
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

async function handleMe(request, env) {
  const session = await resolveSession(env, request);
  if (!session) return json({ error: 'Not signed in' }, 401);
  return json({
    member: { email: session.email, displayName: session.displayName, tier: session.tier },
  });
}

async function handleCatalogue(request, env) {
  const session = await resolveSession(env, request);
  if (!session) return json({ error: 'Not signed in' }, 401);

  await env.STOCKROOM_DB
    .prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE token_hash = ?")
    .bind(session.tokenHash)
    .run();

  const feedObject = await env.MEDIA_BUCKET.get('products.json');
  if (!feedObject) return json({ error: 'Catalogue unavailable' }, 503);

  let feed;
  try {
    feed = JSON.parse(await feedObject.text());
  } catch {
    return json({ error: 'Catalogue unavailable' }, 503);
  }

  const products = (Array.isArray(feed) ? feed : feed.products || []).filter(
    (product) => product && product.active !== false && product.archived !== true && product.hidden !== true,
  );

  const [pricingRows, platformRows] = await Promise.all([
    env.STOCKROOM_DB.prepare('SELECT * FROM product_pricing').all(),
    env.STOCKROOM_DB.prepare('SELECT * FROM platforms WHERE active = 1').all(),
  ]);

  const pricingById = new Map((pricingRows.results || []).map((row) => [Number(row.product_id), row]));
  const platforms = platformRows.results || [];

  const items = products
    .map((product) => buildProduct(product, pricingById.get(Number(product.id)), platforms))
    .filter((item) => item.priced)
    .sort((a, b) => (b.best?.profitPence || 0) - (a.best?.profitPence || 0));

  return json({
    member: { email: session.email, displayName: session.displayName, tier: session.tier },
    platforms: platforms.map((platform) => ({
      slug: platform.slug,
      name: platform.name,
      note: platform.note || '',
    })),
    items,
    // Products with no member price set yet are hidden rather than shown at £0.
    unpricedCount: products.length - items.length,
  });
}

// Admin write path, guarded by a secret set with
// `wrangler secret put STOCKROOM_ADMIN_TOKEN --config wrangler.site-cdn.jsonc`.
// Kept separate from the member session entirely.
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

    const statements = rows.map((row) =>
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
    );

    await env.STOCKROOM_DB.batch(statements);
    return json({ ok: true, updated: statements.length });
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
  if (method === 'GET' && route === 'me') return handleMe(request, env);
  if (method === 'GET' && route === 'catalogue') return handleCatalogue(request, env);
  if (method === 'POST' && route === 'admin/member') return handleAdmin(request, env, 'member');
  if (method === 'POST' && route === 'admin/pricing') return handleAdmin(request, env, 'pricing');

  return json({ error: 'Not found' }, 404);
}
