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

INSERT OR IGNORE INTO platforms
  (slug, name, fee_percent, fee_fixed_pence, pay_percent, pay_fixed_pence, ship_pence, note)
VALUES
  ('depop',  'Depop',  0.0, 0, 2.9, 30, 0,
   'Seller selling fee removed 2024; buyer pays a fee. Payment processing still applies on Depop Payments.'),
  ('ebay',   'eBay',   0.0, 0, 0.0,  0, 0,
   'Private-seller selling fees removed 2024; buyer pays the Buyer Protection fee. Business sellers DO pay category fees - set fee_percent if you sell as a business.'),
  ('vinted', 'Vinted', 0.0, 0, 0.0,  0, 0,
   'No seller fees. Buyer pays Buyer Protection. Postage via Vinted labels is buyer-paid.');

-- Settings -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
