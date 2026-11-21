import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { api } from './routes/api.js';

const app = new Hono();

app.use('/api/*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'same-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  await next();
});

app.use('/api/*', cors({ origin: (origin, c) => origin === new URL(c.req.url).origin ? origin : '', allowMethods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowHeaders: ['Content-Type','X-CSRF-Token'], credentials: true, maxAge: 600 }));

// Reject browser requests from other sites; this is not an authentication boundary.
app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: '다른 사이트에서 보낸 요청은 허용되지 않습니다.' }, 403);
    if (c.req.header('Sec-Fetch-Site') === 'cross-site') return c.json({ error: '다른 사이트에서 보낸 요청은 허용되지 않습니다.' }, 403);
  }
  await next();
});

app.get('/api/health', (c) => c.json({ ok: true, service: 'JobRadar', collectionMode: 'manual-only' }));
app.route('/api', api);
app.notFound(async (c) => {
  if ((c.env.ASSETS || c.env.ASSETS_FETCHER) && !c.req.path.startsWith('/api/')) return (c.env.ASSETS || c.env.ASSETS_FETCHER).fetch(c.req.raw);
  return c.json({ error: '요청한 경로를 찾을 수 없습니다.' }, 404);
});
app.onError((error, c) => {
  console.error('JobRadar API error:', error);
  return c.json({ error: '서버 오류가 발생했습니다.' }, 500);
});

export default app;