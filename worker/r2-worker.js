// R2 admin Worker for esntlsclub
// Deploy via Cloudflare Dashboard → Workers & Pages → Create Worker → paste this code.
//
// Required bindings (set in the Worker's Settings → Variables tab):
//   1. R2 Bucket binding:
//        Variable name: BUCKET
//        Bucket:        esntls-images
//   2. Environment variables (encrypted):
//        ADMIN_SECRET   any random string (used by admin.html to authenticate)
//        WIX_API_TOKEN  Wix API key with WIX_STORES.PRODUCT_READ scope (for /wix-sync)
//        WIX_SITE_ID    7e8c1aa8-aaa7-42ef-8c93-a5c2524c6155 (for /wix-sync)
//
// Endpoints (all require header  X-Admin-Secret: <ADMIN_SECRET>):
//   GET    /list             → { objects: [{key, url, size, uploaded}, ...] }
//   PUT    /upload/<key>     → request body = file bytes, Content-Type = file mime
//   DELETE /delete/<key>     → removes <key> from the bucket
//   POST   /wix-sync         → refreshes wix-products.json on R2 from the Wix Stores API
//   POST   /wix-orders-sync  → refreshes wix-orders.json on R2 from the Wix eCom Orders API
//                              (last 90 days, trimmed to fields the Orders admin tab needs)
//   POST   /wix-create-product → creates a minimal Wix placeholder product and returns its URL.
//                                Body: { name: string, priceAmount: string, comparePriceAmount?: string }

