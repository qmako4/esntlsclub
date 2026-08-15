#!/usr/bin/env node
// ESNTLS STOCKROOM — operator CLI.
//
// Adds members and sets member prices without touching the database by hand.
// Talks to the worker's admin endpoints, which are guarded by a bearer token
// set with:
//
//   wrangler secret put STOCKROOM_ADMIN_TOKEN --config wrangler.site-cdn.jsonc
//
// Put the same value in STOCKROOM_ADMIN_TOKEN locally (a .env file or the
// shell) before running this. Never commit it — this repo is public.
//
// Add or update a member (prints the password so you can send it on):
//   node scripts/stockroom-admin.mjs member --email sam@example.com --name "Sam"
//   node scripts/stockroom-admin.mjs member --email sam@example.com --password "..."
//
// Set member prices (product id and what the member pays, in pounds):
//   node scripts/stockroom-admin.mjs price --id 12 --member 50 --lane china
//   node scripts/stockroom-admin.mjs price --id 12 --member 50 --resale 99.99
//
// Price several at once from a CSV of  product_id,member_price[,resale_price]:
//   node scripts/stockroom-admin.mjs price --csv prices.csv
//
// Suspend or restore access:
//   node scripts/stockroom-admin.mjs member --email sam@example.com --status revoked
//
// Product detail the storefront feed does not carry (SKU, RRP, demand):
//   node scripts/stockroom-admin.mjs meta --id 12 --sku B30-BLK --rrp 249 --sold30d 412 \
//        --ships-from Hackney --deadstock --verified --bulk-from 6
//
// The size run, with real unit counts per size:
//   node scripts/stockroom-admin.mjs sizes --id 12 --sizes "UK 6:4,UK 7:6,UK 8:7,UK 9:5"
//   node scripts/stockroom-admin.mjs sizes --id 12 --footwear 5     # every UK size, 5 each
//   node scripts/stockroom-admin.mjs sizes --id 12 --clothing 8     # S,M,L,XL at 8 each
//
// Put a drop on the home page (omit --ends to run it open-ended):
//   node scripts/stockroom-admin.mjs drop --headline "Designer runners, under half retail" \
//        --eyebrow "THURSDAY DROP" --ends 2026-08-21T20:00:00Z

import { readFileSync } from 'node:fs';

const BASE = process.env.STOCKROOM_BASE_URL || 'https://esntlsclub.com';
const TOKEN = process.env.STOCKROOM_ADMIN_TOKEN;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

// Readable but strong: 4 words plus digits beats a random string nobody can
// dictate over Instagram DMs.
function generatePassword() {
  const words = [
    'stock', 'runner', 'batch', 'depop', 'margin', 'resell', 'grail', 'source',
    'flip', 'wholesale', 'drop', 'crease', 'archive', 'season', 'profit', 'lane',
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `${pick()}-${pick()}-${pick()}-${digits}`;
}

function poundsToPence(value) {
  const amount = Number.parseFloat(String(value).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(amount)) throw new Error(`Not a price: ${value}`);
  return Math.round(amount * 100);
}

async function post(path, body) {
  if (!TOKEN) {
    console.error('STOCKROOM_ADMIN_TOKEN is not set. See the header of this file.');
    process.exit(1);
  }
  const response = await fetch(`${BASE}/api/stockroom/admin/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Failed (${response.status}):`, data.error || 'unknown error');
    process.exit(1);
  }
  return data;
}

