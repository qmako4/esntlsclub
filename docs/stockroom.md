# ESNTLS STOCKROOM

A members-only wholesale website for ESNTLS resellers. Members see what they pay,
what the item has actually sold for, the net profit after fees on each resale
platform, and which platform to sell it on — then order.

Live at `esntlsclub.com/stockroom`.

Built from the `design_handoff_esntls_stockroom` package: Home, Product detail,
Browse/search, Cart, Checkout. The handoff is mobile-first at 390pt; this is a
responsive website, so those are the small-breakpoint spec and the layouts widen
into columns above 900px (top nav on desktop, bottom tab bar below).

## Why it is built this way

The public site is static files proxied from a **public** GitHub repo by
`worker/site-cdn-worker.js`. Anything committed here can be read by anyone.
Member prices and accounts therefore cannot live in the repo, in
`products.json`, or in the page source — they live in Cloudflare D1 and are only
sent in response to a request carrying a valid session cookie. `stockroom.html`
ships with no prices in it at all.

The handoff asks: *"Wholesale pricing is shown without a paywall; confirm whether
an account gate is required."* It is — Stockroom is gated behind a member login.

> Related: `admin.html` still has `const ADMIN_PASS` hard-coded in the page,
> which is public for the same reason. `/api/stockroom/login` is the pattern to
> replace it with.

## Setup

```bash
wrangler d1 create esntls-stockroom
#   paste the returned database_id into wrangler.site-cdn.jsonc
wrangler d1 execute esntls-stockroom --remote --file=stockroom/schema.sql
wrangler secret put STOCKROOM_ADMIN_TOKEN --config wrangler.site-cdn.jsonc
wrangler deploy --config wrangler.site-cdn.jsonc
```

## Running it

Set `STOCKROOM_ADMIN_TOKEN` in your shell to the same value.

```bash
# Members — the password prints once, send it on; only a hash is stored
node scripts/stockroom-admin.mjs member --email sam@example.com --name "Sam" --tier "tier 2"
node scripts/stockroom-admin.mjs member --email sam@example.com --password "..." --status revoked

# What the member pays (retail from products.json is the resale figure unless overridden)
node scripts/stockroom-admin.mjs price --id 12 --member 50 --lane next_day
node scripts/stockroom-admin.mjs price --csv prices.csv        # product_id,member_price[,resale]

# Detail the storefront feed does not carry
node scripts/stockroom-admin.mjs meta --id 12 --sku B30-BLK --rrp 249 --sold30d 412 \
     --ships-from Hackney --deadstock --verified --bulk-from 6

# The size run, with real unit counts
node scripts/stockroom-admin.mjs sizes --id 12 --sizes "UK 6:4,UK 7:6,UK 8:7"
node scripts/stockroom-admin.mjs sizes --id 12 --footwear 5

# A drop on the home page
node scripts/stockroom-admin.mjs drop --headline "Designer runners, under half retail" \
     --eyebrow "THURSDAY DROP · 42 PAIRS" --ends 2026-08-21T20:00:00Z
```

Products with no member price are hidden rather than shown at £0, so pricing can
be done gradually. Sections with no data (drop, bulk lots, restock alerts,
demand band) hide themselves rather than rendering an empty shell.

## How profit is worked out

```
net    = resale − wholesale cost − postage − platform fee
margin = net / resale
```

The resale price is what the item has **actually sold for in the ESNTLS store**,
from `products.json`, overridable per product. It is not a scraped market
estimate: Depop, Vinted and eBay publish no usable resale-comp API, so a "live
market price" would have been invented. Real sell-through is both more honest
and harder for a competitor to copy.

Postage (£4.20 by default, in `settings`) is subtracted on every platform,
because the reseller pays it whether or not the platform charges a fee.

Fees live in the `platforms` table, not in code. Defaults follow the handoff:
Depop and Vinted at zero, eBay at 12.8% + 30p. **That eBay rate is the
business-seller rate and the handoff calls it a placeholder** — UK private
sellers currently pay no selling fee at all. If that is how members sell:

```sql
UPDATE platforms SET fee_percent = 0, fee_fixed_pence = 0 WHERE slug = 'ebay';
```

### Which platform it recommends

Ranked by net, then weighted by how well that category sells on that platform
(`AUDIENCE_FIT` in `worker/stockroom.js`). The weighting matters because with
seller fees at zero on two of the three platforms, they tie on net exactly — the
fee table alone cannot pick a winner, so footwear goes to Depop/eBay over Vinted
even when the money is identical. Those weights are starting estimates; replace
them once there is real member sell-through.

## Stopping account sharing

A member gets **one session**. Logging in anywhere else deletes the previous
session, so two people on one account keep knocking each other out. The sign-in
screen says so, which is most of the deterrent.

This makes sharing annoying rather than impossible. `login_events` records every
attempt with IP and user agent, so genuine sharing shows up afterwards:

```sql
SELECT email, COUNT(DISTINCT ip) AS ips, COUNT(*) AS logins
  FROM login_events
 WHERE outcome = 'ok' AND created_at > datetime('now', '-7 days')
 GROUP BY email HAVING ips > 3 ORDER BY ips DESC;
```

Failed logins are rate limited: 8 failures from one email or IP in 15 minutes
locks further attempts for the rest of that window.

## Stock holds

Adding to cart reserves units for 10 minutes (`settings.hold_minutes`), so two
members cannot both buy the last pair while one is still typing an address.
Availability subtracts live holds; expired holds are ignored rather than swept by
a cron. A line whose hold runs out moves to saved-for-later instead of silently
vanishing.

## Payment — read this before launch

**Checkout does not take payment.** Placing an order writes an `orders` row with
`payment_state = 'unpaid'` and shows the member that nothing was charged. The
CARD / NET 30 / BANK tabs are built as designed but no provider is wired up.

That is deliberate rather than unfinished: connecting Stripe is a business
decision that is still open, and the design handoff itself flags *"Net 30 is
presented as a first-class payment method — confirm it is a real offer."*

## What is not built

- **Payment capture** (above).
- **Order history and tracking** in the member dashboard. Orders are recorded, so
  the data is there; the screens were not in the handoff.
- **Community features** — profiles, forums. Not in the handoff, and you already
  have a Telegram where the audience is.
- **Automatic stock sync.** Supply is dropshipped, so an item can go out of stock
  upstream without Stockroom knowing. `stock_state` and unit counts are set by
  the operator.
- **Account figures are real, so they read zero.** `SPEND / 30D` and `REALISED`
  sum actual orders. The handoff's £4,180 / +£1,264 are placeholders; showing
  invented numbers to a member would be worse than showing zero.

## Tests

```bash
node --test test/stockroom.test.mjs
```

Covers the profit maths against the handoff's worked example, platform ranking
and tie-breaks, catalogue assembly, price parsing, and password hashing.
