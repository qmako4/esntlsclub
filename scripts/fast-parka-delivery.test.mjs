import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const product = readFileSync(new URL("../product.html", import.meta.url), "utf8");
const worker = readFileSync(new URL("../worker/r2-worker.js", import.meta.url), "utf8");
const useFunction = (text, name, following) =>
  text.slice(text.indexOf("function " + name + "("), text.indexOf(following, text.indexOf("function " + name + "(")));

test("UK dispatch skips Sunday, takes one day after dispatch, and respects the UK date", () => {
  const context = vm.createContext({ Date, Intl });
  vm.runInContext(useFunction(product, "fastParkaDates", "function selectedFastParka"), context);
  const expected = [
    ["2026-11-14T12:00:00Z", "Monday 16 Nov", "Tuesday 17 Nov"],
    ["2026-11-16T12:00:00Z", "Tuesday 17 Nov", "Wednesday 18 Nov"],
    ["2026-07-10T23:30:00Z", "Monday 13 Jul", "Tuesday 14 Jul"]
  ];
  for (const [date, dispatch, arrival] of expected) {
    const eta = context.fastParkaDates(new Date(date));
    assert.equal(eta.dispatched, dispatch);
    assert.equal(eta.expected, arrival);
  }
  for (const [, script] of product.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script);
});

test("fast lines use exact SKU and successful shipped quantity instead of ordered quantity", () => {
  const context = vm.createContext({
    shopifyLineItemSku: (line) => line.sku,
    normalizeShopifyNumericId: (id) => String(id || "").split("/").at(-1)
  });
  vm.runInContext(useFunction(worker, "fastParkaSourceId", "function isSupplierWhatsappExcludedItem"), context);
  const line = { id: "gid://shopify/LineItem/1234", sku: "ESNTLS-021-FAST-XL", quantity: 2 };
  assert.equal(context.fastParkaSourceId(line), "21");
  assert.equal(context.fastParkaSourceId({ sku: "ESNTLS-021-XL" }), "");
  const order = { fulfillments: [
    { status: "SUCCESS", line_items: [{ id: 1234, quantity: 1 }, { id: 9876, quantity: 2 }] },
    { status: "CANCELLED", line_items: [{ id: 1234, quantity: 1 }] }
  ] };
  assert.equal(context.fastParkaShippedQuantity(order, line), 1);
});

test("only standard order lines can carry a dispatch address", () => {
  const context = vm.createContext({ supplierPortalPublicItem: (item) => item });
  vm.runInContext(useFunction(worker, "supplierPortalPublicOrder", "__name(supplierPortalPublicOrder"), context);
  const fast = { fastDelivery: true };
  const address = ["customer", "private address"];
  const mixed = context.supplierPortalPublicOrder({ items: [fast, { fastDelivery: false }], shipping: { address1: address[1] }, addressLines: address });
  assert.equal(mixed.shipping.address1, undefined);
  assert.equal(mixed.addressLines.length, 0);
  assert.equal(mixed.items[0].dispatchAddressLines, undefined);
  assert.deepEqual(mixed.items[1].dispatchAddressLines, address);
  assert.equal(context.supplierPortalPublicOrder({ items: [fast], addressLines: address }).addressLines.length, 0);
});

test("supplier finance charges each shipped unit once across settlements", () => {
  const context = vm.createContext({
    safeMessageLine: (value) => String(value || ""),
    supplierFinanceMoney: (value) => Math.round((Number(value) || 0) * 100) / 100,
    supplierFinanceCostKey: () => "21",
    supplierFinanceDefaultUnitCost: () => null,
    supplierFinanceItemKey: () => "order::line",
    supplierFinanceOrderAfterCutoff: () => true,
    SUPPLIER_FINANCE_CUTOFF_ORDER_NAME: "#1233",
    SUPPLIER_FINANCE_CUTOFF_ORDER_DATE: "2026-09-22"
  });
  vm.runInContext(useFunction(worker, "supplierFinanceSnapshot", "__name(supplierFinanceSnapshot"), context);
  const item = { fastDelivery: true, quantity: 2, shippedQuantity: 0, netSales: 259.98 };
  const orders = [{ key: "order", salesTotal: 259.98, items: [item] }];
  const finance = (keys = []) => context.supplierFinanceSnapshot(orders, { costs: { "21": 70 }, settledItemKeys: keys });
  assert.equal(finance().supplierOwed, 0);
  item.shippedQuantity = 1;
  assert.equal(finance().supplierOwed, 70);
  assert.equal(finance().salesTotal, 129.99);
  assert.equal(finance(["order::line::unit-1"]).supplierOwed, 0);
  item.shippedQuantity = 2;
  assert.equal(finance(["order::line::unit-1"]).supplierOwed, 70);
  assert.equal(finance(["order::line::unit-1", "order::line::unit-2"]).supplierOwed, 0);
});