async function memberCommand(args) {
  const email = args.email;
  if (!email) {
    console.error('--email is required');
    process.exit(1);
  }
  const password = args.password || generatePassword();

  await post('member', {
    email,
    password,
    displayName: args.name || null,
    tier: args.tier || 'stockroom',
    status: args.status || 'active',
  });

  console.log('Member saved.');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Status:   ${args.status || 'active'}`);
  console.log('\nSend those to the member. This is the only time the password is shown.');
}

async function priceCommand(args) {
  const rows = [];

  if (args.csv) {
    const lines = readFileSync(args.csv, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || /^product_id/i.test(trimmed)) continue;
      const [id, member, resale] = trimmed.split(',').map((value) => value.trim());
      rows.push({
        productId: Number(id),
        memberPricePence: poundsToPence(member),
        resalePricePence: resale ? poundsToPence(resale) : null,
      });
    }
  } else {
    if (!args.id || !args.member) {
      console.error('--id and --member are required (or use --csv)');
      process.exit(1);
    }
    rows.push({
      productId: Number(args.id),
      memberPricePence: poundsToPence(args.member),
      resalePricePence: args.resale ? poundsToPence(args.resale) : null,
      lane: args.lane || null,
      stockState: args.stock || 'in_stock',
      note: args.note || null,
    });
  }

  const result = await post('pricing', { pricing: rows });
  console.log(`Priced ${result.updated} product(s).`);
}

const FOOTWEAR = ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'];
const CLOTHING = ['S', 'M', 'L', 'XL'];

async function metaCommand(args) {
  if (!args.id) {
    console.error('--id is required');
    process.exit(1);
  }
  await post('meta', {
    productId: Number(args.id),
    sku: args.sku || null,
    rrpPence: args.rrp ? poundsToPence(args.rrp) : null,
    sold30d: args.sold30d != null && args.sold30d !== true ? Number(args.sold30d) : null,
    shipsFrom: args['ships-from'] || null,
    deadstock: Boolean(args.deadstock),
    verified: Boolean(args.verified),
    moq: Number(args.moq) || 1,
    bulkFrom: args['bulk-from'] ? Number(args['bulk-from']) : null,
  });
  console.log(`Updated details for product ${args.id}.`);
}

async function sizesCommand(args) {
  if (!args.id) {
    console.error('--id is required');
    process.exit(1);
  }

  let sizes;
  if (args.sizes) {
    // "UK 6:4,UK 7:6" -> [{label:'UK 6', units:4}, ...]
    sizes = String(args.sizes).split(',').map((pair) => {
      const index = pair.lastIndexOf(':');
      if (index === -1) throw new Error(`Expected "size:units", got "${pair}"`);
      return { label: pair.slice(0, index).trim(), units: Number(pair.slice(index + 1)) };
    });
  } else if (args.footwear) {
    sizes = FOOTWEAR.map((label) => ({ label, units: Number(args.footwear) }));
  } else if (args.clothing) {
    sizes = CLOTHING.map((label) => ({ label, units: Number(args.clothing) }));
  } else {
    console.error('Pass --sizes "UK 6:4,UK 7:6", or --footwear N, or --clothing N');
    process.exit(1);
  }

  const result = await post('sizes', { productId: Number(args.id), sizes });
  const total = sizes.reduce((sum, size) => sum + size.units, 0);
  console.log(`Set ${result.sizes} sizes on product ${args.id} (${total} units in total).`);
}

async function dropCommand(args) {
  if (!args.headline) {
    console.error('--headline is required');
    process.exit(1);
  }
  await post('drop', {
    headline: args.headline,
    eyebrow: args.eyebrow || null,
    ctaLabel: args.cta || 'Shop the drop',
    imageUrl: args.image || null,
    category: args.category || null,
    startsAt: args.starts || null,
    endsAt: args.ends || null,
  });
  console.log('Drop is live on the Stockroom home page.');
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

if (command === 'member') await memberCommand(args);
else if (command === 'price') await priceCommand(args);
else if (command === 'meta') await metaCommand(args);
else if (command === 'sizes') await sizesCommand(args);
else if (command === 'drop') await dropCommand(args);
else {
  console.error('Usage: stockroom-admin.mjs <member|price|meta|sizes|drop> [options]');
  console.error('See the comments at the top of this file for examples.');
  process.exit(1);
}
