const GITHUB_ORIGIN = 'https://raw.githubusercontent.com/qmako4/esntlsclub/main';
const R2_PUBLIC_ORIGIN = 'https://pub-43c9cf7fd2904289881c21839332521c.r2.dev';

const PUBLIC_ROOT_FILES = new Set([
  'admin.html',
  'cart.js',
  'image-compressor.html',
  'index.html',
  'product.html',
  'products.json',
  'stock-story-generator.html',
  'sync.html',
]);

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function extensionFor(pathname) {
  const dot = pathname.lastIndexOf('.');
  return dot === -1 ? '' : pathname.slice(dot).toLowerCase();
}

function publicFileFor(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded === '/') return 'index.html';

  const normalized = decoded.replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || normalized.includes('\\')) return null;

  if (normalized === 'product') return 'product.html';
  if (normalized === 'admin') return 'admin.html';
  if (PUBLIC_ROOT_FILES.has(normalized)) return normalized;

  if (/^img\/[A-Za-z0-9._-]+\.(?:gif|jpe?g|png|svg|webp)$/i.test(normalized)) {
    return normalized;
  }

  return null;
}

function mediaKeyFor(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (!decoded.startsWith('/media/')) return null;

  const key = decoded.slice('/media/'.length);
  if (!key || key.includes('..') || key.includes('\\')) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:gif|jpe?g|json|png|svg|webp)$/i.test(key)) return null;

  return key;
}

function cacheSettings(file) {
  const extension = extensionFor(file);

  if (['.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp'].includes(extension)) {
    return { browserTtl: 86400, edgeTtl: 604800 };
  }

  return { browserTtl: 60, edgeTtl: 300 };
}

function responseHeaders(originHeaders, file, browserTtl, colo) {
  const headers = new Headers(originHeaders);
  const extension = extensionFor(file);

  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.delete('content-security-policy');
  headers.delete('cross-origin-resource-policy');
  headers.delete('expires');
  headers.delete('x-frame-options');

  headers.set('Cache-Control', `public, max-age=${browserTtl}, stale-while-revalidate=86400`);
  headers.set('Content-Type', CONTENT_TYPES[extension] || 'application/octet-stream');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-ESNTLS-Edge', colo || 'unknown');
  headers.set('X-Frame-Options', 'SAMEORIGIN');

  return headers;
}

async function serveMedia(request, key) {
  const extension = extensionFor(key);
  const isJson = extension === '.json';
  const browserTtl = isJson ? 30 : 604800;
  const edgeTtl = isJson ? 60 : 2592000;
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const originUrl = `${R2_PUBLIC_ORIGIN}/${encodedKey}`;
  const originResponse = await fetch(originUrl, {
    cf: {
      cacheEverything: true,
      cacheTtl: edgeTtl,
      cacheTtlByStatus: {
        '200-299': edgeTtl,
        '404': 60,
        '500-599': 0,
      },
    },
  });
  const headers = responseHeaders(
    originResponse.headers,
    key,
    browserTtl,
    request.cf && request.cf.colo,
  );
  headers.set('X-ESNTLS-Media', 'edge');

  if (isJson && originResponse.ok) {
    headers.delete('etag');
    const body = (await originResponse.text()).split(`${R2_PUBLIC_ORIGIN}/`).join('/media/');
    return new Response(request.method === 'HEAD' ? null : body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers,
    });
  }

  return new Response(request.method === 'HEAD' ? null : originResponse.body, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.hostname === 'www.esntlsclub.com') {
      url.hostname = 'esntlsclub.com';
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 308);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    }

    const mediaKey = mediaKeyFor(url.pathname);
    if (mediaKey) return serveMedia(request, mediaKey);

    const file = publicFileFor(url.pathname);
    if (!file) {
      return new Response('Not found', {
        status: 404,
        headers: {
          'Cache-Control': 'public, max-age=60',
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const { browserTtl, edgeTtl } = cacheSettings(file);
    const originUrl = `${GITHUB_ORIGIN}/${file}`;
    const originResponse = await fetch(originUrl, {
      cf: {
        cacheEverything: true,
        cacheTtl: edgeTtl,
        cacheTtlByStatus: {
          '200-299': edgeTtl,
          '404': 60,
          '500-599': 0,
        },
      },
      headers: {
        Accept: request.headers.get('Accept') || '*/*',
        'User-Agent': 'ESNTLS-Club-Edge/1.0',
      },
    });

    const headers = responseHeaders(
      originResponse.headers,
      file,
      browserTtl,
      request.cf && request.cf.colo,
    );

    return new Response(request.method === 'HEAD' ? null : originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers,
    });
  },
};
