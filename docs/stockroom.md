# ESNTLS STOCKROOM

A members-only wholesale view of the ESNTLS catalogue. A signed-in member sees
what they pay, what the item has actually sold for, the profit after fees on
each resale platform, and which platform to sell it on.

Live at `esntlsclub.com/stockroom`.

## Why it is built this way

The public site is static files proxied from a **public** GitHub repo by
`worker/site-cdn-worker.js`. Anything committed to this repo can be read by
anyone. Member prices and member accounts therefore cannot live in the repo,
in `products.json`, or in the page source — they live in a Cloudflare D1
database and are only ever sent in response to a request carrying a valid
session cookie.

The same rule is why `stockroom.html` contains no prices and no password: it is
an empty shell until the API fills it in.

> Related: `admin.html` currently has `const ADMIN_PASS` hard-coded in the page,
> which is public for the same reason. That needs replacing with a real
> server-side check — Stockroom's `/api/stockroom/login` is the pattern to copy.

## Setup

```bash
# 1. Create the database
wrangler d1 create esntls-stockroom
#    Paste the returned database_id into wrangler.site-cdn.jsonc

# 2. Create the tables
wrangler d1 execute esntls-stockroom --remote --file=stockroom/schema.sql

# 3. Set the operator token used by scripts/stockroom-admin.mjs
wrangler secret put STOCKROOM_ADMIN_TOKEN --config wrangler.site-cdn.jsonc

# 4. Deploy
wrangler deploy --config wrangler.site-cdn.jsonc
```

## Running it

Set `STOCKROOM_ADMIN_TOKEN` in your shell to the same value from step 3.

**Add a member.** The password is generated and printed once — send it on, it is
stored only as a PBKDF2 hash and cannot be read back.

```bash
node scripts/stockroom-admin.mjs member --email sam@example.com --name "Sam"
```

**Set member prices.** `--member` is what the member pays. Retail from
`products.json` is used as the resale price unless `--resale` overrides it.

```bash
node scripts/stockroom-admin.mjs price --id 12 --member 50 --lane next_day
node scripts/stockroom-admin.mjs price --csv prices.csv   # product_id,member_price[,resale_price]
```

**Suspend or restore access** (a member who stops paying):

```bash
node scripts/stockroom-admin.mjs member --email sam@example.com --password "..." --status revoked
```

Products with no member price set are hidden from Stockroom rather than shown
at £0, so pricing can be done gradually.

## Stopping account sharing

A member gets **one session**. Logging in anywhere else deletes the previous
session, so two people on one account keep knocking each other out. The login
screen says so, which is most of the deterrent.

This makes sharing annoying rather than impossible — two people in the same
house taking turns will not be blocked. `login_events` records every attempt
with IP and user agent, so genuine sharing shows up as one account logging in
from several places in a day. Check it with:

```sql
SELECT email, COUNT(DISTINCT ip) AS ips, COUNT(*) AS logins
  FROM login_events
 WHERE outcome = 'ok' AND created_at > datetime('now', '-7 days')
 GROUP BY email HAVING ips > 3 ORDER BY ips DESC;
```

Failed logins are rate limited: 8 failures from one email or IP in 15 minutes
locks further attempts for the rest of that window.

## How profit is worked out

```
profit = resale price − platform fees − postage − what the member paid
```

The resale price is the price the item has **actually sold at in the ESNTLS
store**, taken from `products.json` (override per product with `--resale`). It
is not a scraped market estimate. Depop, Vinted and eBay publish no usable
resale-comp API, so a "live market price" would have been invented — real
sell-through is both more honest and harder for anyone else to copy.

Fees live in the `platforms` table, not in code, because they move: Depop
dropped its 10% seller fee in 2024 and eBay dropped private-seller selling fees
the same year, both shifting the charge to the buyer; Vinted has never charged
sellers. **If you sell as a business on eBay you do pay category fees** — set
`fee_percent` on the `ebay` row accordingly.

```sql
UPDATE platforms SET fee_percent = 9.0 WHERE slug = 'ebay';
```

### Which platform it recommends

Ranked by profit, then weighted by how well that category sells on that
platform (`AUDIENCE_FIT` in `worker/stockroom.js`). This matters because with
seller fees near zero on all three, several platforms often tie on profit
exactly — the tie is broken by where the item actually shifts, so footwear goes
to eBay and shirts go to Depop even when the money is identical.

Those weights are starting estimates, not measurements. Once there is real
member sell-through data, replace them with it.

## What this version does not do

- **No ordering.** Members see prices and profit; buying still goes through the
  existing Shopify checkout. Wholesale ordering is the next build.
- **No dashboards, order history, wishlists or community.** Those need
  per-member order records, which arrive with ordering.
- **No self-service signup or billing.** Accounts are created by hand with the
  CLI. Stripe subscriptions belong with ESNTLS ACCESS.
- **Stock state is manual.** `stock_state` is set per product by the operator;
  nothing checks supplier availability automatically. Since supply is
  dropshipped, an item can go out of stock upstream without Stockroom knowing.

## Tests

```bash
node --test test/stockroom.test.mjs
```

Covers the profit maths, the platform ranking, price parsing, and the password
hashing round-trip.
