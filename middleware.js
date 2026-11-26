// 사이트 전체 비밀번호 잠금 (Vercel Routing Middleware).
// Vercel 프로젝트 설정에 SITE_PASSWORD 가 있을 때만 동작합니다.

const COOKIE = 'site_gate';
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

export const config = { matcher: '/:path*' };

// 요청을 그대로 통과시킨다 (@vercel/functions 의 next() 와 같음).
const pass = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

// 쿠키에는 비밀번호가 아니라 해시를 저장한다. 비밀번호를 바꾸면 모두 다시 입력해야 한다.
async function token(password) {
  const data = new TextEncoder().encode(`artist-notes:site-gate:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

// 같은 사이트 안의 경로로만 돌려보낸다.
const safeNext = (value) => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/');

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function unlockPage(next, error, status = 200) {
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>작태 노트 · 잠금</title>
<style>
:root{--ink:#302e3a;--muted:#93909f;--purple:#8270b2;--border:#e9e6ef;--bg:#f8f7fb}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--ink);font-family:system-ui,'Noto Sans KR',sans-serif}
main{width:min(380px,100%);background:#fff;border:1px solid var(--border);border-radius:16px;padding:28px;box-shadow:0 20px 60px #372c4c12}
.icon{font-size:26px;color:var(--purple)}
h1{font-size:20px;margin:10px 0 6px;letter-spacing:-.5px}
p{margin:0 0 20px;color:var(--muted);font-size:13px;line-height:1.7}
label{display:block;font-size:12px;color:#7c6e89;font-weight:600;margin-bottom:8px}
input{display:block;width:100%;border:1px solid #e5dfec;border-radius:8px;padding:12px;font:inherit;font-size:15px;background:#fdfcfe;color:var(--ink);outline:none}
input:focus{border-color:#ac93c6;box-shadow:0 0 0 3px #ece6f4}
button{margin-top:14px;width:100%;border:0;border-radius:8px;padding:12px;background:var(--purple);color:#fff;font:inherit;font-weight:600;cursor:pointer}
button:hover{background:#705d9e}
.error{color:#b46d81;font-size:12px;margin:10px 0 0}
</style></head>
<body><main>
<div class="icon">✦</div>
<h1>비밀번호가 필요해요</h1>
<p>비밀번호를 아는 사람만 볼 수 있는 노트예요.</p>
<form method="post" action="/unlock">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<label for="password">비밀번호</label>
<input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<button type="submit">들어가기</button>
</form>
</main></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export default async function middleware(request) {
  const password = (process.env.SITE_PASSWORD || '').trim();
  if (!password) return pass();

  const url = new URL(request.url);
  const expected = await token(password);

  if (url.pathname === '/unlock') {
    if (request.method === 'POST') {
      const form = await request.formData().catch(() => null);
      const next = safeNext(form?.get('next'));
      const given = String(form?.get('password') ?? '');
      if (!safeEqual(await token(given), expected)) {
        await new Promise((resolve) => setTimeout(resolve, 800)); // 비밀번호 대입을 느리게
        return unlockPage(next, '비밀번호가 맞지 않아요.', 401);
      }
      const secure = url.protocol === 'https:' ? '; Secure' : '';
      return new Response(null, {
        status: 303,
        headers: {
          Location: next,
          'Set-Cookie': `${COOKIE}=${expected}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return unlockPage(safeNext(url.searchParams.get('next')));
  }

  if (safeEqual(readCookie(request, COOKIE), expected)) return pass();

  // 잠긴 상태: 페이지는 잠금 화면으로, 데이터·파일 요청은 401
  const accept = request.headers.get('accept') || '';
  if (request.method === 'GET' && accept.includes('text/html')) {
    const target = url.pathname + url.search;
    const location = target === '/' ? '/unlock' : `/unlock?next=${encodeURIComponent(target)}`;
    return new Response(null, { status: 307, headers: { Location: location, 'Cache-Control': 'no-store' } });
  }
  return new Response(JSON.stringify({ error: '비밀번호가 필요해요.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
