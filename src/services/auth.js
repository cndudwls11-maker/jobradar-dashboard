const SESSION_SECONDS = 60 * 60 * 12;


export async function login(c) {
  const env = c.env;
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return c.json({ error: '관리자 인증 Secrets 설정이 필요합니다.' }, 503);
  }
  let input;
  try { input = await c.req.json(); } catch { return c.json({ error: '요청 JSON이 올바르지 않습니다.' }, 400); }
  if (typeof input.username !== 'string' || typeof input.password !== 'string' || input.username.length > 100 || input.password.length > 256) {
    return c.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 400);
  }
  if (!constantTimeEqual(input.username, env.ADMIN_USERNAME) || !constantTimeEqual(input.password, env.ADMIN_PASSWORD)) {
    return c.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
  }
  const token = randomToken();
  const csrfToken = randomToken();
  const tokenHash = await digest(`${env.SESSION_SECRET}:${token}`);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare('INSERT INTO admin_sessions(token_hash, csrf_token, expires_at) VALUES(?,?,?)')
    .bind(tokenHash, csrfToken, expiresAt).run();
  c.header('Set-Cookie', `jr_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`);
  return c.json({ ok: true, csrfToken, expiresAt });
}

export async function logout(c) {
  c.header('Set-Cookie', 'jr_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
  return c.json({ ok: true });
}

export async function sessionInfo(c) {
  return c.json({ authenticated: true, username: '공개 사용자', role: 'public' });
}

function randomToken() {
  const values = crypto.getRandomValues(new Uint8Array(32));
  return [...values].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}