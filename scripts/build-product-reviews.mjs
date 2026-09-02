import fs from 'node:fs';
import path from 'node:path';

const rawPath = path.resolve(
  'C:/Users/qmako/Documents/New project/outputs/esntls-reviews/judgeme-esntls-reviews.json',
);
const outputPath = path.resolve('data/product-reviews.json');

function publicName(name) {
  const raw = String(name || 'Customer').trim();
  if (!raw || /^anonymous$/i.test(raw) || /^customer$/i.test(raw)) return raw || 'Customer';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function slugFromUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    const parts = parsed.pathname.split('/').filter(Boolean);
    const productIndex = parts.indexOf('product');
    if (productIndex >= 0 && parts[productIndex + 1]) return parts[productIndex + 1];
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

function stripDiacritics(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeProduct(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bx\b/g, ' ')
    .replace(/\b(all|ultra|quality|new|season|out|of|store|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function reviewLooksUseful(review) {
  const text = String(review.text || '').trim();
  if (text.length < 14) return false;

  const lower = text.toLowerCase();
  if (
    /\b(restock|when.*stock|still not arrived|wrong colour|wrong color|negative review|took ages|took a month|tracking number|authentic|got stolen|sent me the wrong|size s|size m|can you restock|not supplied)\b/.test(
      lower,
    )
  ) {
    return false;
  }

  return normalizeProduct(text) !== normalizeProduct(review.product);
}

const liveProductAliases = {
  'B22 White': ['B22 White'],
  'B22 - Light Blue': ['B22 Light Blue ULTRA QUALITY'],
  'B22 Light Blue': ['B22 Light Blue ULTRA QUALITY'],
  'B22 Black': ['B22 Black'],
  'B30 - White': ['B30 - White'],
  'B30 White': ['B30 - White'],
  'B30 - Blue Lime Soles': ['B30 - Blue Lime Soles'],
  'B30 Blue Lime Soles': ['B30 - Blue Lime Soles'],
  'B30 Black': ['B30 - Black - All'],
  'B30 - Black': ['B30 - Black - All'],
  'B30 Black and Grey': ['B30 - Grey and Black'],
  'B30 Black and White': ['B30 - Black and White'],
  'B30 Blue and Black': ['B30 - Blue and Black'],
  'B30 Grey': ['B30 - Grey'],
  'B30 Grey and Black': ['B30 - Grey and Black'],
  'B30 Grey and White': ['B30 - Grey and White'],
  'B30 Grey/White/Black': ['B30 - Grey and White', 'B30 - Grey and Black'],
  'B30 Light Blue': ['B30 - Light Blue'],
  'B30 Olive': ['B30 - Olive'],
  'MacMillan Black Badge': ['Macmillxn Parka Jacket - Black | Black Badge'],
  'MacMillan Red Badge': ['Macmillxn Parka Jacket - Black | Red Logo'],
  'Grey Wyndham Parka': ['Wyndham Parka - Grey | Red Logo'],
  'Wyndham - Red Badge': ['Wyndham Parka - Black | Red Logo'],
  'Wyndham Red Badge': ['Wyndham Parka - Black | Red Logo'],
  'Wyndham Parka - Black Badge': ['Wyndham Parka - Black | Black Logo'],
  'Wyndham Parka Black Badge': ['Wyndham Parka - Black | Black Logo'],
  'Monc Windrunner - Navy': ['Mxncler Windrunner - Dark Blue'],
  'Monc Windrunner Navy': ['Mxncler Windrunner - Dark Blue'],
  'Burb Puffer Jacket': ['Bxrberry Puffer Jacket - Black'],
  'Duo Messenger Bag': ['Duo Messenger Bag'],
  'PM Messenger Bag': ['Messenger Bag (out of store)'],
  'Trio Messenger Bag': ['Trio Messenger Bag - Black', 'Louxs Vuitxn Trio Messenger Bag (out of store)'],
  'Casablanca T-Shirt': ['Casablanca T-Shirt'],
  'AF1 Supreme - White': ['AF1'],
  'AF1 Supreme White': ['AF1'],
  'AF1 Air Force 1 Low': ['AF1'],
  '95 Neon Green': ['95 Neon Green', '95s Neon'],
};

function buildAliases() {
  const aliases = {};
  for (const [liveName, judgeNames] of Object.entries(liveProductAliases)) {
    const key = normalizeProduct(liveName);
    aliases[key] = [...new Set(judgeNames.map(normalizeProduct).filter(Boolean))];
  }
  return aliases;
}

const source = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const reviews = source.reviews
  .filter((review) => {
    return (
      review &&
      review.status === 'Published' &&
      Number(review.rating) >= 4 &&
      reviewLooksUseful(review)
    );
  })
  .map((review) => ({
    id: String(review.id || ''),
    name: publicName(review.reviewer),
    loc: 'UK',
    text: String(review.text || '').trim(),
    product: String(review.product || '').trim(),
    productKey: normalizeProduct(review.product),
    productSlug: slugFromUrl(review.productUrl),
    stars: Number(review.rating) || 5,
    date: String(review.created || ''),
    source: 'Judge.me',
    verified: Boolean(review.verified),
  }));

const countsByProduct = reviews.reduce((counts, review) => {
  counts[review.product] = (counts[review.product] || 0) + 1;
  return counts;
}, {});

const output = {
  source: 'Judge.me product reviews exported from the ESNTLS Club WordPress dashboard',
  sourceName: 'Judge.me product',
  generatedAt: new Date().toISOString(),
  totalPublicReviews: Number(source.metadata?.counts?.byStatus?.Published || 266),
  usableMatchedReviews: reviews.length,
  productCount: Object.keys(countsByProduct).length,
  minRating: 4,
  filters:
    'Published reviews only, emails removed, short/restock/support/problem-only comments excluded.',
  aliases: buildAliases(),
  reviews,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Wrote ${outputPath}`);
console.log(`Usable reviews: ${reviews.length}`);
console.log(`Products with usable reviews: ${Object.keys(countsByProduct).length}`);
