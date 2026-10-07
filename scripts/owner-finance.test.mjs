import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';

const source = readFileSync(new URL('../worker/r2-worker.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('function supplierFinanceMoney('), source.indexOf('async function handleSupplierPortalApi('));
const pageCode = source.slice(source.indexOf('function ownerFinanceHtmlResponse('), source.indexOf('__name(ownerFinanceHtmlResponse'));
const orders = [
  {key:'before',orderName:'#1233',orderDate:'2026-09-22T19:05:17Z',salesTotal:1000,items:[{itemKey:'1',sourceProductId:'1',productName:'B30',quantity:1}]},
  {key:'after',orderName:'#1234',orderDate:'2026-09-23T19:05:17Z',salesTotal:2644.68,items:[{itemKey:'2',sourceProductId:'2',productName:'Known item',quantity:1}]}
];
function harness(initial = {}) {
  let state = structuredClone(initial), writes = 0;
  const env = {BUCKET:{
    async get(){return {text:async()=>JSON.stringify(state)}},
    async put(key,value){state=JSON.parse(value);writes++}
  }};
  const ctx=vm.createContext({
    Response,Request,crypto:webcrypto,JSON,Date,Set,Map,Number,Math,Object,
    __name(){},SUPPLIER_FINANCE_STATE_KEY:'finance.json',JSON_CONTENT_TYPE:'application/json',cors:{},
    safeMessageLine:v=>String(v??'').trim(),
    slugify:v=>String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-'),
    uniqueList:v=>[...new Set(v)],
    listSupplierPortalOrders:async()=>orders,
    json:(data,status=200)=>new Response(JSON.stringify(data),{status}),
  });
  vm.runInContext(code+'\n'+pageCode,ctx);
  return {ctx,env,state:()=>state,writes:()=>writes,
    snapshot:s=>ctx.supplierFinanceSnapshot(orders,s),
    async update(body){
      const response=await ctx.handleSupplierFinanceApi(new Request('https://test/supplier-finance-api/update',{method:'POST',body:JSON.stringify(body)}),env,['supplier-finance-api','update']);
      return {status:response.status,...await response.json()};
    }};
}
const existing={costs:{'2':1331},supplierPaid:1000,ownerPaid:500};

test('existing payments reduce balances, not profit; cutoff is unchanged',()=>{
  const f=harness().snapshot(existing);
  assert.equal(f.supplierRemaining,331);
  assert.equal(f.yourShareRemaining,156.84);
  assert.equal(f.brotherShareRemaining,656.84);
  assert.equal(f.estimatedProfit,1313.68);
  assert.equal(f.outstandingOrderCount,1);
  assert.equal(f.salesTotal,2644.68);
});
test('all paid totals persist, repeated saves do not double-count',async()=>{
  const h=harness(existing);
  const body={action:'set-payments',supplierPaid:'1100.00',ownerPaid:'600',brotherPaid:'100'};
  const result=await h.update(body);
  assert.equal(result.status,200);
  assert.equal(result.finance.supplierRemaining,231);
  assert.equal(result.finance.yourShareRemaining,56.84);
  assert.equal(result.finance.brotherShareRemaining,556.84);
  await h.update(body);
  assert.equal(h.state().paymentHistory.length,1);
  assert.equal(h.state().paymentHistory[0].previous.supplierPaid,1000);
  assert.equal(h.state().costs['2'],1331);
});
test('correcting or omitting a payment total preserves the other recipients',async()=>{
  const h=harness({...existing,brotherPaid:50});
  const result=await h.update({action:'set-payments',ownerPaid:450});
  assert.equal(result.finance.yourShareRemaining,206.84);
  assert.equal(h.state().supplierPaid,1000);
  assert.equal(h.state().brotherPaid,50);
});
test('invalid payment values never write saved data',async()=>{
  for(const value of ['', ' ', null, false, [], {}, -1, 'NaN', 'Infinity', 1.001, 1e12]){
    const h=harness(existing);
    assert.equal((await h.update({action:'set-payments',supplierPaid:value})).status,400,String(value));
    assert.equal(h.writes(),0);
  }
  assert.equal((await harness(existing).update({action:'set-payments'})).status,400);
});
test('overpayment is retained as credit and odd pennies reconcile',()=>{
  const h=harness();
  let f=h.snapshot({...existing,supplierPaid:2000,ownerPaid:900});
  assert.equal(f.supplierRemaining,-669);
  assert.equal(f.yourShareRemaining,-243.16);
  f=h.snapshot({...existing,otherCosts:0.01});
  assert.equal(Math.round((f.yourShare+f.brotherShare)*100),Math.round(f.estimatedProfit*100));
});
test('other costs reduce both shares without losing payments',async()=>{
  const h=harness({...existing,brotherPaid:50});
  const result=await h.update({action:'set-other-costs',otherCosts:100});
  assert.equal(result.finance.yourShareRemaining,106.84);
  assert.equal(result.finance.brotherShareRemaining,556.84);
  assert.equal(result.finance.supplierRemaining,331);
});
test('old saved schema migrates safely and malformed state fails closed',async()=>{
  const h=harness(existing);
  const state=await h.ctx.readSupplierFinanceState(h.env);
  assert.equal(state.brotherPaid,0);
  assert.equal(state.paymentHistory.length,0);
  h.env.BUCKET.get=async()=>({text:async()=>'{broken'});
  await assert.rejects(()=>h.ctx.readSupplierFinanceState(h.env),/No balances have been changed/);
  assert.equal(h.writes(),0);
});
test('legacy close and undo retain payment values',async()=>{
  const h=harness({...existing,brotherPaid:50});
  await h.update({action:'settle'});
  assert.equal(h.state().brotherPaid,0);
  const result=await h.update({action:'undo-last-settlement'});
  assert.equal(result.finance.supplierPaid,1000);
  assert.equal(result.finance.yourSharePaid,500);
  assert.equal(result.finance.brotherSharePaid,50);
});
test('page and inline JavaScript parse, with no legacy reset button',async()=>{
  const html=await harness().ctx.ownerFinanceHtmlResponse().text();
  for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
  assert.match(html,/Save paid totals/);
  assert.doesNotMatch(html,/MutationObserver|data-finance-settle/);
});
test('dashboard form saves totals and retains unsaved inputs on a failed request',async()=>{
  const h=harness(existing);
  const html=await h.ctx.ownerFinanceHtmlResponse().text();
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  const nodes=new Map(),previews=new Map(),events={};
  let rendered='',fail=false;
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',disabled:false,className:'',addEventListener(type,fn){events[id+':'+type]=fn}});
    return nodes.get(id);
  };
  const panel=node('ownerFinancePanel');
  Object.defineProperty(panel,'innerHTML',{get:()=>rendered,set:value=>{
    rendered=value;
    for(const match of value.matchAll(/<input id="([^"]+)"[^>]* value="([^"]*)"/g))node(match[1]).value=match[2];
  }});
  panel.querySelectorAll=()=>[];
  panel.querySelector=selector=>{if(!previews.has(selector))previews.set(selector,{textContent:''});return previews.get(selector)};
  const ctx=vm.createContext({Intl,Number,Math,Object,Array,String,JSON,console,
    document:{getElementById:node,querySelectorAll:()=>[node('refreshBtn')]},
    window:{addEventListener(){}},confirm:()=>true,
    fetch:async(url,options)=>{
      if(fail)return {ok:false,json:async()=>({error:'Temporary save failure'})};
      const f=options.method==='POST'?(await h.update(JSON.parse(options.body))).finance:h.snapshot(await h.ctx.readSupplierFinanceState(h.env));
      return {ok:true,json:async()=>({finance:f})};
    }
  });
  vm.runInContext(script,ctx);
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  await tick();
  assert.match(rendered,/£331.00/);
  assert.equal(node('supplierPaid').value,'1000.00');
  assert.equal(node('ownerPaid').value,'500.00');
  const button={textContent:'Save paid totals',disabled:false};
  const submit=()=>events['ownerFinancePanel:submit']({preventDefault(){},target:{id:'paymentForm',reportValidity:()=>true,querySelector:()=>button}});
  node('supplierPaid').value='1100';node('ownerPaid').value='600';node('brotherPaid').value='100';
  submit();await tick();
  assert.match(rendered,/£231.00/);
  assert.match(rendered,/£556.84/);
  assert.equal(h.state().paymentHistory.length,1);
  fail=true;node('ownerPaid').value='650';
  submit();await tick();
  assert.equal(node('ownerPaid').value,'650');
  assert.equal(node('pageStatus').textContent,'Temporary save failure');
  assert.equal(button.textContent,'Save paid totals');
});
test('mobile browser integration (opt in with FINANCE_BROWSER_TEST=1)',{skip:process.env.FINANCE_BROWSER_TEST!=='1'},async()=>{
  const require=createRequire(import.meta.url);
  const {chromium}=require('playwright');
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const h=harness(existing);
    let fail=false;
    await page.route('https://finance.test/**',async route=>{
      const request=route.request();
      if(request.url().includes('/supplier-finance-api/')){
        if(fail){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Temporary save failure'})});return}
        let f;
        if(request.method()==='POST')f=(await h.update(request.postDataJSON())).finance;
        else f=h.snapshot(await h.ctx.readSupplierFinanceState(h.env));
        await route.fulfill({contentType:'application/json',body:JSON.stringify({finance:f})});
      }else await route.fulfill({contentType:'text/html',body:await h.ctx.ownerFinanceHtmlResponse().text()});
    });
    await page.goto('https://finance.test/owner-finance');
    await page.getByRole('button',{name:'Save paid totals'}).waitFor();
    assert.equal(await page.locator('.card .amount').nth(0).textContent(),'£331.00');
    assert.equal(await page.locator('.card .amount').nth(1).textContent(),'£156.84');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#supplierPaid').fill('1100');
    await page.locator('#ownerPaid').fill('600');
    await page.locator('#brotherPaid').fill('100');
    await page.getByRole('button',{name:'Save paid totals'}).click();
    await page.getByText('Saved. Remaining balances are up to date.').waitFor();
    assert.equal(await page.locator('.card .amount').nth(0).textContent(),'£231.00');
    assert.equal(await page.locator('.card .amount').nth(2).textContent(),'£556.84');
    await page.getByText('Supplier costs',{exact:true}).click();
    await page.locator('#costSearch').fill('does-not-exist');
    assert.equal(await page.locator('.cost-row:visible').count(),0);
    fail=true;
    await page.locator('#ownerPaid').fill('650');
    await page.getByRole('button',{name:'Save paid totals'}).click();
    await page.getByText('Temporary save failure').waitFor();
    assert.equal(await page.locator('#ownerPaid').inputValue(),'650');
    assert.equal(await page.getByRole('button',{name:'Save paid totals'}).isEnabled(),true);
  }finally{await browser.close()}
});
