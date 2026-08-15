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

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

if (command === 'member') await memberCommand(args);
else if (command === 'price') await priceCommand(args);
else {
  console.error('Usage: stockroom-admin.mjs <member|price> [options]');
  console.error('See the comments at the top of this file for examples.');
  process.exit(1);
}
