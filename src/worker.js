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

app.get('/api/health', (c) => c.json({ ok: true, service: 'JobRadar', collectionMode: 'manual-only' }));
app.route('/api', api);
app.notFound((c) => c.json({ error: '요청한 경로를 찾을 수 없습니다.' }, 404));
app.onError((error, c) => {
  console.error('JobRadar API error:', error);
  return c.json({ error: '서버 오류가 발생했습니다.' }, 500);
});

export default app;