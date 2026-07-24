(function(){
  const SHOPIFY_HOST = 'nr00an-yh.myshopify.com';
  const CART_KEY = 'esntls_cart_v1';

  function ensureNoReferrer(){
    let meta = document.querySelector('meta[name="referrer"]');
    if(!meta){
      meta = document.createElement('meta');
      meta.name = 'referrer';
      document.head.appendChild(meta);
    }
    meta.content = 'no-referrer';
  }

  function escapeHTML(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function cleanId(value){
    const raw = String(value || '');
    const match = raw.match(/(\d+)(?:\D*)$/);
    return match ? match[1] : '';
  }

  function productId(product){
    return String(product && product.dbId != null ? product.dbId : (product && product.id || '')).replace(/^r2_/,'');
  }

  function displayPrice(value){
    const price = String(value == null ? '' : value);
    if(!price || price === 'Out of stock' || /[£$]/.test(price)) return price;
    return '£' + price;
  }

  function splitList(value){
    if(Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
    return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
  }

  function isFootwear(product){
    return /\b(footwear|sneakers?|shoes?|runners?|b22|b30|asics|sandals?|slides?|sliders?)\b/i.test([product && product.name, product && product.n, product && product.category, product && product.cat, product && product.brand].join(' '));
  }

  function inferSizes(product){
    const explicit = splitList(product && (product.sizes || product.size || product.availableSizes));
    if(explicit.length) return explicit;
    const placeholderSizes = splitList(product && product.shopifyPlaceholder && product.shopifyPlaceholder.sizes);
    if(placeholderSizes.length) return placeholderSizes;
    const keys = Object.keys(product && (product.shopifyVariants || product.variantIds || {}) || {});
    const optionKeys = keys.map(key => key.split('|')[0].trim()).filter(Boolean);
    if(optionKeys.length) return Array.from(new Set(optionKeys));
    if(isFootwear(product)) return ['UK 5','UK 6','UK 7','UK 8','UK 9','UK 10','UK 11','UK 12'];
    if(/\b(shirts?|t-?shirts?|hoodies?|tracksuits?|shorts?|jackets?|clothing|pants|joggers?)\b/i.test([product && product.name, product && product.n, product && product.category, product && product.cat].join(' '))){
      return ['XS','S','M','L','XL'];
    }
    return [];
  }

  function variationName(product){
    return product && (product.variationName || product.variantOptionName || product.optionName || (product.shopifyPlaceholder && product.shopifyPlaceholder.variationName)) || '';
  }

  function variationValues(product){
    return splitList(product && (product.variationValues || product.variants || product.variantValues || (product.shopifyPlaceholder && product.shopifyPlaceholder.variationValues)));
  }

  function optionDefinitions(product){
    const defs = [];
    const sizes = inferSizes(product);
    if(sizes.length) defs.push({name:'Size', values:sizes, required:true});
    const values = variationValues(product);
    const name = variationName(product);
    if(values.length) defs.push({name:name || 'Style', values, required:true});
    return defs;
  }

  function variantEntries(product){
    const source = product && (product.shopifyVariants || product.variantIds || product.variantsMap);
    if(Array.isArray(source)){
      return source.map(entry => ({
        id: cleanId(entry.id || entry.variantId || entry.shopifyVariantId),
        options: entry.options || entry.selectedOptions || {},
        title: entry.title || ''
      })).filter(entry => entry.id);
    }
    if(source && typeof source === 'object'){
      return Object.entries(source).map(([key,value]) => {
        const parts = key.split('|').map(part => part.trim()).filter(Boolean);
        const options = {};
        if(parts[0]) options.Size = parts[0];
        if(parts[1]) options[variationName(product) || 'Style'] = parts[1];
        return {id:cleanId(value), options, title:key};
      }).filter(entry => entry.id);
    }
    const single = cleanId(product && (product.shopifyVariantId || product.variantId || product.defaultVariantId));
    return single ? [{id:single, options:{}, title:'Default'}] : [];
  }

  function selectedVariantId(product, selections){
    const entries = variantEntries(product);
    if(!entries.length) return '';
    const wanted = selections || {};
    const exact = entries.find(entry => {
      const options = entry.options || {};
      return Object.entries(wanted).every(([name,value]) => {
        if(!value) return true;
        return String(options[name] || '').toLowerCase() === String(value).toLowerCase();
      });
    });
    if(exact) return exact.id;
    if(entries.length === 1) return entries[0].id;
    return '';
  }

  function checkoutUrlForItems(items){
    const valid = items.filter(item => item.variantId);
    if(!valid.length) return '';
    const lines = valid.map(item => cleanId(item.variantId) + ':' + Math.max(1, Number(item.qty || 1) || 1)).join(',');
    return 'https://' + SHOPIFY_HOST + '/cart/' + lines;
  }

  function navigateNoReferrer(url){
    if(!url) return;
    ensureNoReferrer();
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_self';
    anchor.rel = 'noreferrer noopener';
    anchor.referrerPolicy = 'no-referrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function readCart(){
    try{
      const data = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    }catch(error){
      return [];
    }
  }

  function writeCart(items){
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    renderCart();
  }

  function sameLine(a,b){
    return String(a.productId) === String(b.productId) &&
      String(a.variantId || '') === String(b.variantId || '') &&
      JSON.stringify(a.options || {}) === JSON.stringify(b.options || {});
  }

  function add(product, selections, qty){
    const options = selections || {};
    const variantId = selectedVariantId(product, options);
    const sourceLink = product && (product.shopifyLink || product.link || product.wixLink || '');
    const line = {
      productId: productId(product),
      name: product && (product.name || product.n) || 'ESNTLS Item',
      price: product && product.price || '',
      image: product && (product.image || product.img || (product.images && product.images[0]) || (product.imgs && product.imgs[0])) || '',
      options,
      variantId,
      fallbackUrl: sourceLink,
      qty: Math.max(1, Number(qty || 1) || 1)
    };
    const cart = readCart();
    const existing = cart.find(item => sameLine(item,line));
    if(existing) existing.qty += line.qty;
    else cart.push(line);
    writeCart(cart);
    openCart();
    return line;
  }

  function checkout(items){
    const cart = items || readCart();
    const url = checkoutUrlForItems(cart);
    if(url){
      navigateNoReferrer(url);
      return;
    }
    if(cart.length === 1 && cart[0].fallbackUrl){
      navigateNoReferrer(cart[0].fallbackUrl);
      return;
    }
    alert('This cart needs Shopify variant IDs before it can be sent to checkout.');
  }

  function checkoutSingle(product, selections){
    const variantId = selectedVariantId(product, selections || {});
    if(variantId){
      navigateNoReferrer('https://' + SHOPIFY_HOST + '/cart/' + cleanId(variantId) + ':1');
      return true;
    }
    const fallback = product && (product.shopifyLink || product.link || product.wixLink || '');
    if(fallback){
      navigateNoReferrer(fallback);
      return true;
    }
    return false;
  }

  function setQty(index, qty){
    const cart = readCart();
    if(!cart[index]) return;
    const next = Math.max(1, Number(qty || 1) || 1);
    cart[index].qty = next;
    writeCart(cart);
  }

  function remove(index){
    const cart = readCart();
    cart.splice(index,1);
    writeCart(cart);
  }

  function count(){
    return readCart().reduce((sum,item) => sum + (Number(item.qty) || 1), 0);
  }

  function moneyToNumber(value){
    const match = String(value || '').match(/[\d.]+/);
    return match ? Number(match[0]) : 0;
  }

  function cartTotal(items){
    return items.reduce((sum,item) => sum + moneyToNumber(item.price) * (Number(item.qty) || 1), 0);
  }

  function renderCart(){
    ensureShell();
    const items = readCart();
    const bubble = document.getElementById('esntlsCartCount');
    if(bubble) bubble.textContent = String(count());
    const body = document.getElementById('esntlsCartBody');
    const footer = document.getElementById('esntlsCartFooter');
    if(!body || !footer) return;
    if(!items.length){
      body.innerHTML = '<div class="esntls-cart-empty">Your cart is empty.</div>';
      footer.innerHTML = '';
      return;
    }
    body.innerHTML = items.map((item,index) => {
      const optionText = Object.entries(item.options || {}).filter(([,value]) => value).map(([name,value]) => escapeHTML(name + ': ' + value)).join(' / ');
      return '<div class="esntls-cart-line">' +
        '<img src="' + escapeHTML(item.image) + '" alt="' + escapeHTML(item.name) + '">' +
        '<div class="esntls-cart-line-info">' +
        '<strong>' + escapeHTML(item.name) + '</strong>' +
        (optionText ? '<span>' + optionText + '</span>' : '') +
        (!item.variantId ? '<em>Variant ID needed for direct Shopify cart checkout</em>' : '') +
        '<b>' + escapeHTML(displayPrice(item.price)) + '</b>' +
        '<div class="esntls-cart-qty"><button type="button" onclick="EsntlsCart.setQty(' + index + ',' + (Number(item.qty || 1)-1) + ')">-</button><input value="' + escapeHTML(item.qty || 1) + '" inputmode="numeric" onchange="EsntlsCart.setQty(' + index + ',this.value)"><button type="button" onclick="EsntlsCart.setQty(' + index + ',' + (Number(item.qty || 1)+1) + ')">+</button></div>' +
        '</div>' +
        '<button class="esntls-cart-remove" type="button" onclick="EsntlsCart.remove(' + index + ')" aria-label="Remove item">x</button>' +
        '</div>';
    }).join('');
    footer.innerHTML = '<div class="esntls-cart-total"><span>Total</span><strong>£' + cartTotal(items).toFixed(2) + '</strong></div>' +
      '<button class="esntls-cart-checkout" type="button" onclick="EsntlsCart.checkout()">Checkout</button>' +
      '<button class="esntls-cart-continue" type="button" onclick="EsntlsCart.closeCart()">Keep shopping</button>';
  }

  function openCart(){
    ensureShell();
    renderCart();
    document.getElementById('esntlsCartDrawer').classList.add('open');
    document.getElementById('esntlsCartOverlay').classList.add('open');
  }

  function closeCart(){
    const drawer = document.getElementById('esntlsCartDrawer');
    const overlay = document.getElementById('esntlsCartOverlay');
    if(drawer) drawer.classList.remove('open');
    if(overlay) overlay.classList.remove('open');
  }

  function ensureShell(){
    ensureNoReferrer();
    if(document.getElementById('esntlsCartStyle')) return;
    const style = document.createElement('style');
    style.id = 'esntlsCartStyle';
    style.textContent = `
      .esntls-cart-fab{position:fixed;right:14px;top:76px;z-index:180;align-items:center;background:#111;border:1px solid rgba(255,255,255,.16);border-radius:999px;box-shadow:0 10px 24px rgba(0,0,0,.18);color:#fff;cursor:pointer;display:flex;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:800;gap:8px;min-height:42px;padding:10px 14px}
      .esntls-cart-fab span{align-items:center;background:#00C853;border-radius:999px;color:#fff;display:flex;font-size:11px;height:22px;justify-content:center;min-width:22px;padding:0 6px}
      .esntls-cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);display:none;z-index:850}
      .esntls-cart-overlay.open{display:block}
      .esntls-cart-drawer{background:#fff;bottom:0;box-shadow:-18px 0 48px rgba(0,0,0,.18);display:flex;flex-direction:column;max-width:420px;position:fixed;right:0;top:0;transform:translateX(105%);transition:transform .24s cubic-bezier(.22,1,.36,1);width:100%;z-index:860}
      .esntls-cart-drawer.open{transform:translateX(0)}
      .esntls-cart-head{align-items:center;border-bottom:1px solid #eee;display:flex;justify-content:space-between;padding:18px}
      .esntls-cart-head strong{font-family:'Bebas Neue','DM Sans',sans-serif;font-size:26px;font-weight:400;letter-spacing:1px}
      .esntls-cart-head button,.esntls-cart-remove{background:#f4f4f4;border:0;border-radius:999px;color:#111;cursor:pointer;font-weight:800;height:36px;width:36px}
      .esntls-cart-body{flex:1;overflow:auto;padding:12px 14px}
      .esntls-cart-empty{color:#777;font-size:13px;font-weight:700;padding:38px 12px;text-align:center}
      .esntls-cart-line{border-bottom:1px solid #eee;display:grid;gap:11px;grid-template-columns:72px 1fr 36px;padding:12px 0}
      .esntls-cart-line img{aspect-ratio:4/5;background:#f4f4f4;border-radius:10px;height:auto;object-fit:cover;width:72px}
      .esntls-cart-line-info strong{display:block;font-size:13px;line-height:1.3}
      .esntls-cart-line-info span,.esntls-cart-line-info em{color:#777;display:block;font-size:11px;font-style:normal;font-weight:700;margin-top:4px}
      .esntls-cart-line-info em{color:#d26a00}
      .esntls-cart-line-info b{display:block;font-size:12px;margin-top:6px}
      .esntls-cart-qty{align-items:center;display:flex;gap:6px;margin-top:8px}
      .esntls-cart-qty button{background:#f1f1f1;border:0;border-radius:999px;cursor:pointer;font-weight:900;height:30px;width:30px}
      .esntls-cart-qty input{border:1px solid #e3e3e3;border-radius:999px;font-size:12px;font-weight:800;height:30px;text-align:center;width:44px}
      .esntls-cart-footer{border-top:1px solid #eee;padding:14px}
      .esntls-cart-total{align-items:center;display:flex;font-size:13px;justify-content:space-between;margin-bottom:10px}
      .esntls-cart-total strong{font-size:18px}
      .esntls-cart-checkout{background:#00C853;border:0;border-radius:999px;color:#fff;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:900;min-height:52px;width:100%}
      .esntls-cart-continue{background:#fff;border:1.5px solid #e5e5e5;border-radius:999px;color:#111;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:800;margin-top:9px;min-height:44px;width:100%}
      @media(max-width:819px){.esntls-cart-fab{top:auto;bottom:82px;right:14px}.esntls-cart-drawer{max-width:none}}
    `;
    document.head.appendChild(style);
    const button = document.createElement('button');
    button.className = 'esntls-cart-fab';
    button.type = 'button';
    button.setAttribute('onclick','EsntlsCart.openCart()');
    button.setAttribute('aria-label','Open cart');
    button.innerHTML = 'Cart <span id="esntlsCartCount">0</span>';
    const overlay = document.createElement('div');
    overlay.id = 'esntlsCartOverlay';
    overlay.className = 'esntls-cart-overlay';
    overlay.setAttribute('onclick','EsntlsCart.closeCart()');
    const drawer = document.createElement('aside');
    drawer.id = 'esntlsCartDrawer';
    drawer.className = 'esntls-cart-drawer';
    drawer.setAttribute('aria-label','Shopping cart');
    drawer.innerHTML = '<div class="esntls-cart-head"><strong>Your Cart</strong><button type="button" onclick="EsntlsCart.closeCart()" aria-label="Close cart">x</button></div><div id="esntlsCartBody" class="esntls-cart-body"></div><div id="esntlsCartFooter" class="esntls-cart-footer"></div>';
    document.body.appendChild(button);
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
  }

  function optionPickerHTML(product, prefix){
    const defs = optionDefinitions(product);
    if(!defs.length) return '';
    return '<div class="esntls-option-panel" data-cart-options="' + escapeHTML(prefix) + '">' + defs.map((def,index) => (
      '<div class="esntls-option-group"><div class="esntls-option-label">' + escapeHTML(def.name) + '</div><div class="esntls-option-grid">' +
      def.values.map((value,valueIndex) => '<label><input type="radio" name="' + escapeHTML(prefix + '_' + index) + '" value="' + escapeHTML(value) + '"' + (valueIndex === 0 ? ' checked' : '') + ' data-option-name="' + escapeHTML(def.name) + '"><span>' + escapeHTML(value) + '</span></label>').join('') +
      '</div></div>'
    )).join('') + '</div>';
  }

  function selectedOptionsFrom(prefix){
    const values = {};
    document.querySelectorAll('[data-cart-options="' + prefix + '"] input[type="radio"]:checked').forEach(input => {
      values[input.dataset.optionName] = input.value;
    });
    return values;
  }

  window.EsntlsCart = {
    add,
    checkout,
    checkoutSingle,
    closeCart,
    openCart,
    optionPickerHTML,
    selectedOptionsFrom,
    selectedVariantId,
    setQty,
    remove,
    renderCart,
    navigateNoReferrer
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderCart);
  else renderCart();
})();
