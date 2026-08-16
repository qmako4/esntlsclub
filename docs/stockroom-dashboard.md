# Launching Stockroom without a terminal

The click-only route, using the Cloudflare and GitHub websites. Nothing to
install, no commands.

If you are willing to run three commands, `scripts/stockroom-launch.sh` does all
of this in about two minutes — see `docs/stockroom.md`. This page is for when
that is not an option.

Roughly 15 minutes. Do the steps in order; step 4 depends on step 3.

---

## 1. Put the code on `main`

Your site is served from the `main` branch, so Stockroom has to be there or
`/stockroom` will 404. The code is currently on a branch.

1. Go to **github.com/qmako4/esntlsclub**
2. You should see a banner for `claude/esntls-club-access-9mb1yk`. Click
   **Compare & pull request**. If the banner is gone: **Pull requests** →
   **New pull request**, base `main`, compare `claude/esntls-club-access-9mb1yk`.
3. **Create pull request**, then **Merge pull request** → **Confirm merge**.

Nothing goes live from this alone — the page exists but has no database yet.

## 2. Create the database

1. Go to **dash.cloudflare.com**
2. Left sidebar → **Storage & Databases** → **D1 SQL Database**
3. **Create** → name it exactly `esntls-stockroom` → **Create**

## 3. Create the tables

1. Open `esntls-stockroom` → the **Console** tab
2. Open
   [stockroom/schema.sql](https://github.com/qmako4/esntlsclub/blob/main/stockroom/schema.sql)
   on GitHub, click the **copy** icon (top right of the file)
3. Paste the whole thing into the console → **Execute**

You should get a success message. Click **Tables** — you should see `members`,
`sessions`, `product_pricing`, `platforms`, `product_sizes`, `orders` and others.

> If it rejects the whole paste, run it in pieces: paste up to the first
> `CREATE TABLE`, execute, then continue. Order does not matter.

## 4. Point the worker at the database

1. Sidebar → **Compute (Workers)** → **Workers & Pages**
2. Click **esntls-site-edge**
3. **Settings** → **Bindings** → **Add binding** → **D1 database**
   - Variable name: `STOCKROOM_DB` — exactly this, it is how the code finds it
   - D1 database: `esntls-stockroom`
4. **Deploy**

## 5. Add the admin token

Still in **Settings**, find **Variables and Secrets** → **Add**:

- Type: **Secret** (not Text — Text would be readable later)
- Name: `STOCKROOM_ADMIN_TOKEN`
- Value: a long random string you invent, 30+ characters, letters and numbers

Save it somewhere safe. **Deploy**.

This guards the endpoints that create members and set prices. You only need it
if you later use the command-line tool; the steps below use SQL instead.

## 6. Update the worker code

1. Still on **esntls-site-edge** → **Edit code** (top right; may say
   **Quick edit**)
2. Open
   [stockroom/worker-bundled.js](https://github.com/qmako4/esntlsclub/blob/main/stockroom/worker-bundled.js)
   on GitHub and copy the whole file
3. In the editor, select everything (Ctrl+A / Cmd+A) and paste over it
4. **Deploy**

`worker-bundled.js` is the same code as `worker/site-cdn-worker.js` plus
`worker/stockroom.js`, joined into one file because this editor takes one file.
It is generated — if the sources change, it is rebuilt by
`node scripts/build-worker-bundle.mjs`.

Your storefront keeps working throughout: the bundle contains the existing site
worker unchanged, with Stockroom added.

## 7. Create your login

Passwords are stored hashed, and you cannot work out a hash by clicking — so
here is a ready-made account. Back in **D1** → `esntls-stockroom` →
**Console**, change the email to yours and execute:

```sql
INSERT INTO members (email, password_hash, display_name, tier, status)
VALUES (
  'you@esntls.club',
  'pbkdf2$210000$iq0Da7RJ5mQH6z6GhUDmrg==$9HaYIqntcNlr1sfDCD9Js5NSp9Y7tayX09RTpyqNg7Y=',
  'ESNTLS', 'tier 2', 'active'
);
```

The password is:

```
source-depop-lane-2621
```

**Change this before you give anyone else access.** It was generated in a chat
transcript, so treat it as a temporary key to get you in, not a real password.
Replace it later with
`node scripts/stockroom-admin.mjs member --email you@esntls.club --password "..."`,
or ask for a fresh hash to paste.

## 8. Sign in

Go to **esntlsclub.com/stockroom** and sign in.

It will be empty — that is correct. Products only appear once they have a member
price.

## 9. Add a price

D1 → **Console**. `product_id` matches the `id` in `products.json`, and prices
are in **pence** (£58.00 is `5800`).

```sql
INSERT INTO product_pricing (product_id, member_price_pence, stock_state, lane)
VALUES (1, 5800, 'in_stock', 'next_day');

INSERT INTO product_sizes (product_id, size_label, units, position) VALUES
  (1, 'UK 6', 4, 0), (1, 'UK 7', 6, 1), (1, 'UK 8', 7, 2),
  (1, 'UK 9', 5, 3), (1, 'UK 10', 3, 4), (1, 'UK 11', 2, 5);
```

Refresh `/stockroom` and the product is there with its profit figures.

Several at once:

```sql
INSERT INTO product_pricing (product_id, member_price_pence, stock_state) VALUES
  (1, 5800, 'in_stock'),
  (2, 5800, 'in_stock'),
  (3, 5800, 'in_stock');
```

Optional extras — SKU, RRP for the struck-through price, and 30-day demand:

```sql
INSERT INTO product_meta (product_id, sku, rrp_pence, sold_30d, ships_from, verified)
VALUES (1, 'B22-DKB', 24900, 412, 'Hackney', 1);
```

## 10. Add a member

Each member needs their own hashed password, which again cannot be produced by
clicking. Two options:

- Ask for a name/password pair and paste the `INSERT` (as in step 7)
- Or run one command: `node scripts/stockroom-admin.mjs member --email them@example.com`

To cut someone off:

```sql
UPDATE members SET status = 'revoked' WHERE email = 'them@example.com';
DELETE FROM sessions WHERE member_id = (SELECT id FROM members WHERE email = 'them@example.com');
```

---

## Checking it worked

In the D1 console:

```sql
-- who has signed in lately, and from how many places
SELECT email, COUNT(DISTINCT ip) AS places, COUNT(*) AS logins
  FROM login_events
 WHERE outcome = 'ok' AND created_at > datetime('now', '-7 days')
 GROUP BY email;

-- what is actually visible in Stockroom
SELECT COUNT(*) AS priced FROM product_pricing;
```

## If something is wrong

**`/stockroom` shows "Not found"** — step 1 did not merge, or step 6 did not
deploy. Check `main` on GitHub contains `stockroom.html`.

**"Stockroom database is not configured"** — the binding in step 4 is missing or
misnamed. It must be exactly `STOCKROOM_DB`.

**Sign-in says the password is wrong** — the hash in step 7 was pasted with a
line break in it. It must be one unbroken string, and `$` characters matter.

**The storefront broke** — step 6 pasted the wrong file. Cloudflare keeps every
previous version: Worker → **Deployments** → find the last good one →
**Rollback**.

**Everything looks right but products are missing** — they have no member price.
That is step 9, and it is the most common cause.
