#!/usr/bin/env bash
# ESNTLS STOCKROOM — one-command launch.
#
#   bash scripts/stockroom-launch.sh
#
# Creates the D1 database, writes its id into wrangler.site-cdn.jsonc, applies
# the schema, sets the admin token, deploys the worker, and creates your first
# member account. Safe to run again: every step checks whether it is already
# done and skips it, so a failed run can simply be re-run.
#
# You need to be logged in to Cloudflare first:  npx wrangler login

set -euo pipefail

CONFIG="wrangler.site-cdn.jsonc"
DB_NAME="esntls-stockroom"
WRANGLER="npx --yes wrangler@4"

cd "$(dirname "$0")/.."

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
ok()   { printf '  · %s\n' "$*"; }

[ -f "$CONFIG" ] || { echo "Run this from the repo root ($CONFIG not found)."; exit 1; }

# --- 1. database ------------------------------------------------------------
say "1/5  Database"
if grep -q 'PASTE_DATABASE_ID' "$CONFIG"; then
  # `d1 create` fails if it already exists, so fall back to looking up the id.
  CREATE_OUT="$($WRANGLER d1 create "$DB_NAME" 2>&1 || true)"
  DB_ID="$(printf '%s' "$CREATE_OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"

  if [ -z "$DB_ID" ]; then
    ok "already exists, looking up its id"
    DB_ID="$($WRANGLER d1 info "$DB_NAME" --json 2>/dev/null \
             | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"
  fi

  if [ -z "$DB_ID" ]; then
    warn "Could not determine the database id. Output was:"
    printf '%s\n' "$CREATE_OUT"
    warn "Paste the id into $CONFIG by hand, then run this again."
    exit 1
  fi

  # Keep a backup: this rewrites a tracked file.
  cp "$CONFIG" "$CONFIG.bak"
  sed -i.tmp "s/PASTE_DATABASE_ID_FROM_WRANGLER_D1_CREATE/$DB_ID/" "$CONFIG" && rm -f "$CONFIG.tmp"
  ok "database id written into $CONFIG (backup at $CONFIG.bak)"
else
  ok "database id already set, skipping"
fi

# --- 2. schema --------------------------------------------------------------
say "2/5  Tables"
$WRANGLER d1 execute "$DB_NAME" --remote --file=stockroom/schema.sql --yes
ok "schema applied"

# --- 3. admin token ---------------------------------------------------------
say "3/5  Admin token"
if [ -n "${STOCKROOM_ADMIN_TOKEN:-}" ]; then
  ok "using STOCKROOM_ADMIN_TOKEN from your shell"
else
  STOCKROOM_ADMIN_TOKEN="$(head -c 32 /dev/urandom | base64 | tr -d '=+/' | cut -c1-40)"
  ok "generated a new one"
fi
printf '%s' "$STOCKROOM_ADMIN_TOKEN" | $WRANGLER secret put STOCKROOM_ADMIN_TOKEN --config "$CONFIG"

# --- 4. deploy --------------------------------------------------------------
say "4/5  Deploy"
$WRANGLER deploy --config "$CONFIG"

# --- 5. first member --------------------------------------------------------
say "5/5  Your account"
read -r -p "  Email for your own Stockroom login (blank to skip): " EMAIL
if [ -n "$EMAIL" ]; then
  # Give the freshly deployed worker a moment to start answering.
  sleep 5
  STOCKROOM_ADMIN_TOKEN="$STOCKROOM_ADMIN_TOKEN" \
    node scripts/stockroom-admin.mjs member --email "$EMAIL" --name "ESNTLS" --tier "tier 2"
fi

cat <<DONE

Stockroom is live:  https://esntlsclub.com/stockroom

Keep this admin token somewhere safe — it is how you add members and prices,
and it is not shown again:

  STOCKROOM_ADMIN_TOKEN=$STOCKROOM_ADMIN_TOKEN

Nothing shows up until products have a member price. Set one:

  export STOCKROOM_ADMIN_TOKEN=$STOCKROOM_ADMIN_TOKEN
  node scripts/stockroom-admin.mjs price --id 1 --member 58
  node scripts/stockroom-admin.mjs sizes --id 1 --footwear 5

Commit the database id that was written into $CONFIG:

  git add $CONFIG && git commit -m "Point Stockroom at its D1 database"

DONE
