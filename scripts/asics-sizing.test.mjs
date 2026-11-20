import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const productHtml = readFileSync(new URL('../product.html', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = productHtml.indexOf('function asicsFlatText(');
const end = productHtml.indexOf('function normalizeReviewKey(');
const context = vm.createContext({});
vm.runInContext(productHtml.slice(start, end), context);

const notice = "ASICS fit small: we recommend sizing up one (if you're normally a UK 8, choose UK 9).";
const gel = (name, id) => ({id, name, brand: 'Asics', category: 'Asics,Footwear', sizes: ['UK 8', 'UK 9']});

test('product page scripts parse', () => {
  for (const [, script] of productHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script);
});

test('live Gel Runners are ASICS and other catalogue brands are not', () => {
  for (const [id, name] of [
    [38, 'The Gel Runners - Metropolis Grey'],
    [42, 'The Gel Runners - Graphite Grey'],
    [43, 'The Gel Runners - Monaco Blue'],
    [44, 'The Gel Runners - Light Blue'],
    [45, 'The Gel Runners - Light Orange'],
    [56, 'The Gel Runners - Pink']
  ]) {
    assert.equal(context.isAsicsProduct(gel(name, id)), true, name);
    assert.match(context.asicsSizeNoticeHTML(gel(name, id)), new RegExp(notice.replace(/[().]/g, '\\$&')));
  }

  for (const item of [
    {name: 'B22 White', brand: 'B22', category: 'Footwear,Summer,B22'},
    {name: 'B30 Black and White', brand: 'B30', category: 'Footwear,B30'},
    {name: 'On Loewe Running Sneakers', brand: 'ON Running', category: 'Footwear'},
    {name: 'Classic 5 Neon Sneakers', brand: 'Nike', category: 'Footwear,Nike'},
    {name: 'Adizero Evo Sl Black White Stripe', brand: 'Other', category: 'Footwear'},
    {name: 'MM Gats', brand: 'ESNTLS Club', category: 'Footwear'},
    {name: 'Pressure Slides', brand: 'Other', category: 'Sandals,Footwear'},
    {name: 'Angel Hoodie', brand: 'Other', category: 'Hoodies'},
    {name: 'Gelato Tee', brand: 'Other', category: 'Shirts'},
    {name: 'White Runner', brand: 'ESNTLS Club', category: 'Footwear', description: 'Sizing: We recommend sizing up one size.'}
  ]) {
    assert.equal(context.isAsicsProduct(item), false, item.name);
    assert.equal(context.asicsSizeNoticeHTML(item), '');
  }
});

test('untagged ASICS models and Asics tags are included', () => {
  const matches = [
    {name: 'Gel-Kayano 14', brand: 'ESNTLS Club', category: 'Footwear'},
    {name: 'ASICS Gel-Nimbus 26', brand: 'Other'},
    {name: 'Onitsuka Tiger Mexico 66', brand: 'Other'},
    {name: 'Kahana 8', brand: 'Other', category: 'Footwear'},
    {name: 'Gel-1130 White', brand: 'Other'},
    {name: 'GT-2160', brand: 'Other'},
    {name: 'White Runner', brand: 'ESNTLS Club', category: 'Footwear', tags: 'ESNTLS-MIGRATED, Asics, Footwear'},
    {name: 'White Runner', brand: 'ESNTLS Club', tags: ['Asics']},
    {name: 'Daily Runner', brand: 'ESNTLS Club', shopifyPlaceholder: {sourceTitle: 'Gel Runner Graphite', tags: ['Footwear']}},
    {name: 'Daily Runner', brand: 'Onitsuka', category: 'Footwear'}
  ];
  for (const item of matches) assert.equal(context.isAsicsProduct(item), true, JSON.stringify(item));
});

test('product copy does not repeat the Shopify sizing sentence', () => {
  const curated = context.productCopy({category: 'Footwear', name: 'B30 Black'});
  assert.match(curated, /curated footwear piece/);
  assert.doesNotMatch(curated, /sizing up one size/i);

  const onlyLine = context.productCopy({
    category: 'Asics,Footwear',
    name: 'The Gel Runners - Graphite Grey',
    description: '<p>Sizing: We recommend sizing up one size.</p>'
  });
  assert.equal(onlyLine, curated.replace('footwear', 'asics'));
  assert.doesNotMatch(onlyLine, /sizing up one size/i);

  const withMore = context.productCopy({
    category: 'Asics',
    description: '<p>Sizing: We recommend sizing up one size.</p><p>Lightweight daily runner.</p>'
  });
  assert.equal(withMore, 'Lightweight daily runner.');
  assert.doesNotMatch(context.asicsSizeNoticeHTML({brand: 'B30', name: 'B30 Black'}), /ASICS/);
  assert.match(context.asicsSizeNoticeHTML({brand: 'Asics', name: 'The Gel Runners - Pink'}), /asics-size-notice/);
});

test('homepage size guide tells shoppers to size up for ASICS', () => {
  assert.match(indexHtml, /How do I know my size\?/);
  assert.match(indexHtml, new RegExp(notice.replace(/[().]/g, '\\$&')));
  assert.match(indexHtml, /Other shoes run true to size/);
});
