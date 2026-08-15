#!/usr/bin/env node
// ESNTLS STOCKROOM — local preview server.
//
//   node scripts/stockroom-dev.mjs      then open http://localhost:8801/stockroom
//
// Serves the real stockroom.html against a stand-in API so the site can be
// clicked through without Cloudflare, D1, or any credentials. Sample member
// prices are 45% of retail, sizes and stock are generated, and any email and
// password signs in. Nothing here runs in production - the real API is
// worker/stockroom.js.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProduct } from '../worker/stockroom.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PLATFORMS = [
  {slug:'depop',name:'Depop',fee_percent:0,fee_fixed_pence:0,pay_percent:0,pay_fixed_pence:0,ship_pence:0,note:'No seller fees in the UK since 2024.'},
  {slug:'ebay',name:'eBay',fee_percent:12.8,fee_fixed_pence:30,pay_percent:0,pay_fixed_pence:0,ship_pence:0,note:'Final value fee + 30p.'},
  {slug:'vinted',name:'Vinted',fee_percent:0,fee_fixed_pence:0,pay_percent:0,pay_fixed_pence:0,ship_pence:0,note:'No seller fees.'},
];
const POSTAGE = 420;
const FOOT = ['UK 6','UK 7','UK 8','UK 9','UK 10','UK 11'];
const CLOTH = ['S','M','L','XL'];

const feed = JSON.parse(fs.readFileSync(path.join(ROOT,'products.json'),'utf8'));
const items = feed.map((p,i) => {
  const retail = parseFloat(String(p.price).replace(/[^0-9.]/g,'')) || 0;
  if (!retail) return null;
  const isFoot = /Footwear|B22|B30/.test(p.category||'');
  const labels = isFoot ? FOOT : CLOTH;
  const sizes = labels.map((label,j) => ({ size_label: label, units: (i+j)%5===0 ? 0 : ((i*3+j)%9)+1 }));
  return buildProduct(p, {
    pricing: { member_price_pence: Math.round(retail*100*0.45/100)*100,
               stock_state: i%13===0?'out':'in_stock', lane: i%3===0?'next_day':'china' },
    meta: { sku:'ESN-'+String(p.id).padStart(3,'0'), rrp_pence: Math.round(retail*100*1.9),
            sold_30d: i%4===0 ? 120+i*11 : null, ships_from:'Hackney',
            deadstock: i%3===0?1:0, verified:1, moq:1, bulk_from:6 },
    sizes: i%13===0 ? sizes.map(s=>({...s,units:0})) : sizes,
    platforms: PLATFORMS, postagePence: POSTAGE,
  });
}).filter(x => x && x.priced);

const byMargin = items.slice().sort((a,b)=>{
  const ao=a.unitsInStock===0?1:0, bo=b.unitsInStock===0?1:0;
  if(ao!==bo) return ao-bo;
  return (b.platforms[0]?.netPence||0)-(a.platforms[0]?.netPence||0);
});
const cats = [...new Set(items.flatMap(i=>i.categories))].sort();
let authed = false;

const PORT = Number(process.env.PORT) || 8801;
const send = (res,code,obj) => { res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(obj)); };
const member = { email:'sam@example.com', displayName:'Sam', tier:'tier 2' };

http.createServer(async (req,res)=>{
  const u = new URL(req.url,'http://x');
  const p = u.pathname;
  if (p === '/api/stockroom/login'){ authed=true; return send(res,200,{member}); }
  if (p === '/api/stockroom/logout'){ authed=false; return send(res,200,{ok:true}); }
  if (p.startsWith('/api/stockroom/')){
    if(!authed) return send(res,401,{error:'Not signed in'});
    if(p==='/api/stockroom/me') return send(res,200,{member});
    if(p==='/api/stockroom/home') return send(res,200,{
      member, stats:{spend30dPence:0,realisedPence:0,tier:'tier 2'}, skuCount:items.length,
      drop:{eyebrow:'THURSDAY DROP · 42 PAIRS',headline:'Designer runners,\nunder half retail',
            ctaLabel:'Shop the drop',imageUrl:items[0].images[0],category:null,
            endsAt:new Date(Date.now()+8049000).toISOString(),
            avgNetPence: Math.round(byMargin.reduce((n,i)=>n+(i.platforms[0]?.netPence||0),0)/byMargin.length)},
      categories:cats, highestMargin:byMargin.slice(0,8),
      restocks:byMargin.slice(2,4), bulkLots:[
        {id:1,eyebrow:'MIXED LOT',title:'20 pairs mixed',units:20,pricePence:99000,unitPricePence:4950,imageUrl:null},
        {id:2,eyebrow:'RUNNERS',title:'12 pairs B30',units:12,pricePence:54000,unitPricePence:4500,imageUrl:null}],
      platforms:PLATFORMS.map(x=>({slug:x.slug,name:x.name})),
      settings:{postagePence:POSTAGE,holdMinutes:10}});
    if(p==='/api/stockroom/browse'){
      const q=(u.searchParams.get('q')||'').toLowerCase(), cat=u.searchParams.get('category')||'';
      const inStock=u.searchParams.get('inStock')==='1';
      let list=items.filter(i=>(!q||`${i.name} ${i.brand}`.toLowerCase().includes(q))&&(!cat||i.categories.includes(cat))&&(!inStock||i.unitsInStock>0));
      list=list.slice().sort((a,b)=>{const ao=a.unitsInStock===0?1:0,bo=b.unitsInStock===0?1:0;
        if(ao!==bo)return ao-bo;
        return u.searchParams.get('sort')==='cost'?a.costPence-b.costPence:(b.platforms[0]?.netPence||0)-(a.platforms[0]?.netPence||0);});
      return send(res,200,{member,categories:cats,items:list,resultCount:list.length,unpricedCount:0,settings:{postagePence:POSTAGE}});
    }
    if(p.startsWith('/api/stockroom/product/')){
      const id=Number(p.split('/').pop());
      const item=items.find(i=>i.id===id);
      if(!item) return send(res,404,{error:'Not found'});
      return send(res,200,{member,item,
        related:byMargin.filter(i=>i.id!==id&&i.categories.some(c=>item.categories.includes(c))).slice(0,6),
        platforms:PLATFORMS.map(x=>({slug:x.slug,name:x.name,feePercent:x.fee_percent,feeFixedPence:x.fee_fixed_pence,
          payPercent:x.pay_percent,payFixedPence:x.pay_fixed_pence,shipPence:x.ship_pence,note:x.note,
          fit:x.slug==='ebay'?1:(x.slug==='depop'?0.9:0.55)})),
        settings:{postagePence:POSTAGE,holdMinutes:10}});
    }
    if(p==='/api/stockroom/hold') return send(res,200,{ok:true,expiresAt:new Date(Date.now()+600000).toISOString(),holdMinutes:10});
    if(p==='/api/stockroom/order') return send(res,200,{ok:true,reference:'ESN-4K2P9X',
      totals:{subtotal:96200,discount:2886,discountPercent:3,shipping:499,total:93813,projectedNet:24160},paymentState:'unpaid'});
    return send(res,200,{ok:true});
  }
  if (p.startsWith('/stockroom')||p==='/'){ res.writeHead(200,{'Content-Type':'text/html'}); return res.end(fs.readFileSync(path.join(ROOT,'stockroom.html'))); }
  res.writeHead(404); res.end('nope');
}).listen(PORT, ()=>console.log(`ESNTLS Stockroom preview: http://localhost:${PORT}/stockroom  (${items.length} products, any login works)`));
