import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const photoCode=html.slice(html.indexOf('// Photo drafts stay separate'),html.indexOf('// DELETE PRODUCT'));
const pickerCode=html.slice(html.indexOf('function openPickerForEdit'),html.indexOf('// STOCK CHECK'));
const catalogue=()=>Array.from({length:89},(_,i)=>({id:i+1,name:'Product '+(i+1),images:['cover.jpg','second.jpg'],price:'£50',link:'shopify-'+i,archived:i===60,shopifyVariants:{M:'123'}}));
function harness(){
  const nodes=new Map();const events={};const writes=[];const toasts=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},innerHTML:'',textContent:'',scrollIntoView(){}});return nodes.get(id)};
  let live=catalogue();
  const ctx=vm.createContext({
    products:structuredClone(live),Blob,Date,console:{error(){}},MIN_SAFE_PRODUCT_SAVE_COUNT:80,_lastSyncTime:0,
    document:{getElementById:node,querySelectorAll:()=>[]},window:{addEventListener:(k,f)=>events[k]=f},
    escapeAdminHTML:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    productListFromPayload:d=>Array.isArray(d)?d:(d.products||[]),
    confirm:()=>true,toast:(...args)=>toasts.push(args),syncDashboard(){},showTab(){},isArchivedProduct:p=>p.archived,
    productFilters:{},compressImage:async f=>f,
    r2Fetch:async()=>({ok:true,json:async()=>structuredClone(live)}),
    r2Upload:async(file,key)=>{writes.push({key,value:key==='products.json'?JSON.parse(await file.text()):file});return 'uploaded/'+key},
    openPicker:cb=>ctx.picker=cb,
  });
  vm.runInContext(photoCode+'\n'+pickerCode,ctx);
  return {ctx,nodes,node,events,writes,toasts,run:code=>vm.runInContext(code,ctx),live:()=>live,setLive:value=>live=value};
}
test('all inline JavaScript parses',()=>scripts.forEach(s=>new vm.Script(s)));
test('draft edits never change the saved product or write the catalogue',()=>{
  const h=harness();h.run('imgFirst(1,1);imgDel(1,1)');
  assert.deepEqual(h.ctx.products[0].images,['cover.jpg','second.jpg']);assert.equal(h.writes.length,0);
  assert.match(h.node('imgs_1').innerHTML,/Save changes/);assert.equal(h.run('photoDirty(photoDraft(1))'),true);
});
test('save patches only photos against the latest complete catalogue',async()=>{
  const h=harness();h.run('imgFirst(1,1)');
  h.live()[0].price='£99';h.live()[0].link='new-shopify';h.live()[5].name='Updated elsewhere';h.live().push({id:90,images:['new.jpg'],archived:true});
  const expected=structuredClone(h.live());expected[0].images.reverse();
  await h.run('imgSave(1)');
  assert.equal(h.writes.length,1);assert.deepEqual(h.writes[0].value,expected);
  assert.equal(h.run('photoDirty(photoDraft(1))'),false);assert.match(h.node('im_1').textContent||h.node('imgs_1').innerHTML,/Changes saved/);
  assert.equal(h.node('productCover_1').src,'second.jpg');
});
test('failed save keeps the draft and can be retried',async()=>{
  const h=harness();h.run('imgFirst(1,1)');const upload=h.ctx.r2Upload;
  h.ctx.r2Upload=async()=>{throw new Error('Network unavailable')};await h.run('imgSave(1)');
  assert.equal(h.run('photoDirty(photoDraft(1))'),true);assert.match(h.node('imgs_1').innerHTML,/Not saved: Network unavailable/);
  assert.deepEqual(h.ctx.products[0].images,['cover.jpg','second.jpg']);
  h.ctx.r2Upload=upload;await h.run('imgSave(1)');assert.equal(h.run('photoDirty(photoDraft(1))'),false);
});
test('partial, unavailable or missing-product catalogues cannot overwrite live data',async()=>{
  for(const mode of ['partial','unavailable','missing']){
    const h=harness();h.run('imgFirst(1,1)');
    if(mode==='partial')h.setLive(h.live().slice(0,36));
    if(mode==='unavailable')h.ctx.r2Fetch=async()=>({ok:false});
    if(mode==='missing')h.setLive(h.live().filter(p=>p.id!==1));
    await h.run('imgSave(1)');assert.equal(h.writes.length,0);assert.equal(h.run('photoDirty(photoDraft(1))'),true);
  }
});
test('concurrent changes to the same photos are not overwritten',async()=>{
  const h=harness();h.run('imgFirst(1,1)');h.live()[0].images=['someone-elses-photo.jpg'];
  await h.run('imgSave(1)');assert.equal(h.writes.length,0);assert.match(h.node('imgs_1').innerHTML,/another session/);
});
test('retry succeeds when an uncertain previous save already reached storage',async()=>{
  const h=harness();h.run('imgFirst(1,1)');h.live()[0].images.reverse();await h.run('imgSave(1)');
  assert.equal(h.run('photoDirty(photoDraft(1))'),false);
});
test('uploads do not save automatically and upload/compression failures retain successes',async()=>{
  const h=harness();h.ctx.compressImage=async file=>{if(file.name==='bad')throw new Error('Invalid image');return file};
  await h.ctx.imgAdd({target:{files:[{name:'good'},{name:'bad'},{name:'also-good'}]}},1);
  assert.equal(h.writes.length,2);assert.ok(h.writes.every(w=>w.key!=='products.json'));
  assert.equal(h.run('photoDraft(1).images.length'),4);assert.deepEqual(h.ctx.products[0].images,['cover.jpg','second.jpg']);
  assert.match(h.node('imgs_1').innerHTML,/could not upload/);assert.equal(h.run('photoDraft(1).busy'),false);
  await h.run('imgSave(1)');assert.equal(h.writes.at(-1).value[0].images.length,4);
});
test('save and further edits are blocked until uploads finish',async()=>{
  const h=harness();let finish;h.ctx.compressImage=()=>new Promise(r=>finish=r);
  const upload=h.ctx.imgAdd({target:{files:[{}]}},1);
  assert.match(h.node('imgs_1').innerHTML,/Uploading…/);h.run('imgFirst(1,1)');await h.run('imgSave(1)');
  assert.equal(h.writes.length,0);assert.equal(h.run('photoDraft(1).images[0]'),'cover.jpg');
  finish({});await upload;
});
test('library selection uses the same draft and ignores existing photos',()=>{
  const h=harness();h.run('openPickerForEdit(1)');h.ctx.picker(['cover.jpg','library.jpg']);
  assert.equal(h.run('photoDraft(1).images.length'),3);assert.equal(h.writes.length,0);assert.match(h.node('imgs_1').innerHTML,/Press Save changes/);
});
test('closing and reopening keeps changes; discard restores the saved photos',()=>{
  const h=harness();h.run('toggleImgEdit(1);imgFirst(1,1);toggleImgEdit(1);toggleImgEdit(1)');
  assert.equal(h.run('photoDraft(1).images[0]'),'second.jpg');h.run('discardPhotoChanges(1)');
  assert.equal(h.run('photoDirty(photoDraft(1))'),false);assert.equal(h.run('photoDraft(1).images[0]'),'cover.jpg');assert.equal(h.writes.length,0);
});
test('leaving warns only while there are pending changes',()=>{
  const h=harness();let warned=false;const event={preventDefault(){warned=true}};
  h.events.beforeunload(event);assert.equal(warned,false);h.run('imgFirst(1,1)');h.events.beforeunload(event);assert.equal(warned,true);
  h.run('discardPhotoChanges(1)');warned=false;h.events.beforeunload(event);assert.equal(warned,false);
});
test('double-clicking Save causes only one write',async()=>{
  const h=harness();h.run('imgFirst(1,1)');await Promise.all([h.run('imgSave(1)'),h.run('imgSave(1)')]);assert.equal(h.writes.length,1);
});
test('the final photo cannot be removed',()=>{
  const h=harness();h.run('imgDel(1,1);imgDel(1,0)');assert.equal(h.run('photoDraft(1).images.length'),1);assert.equal(h.toasts.length,1);
});
test('photo save waits if a details/catalogue save is already running',async()=>{
  const h=harness();h.run('imgFirst(1,1);catalogueSaveInProgress=true');await h.run('imgSave(1)');
  assert.equal(h.writes.length,0);assert.equal(h.run('photoDirty(photoDraft(1))'),true);assert.equal(h.toasts.length,1);
});