const PUBLIC_BASE = 'https://pub-43c9cf7fd2904289881c21839332521c.r2.dev/';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
  'Access-Control-Max-Age': '86400'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (req.headers.get('X-Admin-Secret') !== env.ADMIN_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && parts[0] === 'list') {
      const out = [];
      let cursor;
      do {
        const r = await env.BUCKET.list({ limit: 1000, cursor });
        out.push(...r.objects.map(o => ({
          key: o.key,
          url: PUBLIC_BASE + o.key,
          size: o.size,
          uploaded: o.uploaded
        })));
        cursor = r.truncated ? r.cursor : null;
      } while (cursor);
      return json({ objects: out });
    }

    if (req.method === 'PUT' && parts[0] === 'upload') {
      const key = parts.slice(1).map(decodeURIComponent).join('/');
      if (!key) return json({ error: 'Missing key' }, 400);
      await env.BUCKET.put(key, req.body, {
        httpMetadata: { contentType: req.headers.get('Content-Type') || 'application/octet-stream' }
      });
      return json({ ok: true, key, url: PUBLIC_BASE + key });
    }

    if (req.method === 'DELETE' && parts[0] === 'delete') {
      const key = parts.slice(1).map(decodeURIComponent).join('/');
      if (!key) return json({ error: 'Missing key' }, 400);
      await env.BUCKET.delete(key);
      return json({ ok: true });
    }

    if (req.method === 'POST' && parts[0] === 'wix-sync') {
      if (!env.WIX_API_TOKEN) return json({ error: 'WIX_API_TOKEN env var not set' }, 500);
      if (!env.WIX_SITE_ID)   return json({ error: 'WIX_SITE_ID env var not set' }, 500);

      const all = [];
      let cursor = null;
      let pages = 0;
      do {
        const body = JSON.stringify({ search: { paging: { limit: 100, cursor } } });
        const r = await fetch('https://www.wixapis.com/stores/v3/products/search', {
          method: 'POST',
          headers: {
            'Authorization': env.WIX_API_TOKEN,
            'wix-site-id': env.WIX_SITE_ID,
            'Content-Type': 'application/json'
          },
          body
        });
        if (!r.ok) {
          const t = await r.text().catch(() => '');
          return json({ error: 'Wix API ' + r.status, detail: t.slice(0, 500) }, 502);
        }
        const data = await r.json();
        for (const p of data.products || []) {
          all.push({
            id: p.id,
            name: (p.name || '').trim(),
            slug: p.slug,
            url: 'https://www.essentialsblanks.net/product-page/' + p.slug,
            image: (p.media && p.media.main && p.media.main.image && p.media.main.image.url) || '',
            priceMin:   (p.actualPriceRange    && p.actualPriceRange.minValue    && p.actualPriceRange.minValue.amount)    || '',
            priceMax:   (p.actualPriceRange    && p.actualPriceRange.maxValue    && p.actualPriceRange.maxValue.amount)    || '',
            compareMin: (p.compareAtPriceRange && p.compareAtPriceRange.minValue && p.compareAtPriceRange.minValue.amount) || '',
            visible: p.visible !== false,
            availability: (p.inventory && p.inventory.availabilityStatus) || ''
          });
        }
        cursor = (data.pagingMetadata && data.pagingMetadata.cursors && data.pagingMetadata.cursors.next) || null;
        pages++;
      } while (cursor && pages < 50);

      const payload = JSON.stringify({
        updatedAt: new Date().toISOString(),
        count: all.length,
        products: all
      });
      await env.BUCKET.put('wix-products.json', payload, {
        httpMetadata: { contentType: 'application/json' }
      });
      return json({ ok: true, count: all.length, updatedAt: new Date().toISOString() });
    }

    if (req.method === 'POST' && parts[0] === 'wix-orders-sync') {
      if (!env.WIX_API_TOKEN) return json({ error: 'WIX_API_TOKEN env var not set' }, 500);
      if (!env.WIX_SITE_ID)   return json({ error: 'WIX_SITE_ID env var not set' }, 500);

      const all = [];
      let cursor = null;
      let pages = 0;
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // last 90 days
      do {
        const search = cursor
          ? { cursorPaging: { limit: 50, cursor } }
          : { cursorPaging: { limit: 50 }, sort: [{ fieldName: 'createdDate', order: 'DESC' }] };
        const r = await fetch('https://www.wixapis.com/ecom/v1/orders/search', {
          method: 'POST',
          headers: {
            'Authorization': env.WIX_API_TOKEN,
            'wix-site-id': env.WIX_SITE_ID,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ search })
        });
        if (!r.ok) {
          const t = await r.text().catch(() => '');
          return json({ error: 'Wix Orders API ' + r.status, detail: t.slice(0, 500) }, 502);
        }
        const data = await r.json();
        let stopPaging = false;
        for (const o of data.orders || []) {
          if (new Date(o.createdDate) < cutoff) { stopPaging = true; break; }
          const ship = (o.recipientInfo && o.recipientInfo.address) || {};
          const contact = (o.recipientInfo && o.recipientInfo.contactDetails) || {};
          all.push({
            id: o.id,
            number: o.number,
            createdDate: o.createdDate,
            paymentStatus: o.paymentStatus,
            fulfillmentStatus: o.fulfillmentStatus,
            archived: !!o.archived,
            status: o.status,
            total: (o.priceSummary && o.priceSummary.total && o.priceSummary.total.amount) || '0.00',
            currency: o.currency,
            buyer: {
              name: ((contact.firstName || '') + ' ' + (contact.lastName || '')).trim(),
              email: (o.buyerInfo && o.buyerInfo.email) || '',
              phone: contact.phone || ''
            },
            shipping: {
              addressLine: ship.addressLine || '',
              city: ship.city || '',
              postalCode: ship.postalCode || '',
              country: ship.country || '',
              countryFullname: ship.countryFullname || ''
            },
            lineItems: (o.lineItems || []).map(li => ({
              productId: (li.catalogReference && li.catalogReference.catalogItemId) || '',
              productName: (li.productName && li.productName.original) || '',
              image: (li.image && li.image.url) || '',
              quantity: li.quantity || 1,
              price: (li.price && li.price.amount) || '0.00',
              options: (li.catalogReference && li.catalogReference.options && li.catalogReference.options.options) || {}
            }))
          });
        }
        if (stopPaging) break;
        cursor = (data.metadata && data.metadata.cursors && data.metadata.cursors.next) || null;
        pages++;
      } while (cursor && pages < 30);

      const payload = JSON.stringify({
        updatedAt: new Date().toISOString(),
        count: all.length,
        orders: all
      });
      await env.BUCKET.put('wix-orders.json', payload, {
        httpMetadata: { contentType: 'application/json' }
      });
      return json({ ok: true, count: all.length, updatedAt: new Date().toISOString() });
    }

    if (req.method === 'POST' && parts[0] === 'wix-create-product') {
      if (!env.WIX_API_TOKEN) return json({ error: 'WIX_API_TOKEN env var not set' }, 500);
      if (!env.WIX_SITE_ID)   return json({ error: 'WIX_SITE_ID env var not set' }, 500);

      let body;
      try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }

      const name = (body.name || '').trim();
      const priceAmount   = String(body.priceAmount   || '').replace(/[£$,\s]/g, '');
      const compareAmount = String(body.comparePriceAmount || '').replace(/[£$,\s]/g, '');
      const sizes   = Array.isArray(body.sizes)   ? body.sizes.map(s => String(s).trim()).filter(Boolean)   : [];
      const colours = Array.isArray(body.colours) ? body.colours.map(c => String(c).trim()).filter(Boolean) : [];

      if (!name) return json({ error: 'Missing name' }, 400);
      if (!priceAmount || isNaN(parseFloat(priceAmount))) {
        return json({ error: 'Missing or invalid price (expected a number like 89.99)' }, 400);
      }

      const variantPrice = { actualPrice: { amount: priceAmount } };
      if (compareAmount && !isNaN(parseFloat(compareAmount))) {
        variantPrice.compareAtPrice = { amount: compareAmount };
      }

      // Build options + variants from sizes/colours. Wix requires a variant entry for every combination.
      const options = [];
      if (sizes.length) {
        options.push({
          name: 'Size',
          optionRenderType: 'TEXT_CHOICES',
          choicesSettings: { choices: sizes.map(s => ({ choiceType: 'CHOICE_TEXT', name: s })) }
        });
      }
      if (colours.length) {
        options.push({
          name: 'Color',
          optionRenderType: 'TEXT_CHOICES',
          choicesSettings: { choices: colours.map(c => ({ choiceType: 'CHOICE_TEXT', name: c })) }
        });
      }
      const sizeList   = sizes.length   ? sizes   : [null];
      const colourList = colours.length ? colours : [null];
      const variants = [];
      for (const sz of sizeList) {
        for (const co of colourList) {
          const choices = [];
          if (sz) choices.push({ optionChoiceNames: { optionName: 'Size',  choiceName: sz, renderType: 'TEXT_CHOICES' } });
          if (co) choices.push({ optionChoiceNames: { optionName: 'Color', choiceName: co, renderType: 'TEXT_CHOICES' } });
          variants.push({
            visible: true,
            choices,
            price: variantPrice,
            physicalProperties: {}
          });
        }
      }

      const product = {
        name,
        visible: true,
        productType: 'PHYSICAL',
        physicalProperties: {},
        options,
        variantsInfo: { variants }
      };

      const r = await fetch('https://www.wixapis.com/stores/v3/products', {
        method: 'POST',
        headers: {
          'Authorization': env.WIX_API_TOKEN,
          'wix-site-id': env.WIX_SITE_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product })
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return json({ error: 'Wix API ' + r.status, detail: t.slice(0, 500) }, 502);
      }
      const data = await r.json();
      const p = data.product || {};
      const publicUrl = p.slug ? ('https://www.essentialsblanks.net/product-page/' + p.slug) : '';
      return json({ ok: true, id: p.id, slug: p.slug, name: p.name, url: publicUrl });
    }

    return json({ error: 'Not found' }, 404);
  }
};
