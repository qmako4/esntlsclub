import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProduct,
  hashPassword,
  netFor,
  priceToPence,
  rankPlatforms,
  verifyPassword,
} from '../worker/stockroom.js';

// Fee models as seeded by stockroom/schema.sql, matching the design handoff.
const PLATFORMS = [
  { slug: 'depop',  name: 'Depop',  fee_percent: 0,    fee_fixed_pence: 0,  pay_percent: 0, pay_fixed_pence: 0, ship_pence: 0, note: '' },
  { slug: 'ebay',   name: 'eBay',   fee_percent: 12.8, fee_fixed_pence: 30, pay_percent: 0, pay_fixed_pence: 0, ship_pence: 0, note: '' },
  { slug: 'vinted', name: 'Vinted', fee_percent: 0,    fee_fixed_pence: 0,  pay_percent: 0, pay_fixed_pence: 0, ship_pence: 0, note: '' },
];
const POSTAGE = 420; // £4.20, the handoff default

test('priceToPence reads the price strings used in products.json', () => {
  assert.equal(priceToPence('£129.99'), 12999);
  assert.equal(priceToPence('£99.99'), 9999);
  assert.equal(priceToPence(49.99), 4999);
  assert.equal(priceToPence('Out of stock'), null);
  assert.equal(priceToPence(''), null);
});

test('net matches the handoff worked example (AF1: cost £68, resale £95)', () => {
  // The README specifies: net = resale − cost − postage − fee.
  const ebay = netFor(PLATFORMS[1], 6800, 9500, POSTAGE);
  assert.equal(ebay.feePence, Math.round(9500 * 0.128) + 30); // 1216 + 30
  assert.equal(ebay.netPence, 9500 - 6800 - 420 - 1246);
  assert.equal(ebay.netPence, 1034);
  assert.equal(ebay.marginPercent, 11);

  // Vinted and Depop take nothing from the seller, so they clear more.
  const vinted = netFor(PLATFORMS[2], 6800, 9500, POSTAGE);
  assert.equal(vinted.feePence, 0);
  assert.equal(vinted.netPence, 2280);
});

test('postage is subtracted even when a platform charges no fee', () => {
  const free = netFor(PLATFORMS[0], 5000, 9999, POSTAGE);
  assert.equal(free.feePence, 0);
  assert.equal(free.netPence, 9999 - 5000 - 420);
});

test('a product that cannot clear its cost reports a negative net', () => {
  const result = netFor(PLATFORMS[1], 12000, 9999, POSTAGE);
  assert.ok(result.netPence < 0);
});

test('footwear breaks a Depop/Vinted tie on category, not on fees', () => {
  const ranked = rankPlatforms(PLATFORMS, ['Footwear'], 5000, 9999, POSTAGE);

  // Depop and Vinted both charge nothing, so their nets are identical.
  const depop = ranked.find((row) => row.slug === 'depop');
  const vinted = ranked.find((row) => row.slug === 'vinted');
  assert.equal(depop.netPence, vinted.netPence);

  // Depop still outranks Vinted for footwear because it actually shifts them.
  assert.ok(ranked.indexOf(depop) < ranked.indexOf(vinted));
  assert.equal(ranked[0].slug, 'depop');
});

test('eBay does not win on fit alone when its fee makes it lose money', () => {
  const ranked = rankPlatforms(PLATFORMS, ['Footwear'], 9000, 9999, POSTAGE);
  assert.notEqual(ranked[0].slug, 'ebay');
});

test('buildProduct assembles a card from feed, pricing, meta and sizes', () => {
  const product = { id: 30, name: 'B30 Runner', brand: 'B30', category: 'Footwear,B30', price: '£99.99', images: ['a.jpg'] };
  const built = buildProduct(product, {
    pricing: { member_price_pence: 5000, stock_state: 'in_stock' },
    meta: { sku: 'B30-BLK', rrp_pence: 24900, sold_30d: 412, verified: 1, moq: 1 },
    sizes: [{ size_label: 'UK 8', units: 4 }, { size_label: 'UK 9', units: 0 }],
    platforms: PLATFORMS,
    postagePence: POSTAGE,
  });

  assert.equal(built.priced, true);
  assert.equal(built.sku, 'B30-BLK');
  assert.equal(built.unitsInStock, 4);
  assert.equal(built.sold30d, 412);
  assert.equal(built.belowRrpPercent, 80); // £50 against a £249 RRP
  assert.equal(built.best.netPence, 9999 - 5000 - 420);
});

test('unit counts come from the size run, so the two cannot disagree', () => {
  const product = { id: 1, name: 'Tee', category: 'Shirts', price: '£49.99', images: [] };
  const built = buildProduct(product, {
    pricing: { member_price_pence: 1500, stock_state: 'in_stock' },
    sizes: [{ size_label: 'S', units: 2 }, { size_label: 'M', units: 7 }, { size_label: 'L', units: 0 }],
    platforms: PLATFORMS,
    postagePence: POSTAGE,
  });
  assert.equal(built.unitsInStock, 9);
  assert.equal(built.sizes.length, 3);
});

test('a product with no member price is unpriced rather than free', () => {
  const built = buildProduct(
    { id: 99, name: 'Unpriced', category: 'Jackets', price: '£119.99', images: [] },
    { platforms: PLATFORMS, postagePence: POSTAGE },
  );
  assert.equal(built.priced, false);
  assert.equal(built.costPence, null);
  assert.deepEqual(built.platforms, []);
});

test('an explicit resale override beats the retail price in the feed', () => {
  const built = buildProduct(
    { id: 1, name: 'B22', brand: 'B22', category: 'Footwear,B22', price: '£129.99', images: [] },
    {
      pricing: { member_price_pence: 6000, resale_price_pence: 15000, stock_state: 'in_stock' },
      platforms: PLATFORMS,
      postagePence: POSTAGE,
    },
  );
  assert.equal(built.resalePence, 15000);
  assert.equal(built.platforms.find((p) => p.slug === 'vinted').netPence, 15000 - 6000 - 420);
});

test('passwords round-trip, and a wrong one is rejected', async () => {
  const stored = await hashPassword('stock-margin-depop-4821');

  assert.match(stored, /^pbkdf2\$\d+\$/);
  assert.ok(!stored.includes('stock-margin-depop-4821')); // never stored in the clear
  assert.equal(await verifyPassword('stock-margin-depop-4821', stored), true);
  assert.equal(await verifyPassword('stock-margin-depop-4822', stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

test('the same password hashes differently each time (salted)', async () => {
  const a = await hashPassword('same-password-here');
  const b = await hashPassword('same-password-here');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('same-password-here', a), true);
  assert.equal(await verifyPassword('same-password-here', b), true);
});

test('a malformed stored hash never verifies', async () => {
  for (const bad of ['', 'plaintext', 'pbkdf2$10$salt', 'md5$1$a$b', 'pbkdf2$1$a$b']) {
    assert.equal(await verifyPassword('anything', bad), false);
  }
});
