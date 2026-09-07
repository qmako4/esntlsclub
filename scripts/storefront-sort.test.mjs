import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const helpers=html.slice(html.indexOf('function productSourceId'),html.indexOf('function getStockEntryForProduct'));
const priceParser=html.slice(html.indexOf('function parsePrice'),html.indexOf('const PRICE_RANGES'));
const ctx=vm.createContext({});
vm.runInContext(helpers+'\n'+priceParser,ctx);
const ids=items=>Array.from(items,p=>p.id);
test('all storefront inline scripts parse',()=>{
  for(const [,script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script);
});
test('Shop All sorts prices numerically, preserving the source order on ties',()=>{
  const items=[{id:1,price:'£129.99'},{id:2,price:'£9.99'},{id:3,price:'£29.99'},{id:4,price:'£9.99'},{id:5,price:'£1,000.00'}];
  assert.deepEqual(ids(ctx.sortForCollection(items,'All')),[2,4,3,1,5]);
  assert.deepEqual(ids(items),[1,2,3,4,5]);
});
test('missing prices and sold-out products appear last',()=>{
  const items=[{id:1,price:'Out of stock'},{id:2,price:''},{id:3,price:'£34.99'},{id:4,price:'out of stock'},{id:5,price:0},{id:6,price:'..'}];
  assert.deepEqual(ids(ctx.sortForCollection(items,'All')),[5,3,1,2,4,6]);
});
test('New Items stays newest first and other collections keep their existing order',()=>{
  const items=[{id:1,price:'£50'},{id:2,price:'Out of stock'},{id:3,price:'£10'}];
  assert.deepEqual(ids(ctx.sortForCollection(items,'New Items')),[3,2,1]);
  assert.deepEqual(ids(ctx.sortForCollection(items,'Footwear')),[1,3,2]);
});
test('sorting uses active sale prices and restores the regular price after expiry',()=>{
  const sale={id:1,price:'£100',timedSale:{active:true,salePrice:'£10',regularPrice:'£100',endsAt:new Date(Date.now()+86400000).toISOString()}};
  const regular={id:2,price:'£50'};
  assert.deepEqual(ids(ctx.sortForCollection([ctx.effectiveProductPrice(sale),regular],'All')),[1,2]);
  sale.timedSale.endsAt='2000-01-01';
  assert.deepEqual(ids(ctx.sortForCollection([ctx.effectiveProductPrice(sale),regular],'All')),[2,1]);
});
test('price filtering retains cheapest-first order',()=>{
  const items=[{id:1,price:'£49.99'},{id:2,price:'£129.99'},{id:3,price:'£9.99'}];
  const filtered=items.filter(p=>ctx.parsePrice(p.price)<50);
  assert.deepEqual(ids(ctx.sortForCollection(filtered,'All')),[3,1]);
});
test('empty and single-item collections work',()=>{
  assert.deepEqual(ids(ctx.sortForCollection([],'All')),[]);
  assert.deepEqual(ids(ctx.sortForCollection([{id:1,price:'£29.99'}],'All')),[1]);
});
