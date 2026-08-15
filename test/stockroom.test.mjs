import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProduct, hashPassword, priceToPence, profitFor, verifyPassword } from '../worker/stockroom.js';

const PLATFORMS = [
  { slug: 'depop', name: 'Depop', fee_percent: 0, fee_fixed_pence: 0, pay_percent: 2.9, pay_fixed_pence: 30, ship_pence: 0, note: '' },
  { slug: 'ebay', name: 'eBay', fee_percent: 0, fee_fixed_pence: 0, pay_percent: 0, pay_fixed_pence: 0, ship_pence: 0, note: '' },
  { slug: 'vinted', name: 'Vinted', fee_percent: 0, fee_fixed_pence: 0, pay_percent: 0, pay_fixed_pence: 0, ship_pence: 0, note: '' },
];

test('priceToPence reads the price strings used in products.json', () => {
  assert.equal(priceToPence('£129.99'), 12999);
  assert.equal(priceToPence('£99.99'), 9999);
  assert.equal(priceToPence(49.99), 4999);
  assert.equal(priceToPence('Out of stock'), null);
  assert.equal(priceToPence(''), null);
});

test('profit is resale minus fees minus what the member paid', () => {
  // B30: member pays £50, proven resale £99.99.
  const depop = profitFor(PLATFORMS[0], 5000, 9999);
  assert.equal(depop.paymentFeePence, 320); // 2.9% of £99.99, plus 30p
  assert.equal(depop.netPence, 9679);
  assert.equal(depop.profitPence, 4679);

  const vinted = profitFor(PLATFORMS[2], 5000, 9999);
  assert.equal(vinted.profitPence, 4999); // no seller fees
  assert.equal(Math.round(vinted.roiPercent), 100);
});

test('a product that cannot be sold at a profit reports a negative number', () => {
  const result = profitFor(PLATFORMS[0], 12000, 9999);
  assert.ok(result.profitPence < 0);
});

test('footwear is steered to eBay even though Vinted ties on profit', () => {
  const product = { id: 30, name: 'B30 Runner', brand: 'B30', category: 'Footwear,B30', price: '£99.99', images: [] };
  const built = buildProduct(product, { member_price_pence: 5000, stock_state: 'in_stock' }, PLATFORMS);

  assert.equal(built.priced, true);
  assert.equal(built.best.slug, 'ebay');
  assert.equal(built.best.profitPence, 4999);

  // eBay and Vinted both net £49.99 because neither charges the seller. Vinted
  // still ranks last for footwear: the tie is broken by which platform actually
  // shifts trainers, not by the fee table.
  const vinted = built.platforms.find((platform) => platform.slug === 'vinted');
  assert.equal(vinted.profitPence, 4999);
  assert.equal(built.platforms.indexOf(vinted), 2);
});

test('shirts are steered to Depop', () => {
  const product = { id: 8, name: 'Casablanca Tee', brand: 'Other', category: 'Shirts', price: '£49.99', images: [] };
  const built = buildProduct(product, { member_price_pence: 1500, stock_state: 'in_stock' }, PLATFORMS);
  assert.equal(built.best.slug, 'depop');
});

test('a product with no member price is marked unpriced rather than free', () => {
  const product = { id: 99, name: 'Unpriced', category: 'Jackets', price: '£119.99', images: [] };
  const built = buildProduct(product, undefined, PLATFORMS);

  assert.equal(built.priced, false);
  assert.equal(built.memberPricePence, null);
  assert.deepEqual(built.platforms, []);
});

test('an explicit resale override beats the retail price in the feed', () => {
  const product = { id: 1, name: 'B22', brand: 'B22', category: 'Footwear,B22', price: '£129.99', images: [] };
  const built = buildProduct(
    product,
    { member_price_pence: 6000, resale_price_pence: 15000, stock_state: 'in_stock' },
    PLATFORMS,
  );

  assert.equal(built.resalePricePence, 15000);
  assert.equal(built.platforms.find((p) => p.slug === 'vinted').profitPence, 9000);
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
