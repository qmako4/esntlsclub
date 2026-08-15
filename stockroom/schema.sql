-- ESNTLS STOCKROOM — D1 schema
--
-- Everything in this database is member-private. None of it may be committed to
-- the repo: the site is served from a public GitHub origin, so anything in the
-- repo is readable by anyone.
--
--   wrangler d1 create esntls-stockroom
--   wrangler d1 execute esntls-stockroom --remote --file=stockroom/schema.sql

-- Members --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS members (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT    NOT NULL UNIQUE,
  password_hash  TEXT    NOT NULL,       -- pbkdf2$<iterations>$<salt_b64>$<hash_b64>
  display_name   TEXT,
  tier           TEXT    NOT NULL DEFAULT 'stockroom',
  status         TEXT    NOT NULL DEFAULT 'active',   -- active | paused | revoked
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at  TEXT,
  login_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_members_email ON members (email);

-- Sessions -------------------------------------------------------------------
--
-- One row per active session. A member is allowed exactly one: logging in
-- deletes every other session for that member, so a shared account logs both
-- people out repeatedly. That is the anti-sharing mechanism.

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT    PRIMARY KEY,      -- sha-256 of the cookie value
  member_id    INTEGER NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT    NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_member  ON sessions (member_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Login audit ----------------------------------------------------------------
--
-- Kept so account sharing is visible after the fact: one account logging in
-- from several places in a day is the signal to look for.

CREATE TABLE IF NOT EXISTS login_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER,
  email      TEXT,
  outcome    TEXT NOT NULL,              -- ok | bad_password | unknown_email | locked
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_login_events_member ON login_events (member_id, created_at);

-- Member pricing -------------------------------------------------------------
--
-- product_id matches the id in products.json. member_price_pence is what the
-- member pays; the retail price already in products.json is what it has been
-- proven to sell for, so it is the resale comparison rather than a guess.

CREATE TABLE IF NOT EXISTS product_pricing (
  product_id         INTEGER PRIMARY KEY,
  member_price_pence INTEGER NOT NULL,
  resale_price_pence INTEGER,            -- overrides products.json retail when set
  lane               TEXT,               -- next_day | china | NULL (fall back to feed)
  stock_state        TEXT NOT NULL DEFAULT 'in_stock',   -- in_stock | low | out
  note               TEXT,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Resale platforms -----------------------------------------------------------
--
-- Fees are data, not code, because UK resale fees have moved a lot: Depop
-- dropped its 10% seller fee in 2024 and eBay dropped private-seller selling
-- fees the same year, both shifting the charge to the buyer. Vinted has never
-- charged sellers. Keep these current here rather than in the worker.

CREATE TABLE IF NOT EXISTS platforms (
  slug            TEXT PRIMARY KEY,
  name            TEXT    NOT NULL,
  fee_percent     REAL    NOT NULL DEFAULT 0,    -- selling fee, % of sale price
  fee_fixed_pence INTEGER NOT NULL DEFAULT 0,
  pay_percent     REAL    NOT NULL DEFAULT 0,    -- payment processing, % of sale
  pay_fixed_pence INTEGER NOT NULL DEFAULT 0,
  ship_pence      INTEGER NOT NULL DEFAULT 0,    -- typical seller-borne postage
  active          INTEGER NOT NULL DEFAULT 1,
  note            TEXT,
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Defaults follow the design handoff's fee model. eBay's 12.8% + 30p is the
-- BUSINESS-seller rate and the handoff calls it a placeholder that varies by
-- category. UK private sellers currently pay no selling fee at all - if that is
-- how members sell, zero it:  UPDATE platforms SET fee_percent = 0 WHERE slug = 'ebay';
INSERT OR IGNORE INTO platforms
  (slug, name, fee_percent, fee_fixed_pence, pay_percent, pay_fixed_pence, ship_pence, note)
VALUES
  ('depop',  'Depop',  0.0,  0, 0.0,  0, 0,
   'No seller fees in the UK since 2024 - the buyer pays instead.'),
  ('ebay',   'eBay',  12.8, 30, 0.0,  0, 0,
   'Final value fee + 30p. Business-seller rate, varies by category. Private sellers pay nothing.'),
  ('vinted', 'Vinted', 0.0,  0, 0.0,  0, 0,
   'No seller fees. Buyer pays Buyer Protection and postage.');

-- Settings -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('postage_pence', '420'),          -- per-unit postage in the profit calculator
  ('hold_minutes',  '10'),           -- how long a cart holds stock
  ('trade_discount_tier_1', '0'),    -- percent off subtotal
  ('trade_discount_tier_2', '3');

-- Product detail -------------------------------------------------------------
--
-- The design shows a SKU, an RRP struck through, unit counts, and 30-day
-- sell-through. None of that is in products.json, so it lives here. Anything
-- left NULL makes the matching part of the UI hide rather than show a zero.

CREATE TABLE IF NOT EXISTS product_meta (
  product_id  INTEGER PRIMARY KEY,
  sku         TEXT,
  rrp_pence   INTEGER,              -- struck-through retail; falls back to the feed price
  sold_30d    INTEGER,              -- drives the demand band. NULL hides the band.
  ships_from  TEXT,
  deadstock   INTEGER NOT NULL DEFAULT 0,
  verified    INTEGER NOT NULL DEFAULT 0,
  moq         INTEGER NOT NULL DEFAULT 1,
  bulk_from   INTEGER,              -- qty at which bulk pricing starts
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Size run -------------------------------------------------------------------
--
-- One row per size per product, with real unit counts. The stock bar and the
-- "24 units in stock" line are summed from here, so they cannot drift from the
-- size tiles. A size with 0 units renders as the out-of-stock tile.

CREATE TABLE IF NOT EXISTS product_sizes (
  product_id INTEGER NOT NULL,
  size_label TEXT    NOT NULL,
  units      INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, size_label)
);

CREATE INDEX IF NOT EXISTS idx_product_sizes_product ON product_sizes (product_id, position);

-- Drops ----------------------------------------------------------------------
--
-- Powers the Home hero. With no live row the hero is not rendered at all,
-- rather than showing a countdown to nothing.

CREATE TABLE IF NOT EXISTS drops (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  eyebrow       TEXT,
  headline      TEXT NOT NULL,
  cta_label     TEXT NOT NULL DEFAULT 'Shop the drop',
  image_url     TEXT,
  category      TEXT,               -- filter applied when the CTA is tapped
  starts_at     TEXT,
  ends_at       TEXT,
  active        INTEGER NOT NULL DEFAULT 1
);

-- Bulk lots ------------------------------------------------------------------
--
-- Flagged in the handoff as a proposed merchandising unit, not a confirmed
-- catalogue feature. Modelled so it can be switched on by adding rows; the
-- Home section hides while the table is empty.

CREATE TABLE IF NOT EXISTS bulk_lots (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  eyebrow          TEXT,
  title            TEXT    NOT NULL,
  units            INTEGER NOT NULL,
  price_pence      INTEGER NOT NULL,
  image_url        TEXT,
  active           INTEGER NOT NULL DEFAULT 1
);

-- Restock alerts -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS restock_alerts (
  member_id  INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  notified_at TEXT,
  PRIMARY KEY (member_id, product_id)
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL,
  query      TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Stock holds ----------------------------------------------------------------
--
-- Adding to cart reserves units for `hold_minutes`. Expired holds are simply
-- ignored by the availability query rather than swept by a cron.

CREATE TABLE IF NOT EXISTS stock_holds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL,
  product_id  INTEGER NOT NULL,
  size_label  TEXT,
  qty         INTEGER NOT NULL,
  expires_at  TEXT    NOT NULL,
  released_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_holds_live ON stock_holds (product_id, expires_at, released_at);

-- Orders ---------------------------------------------------------------------
--
-- Placing an order records intent. It does NOT take payment: there is no
-- payment provider wired up yet, so `payment_state` stays 'unpaid' and the
-- order is settled out of band.

CREATE TABLE IF NOT EXISTS orders (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id          INTEGER NOT NULL,
  reference          TEXT    NOT NULL UNIQUE,
  subtotal_pence     INTEGER NOT NULL,
  discount_pence     INTEGER NOT NULL DEFAULT 0,
  shipping_pence     INTEGER NOT NULL DEFAULT 0,
  total_pence        INTEGER NOT NULL,
  projected_net_pence INTEGER NOT NULL DEFAULT 0,
  shipping_option    TEXT,
  ship_to            TEXT,           -- JSON blob of the address fields
  payment_method     TEXT,           -- card | net30 | bank
  payment_state      TEXT    NOT NULL DEFAULT 'unpaid',
  status             TEXT    NOT NULL DEFAULT 'placed',
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_member ON orders (member_id, created_at);

CREATE TABLE IF NOT EXISTS order_lines (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id           INTEGER NOT NULL,
  product_id         INTEGER NOT NULL,
  name               TEXT    NOT NULL,
  size_label         TEXT,
  qty                INTEGER NOT NULL,
  unit_price_pence   INTEGER NOT NULL,
  projected_net_pence INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_lines_order ON order_lines (order_id);

-- Account figures on Home (spend/30d, realised) are summed from orders, so they
-- read 0 until real orders exist rather than showing invented numbers.
