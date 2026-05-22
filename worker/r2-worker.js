// R2 admin Worker for esntlsclub
// Deploy via Cloudflare Dashboard → Workers & Pages → Create Worker → paste this code.
//
// Required bindings (set in the Worker's Settings → Variables tab):
//   1. R2 Bucket binding:
//        Variable name: BUCKET
//        Bucket:        esntls-images
//   2. Environment variable (encrypted):
//        Variable name: ADMIN_SECRET
//        Value:         any random string you choose (used by admin.html to authenticate)
//
// Endpoints (all require header  X-Admin-Secret: <ADMIN_SECRET>):
//   GET    /list             → { objects: [{key, url, size, uploaded}, ...] }
//   PUT    /upload/<key>     → request body = file bytes, Content-Type = file mime
//   DELETE /delete/<key>     → removes <key> from the bucket

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

    return json({ error: 'Not found' }, 404);
  }
};
