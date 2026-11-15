import app from '../../src/worker.js';

// Pages Functions catch-all: forward only API routes to the shared Worker/Hono app.
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
    return new Response('Not found', { status: 404 });
  }
  return app.fetch(request, env, context);
}