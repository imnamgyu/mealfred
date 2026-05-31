/* docs-gate.js — 내부 문서(@docs) 접근 제어.
 * @mealfred.com 구글 워크스페이스 계정으로 로그인한 세션만 내용을 본다.
 * 정적 사이트라 서버 인증이 없어 클라이언트 게이트 — 렌더는 막지만 HTML 소스 자체를 암호화하진 못함.
 * (진짜 기밀이면 앱(app.mealfred.com) 서버 보호 라우트로 옮겨야 함.)
 */
(function () {
  var SUPABASE_URL = 'https://spopsngwvpxvbokoefem.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_xxxxxxxxxxxxxxxxxx';
  var DOMAIN = 'mealfred.com';

  var html = document.documentElement;
  html.style.visibility = 'hidden';   // 인증 확인 전 렌더 숨김
  function reveal() { html.style.visibility = ''; }

  function loginWall(sb, currentEmail) {
    reveal();
    var wrongAcct = currentEmail
      ? '<p style="margin-top:10px;font-size:12px;color:#C62828">현재 <b>' + currentEmail + '</b> — @' + DOMAIN + ' 계정이 아니에요.</p>'
      : '';
    document.documentElement.innerHTML =
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{font-family:Pretendard,system-ui,sans-serif;background:linear-gradient(160deg,#FFF5EB,#FFE8D0);min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0}' +
      '.box{background:#fff;border:1px solid #FFE8D0;border-radius:18px;padding:34px 30px;max-width:380px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.08)}' +
      'h1{font-size:20px;color:#1a2b4a;margin:0 0 8px}p{font-size:13.5px;color:#6B7280;line-height:1.6;margin:0}' +
      'button{margin-top:18px;width:100%;padding:13px;border:1px solid #DADCE0;background:#fff;border-radius:11px;font-size:14px;font-weight:700;color:#1a2b4a;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:inherit}' +
      'button:hover{background:#FAFAFA}</style></head>' +
      '<body><div class="box"><div style="font-size:34px">🔒</div>' +
      '<h1>밀프레드 내부 문서</h1>' +
      '<p>이 문서는 <b>@' + DOMAIN + '</b> 구글 계정으로 로그인해야 볼 수 있어요.</p>' + wrongAcct +
      '<button id="g"><svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg> mealfred.com 계정으로 로그인</button>' +
      (currentEmail ? '<button id="o" style="margin-top:8px;border:none;color:#9CA3AF;font-size:12px">다른 계정으로 로그인</button>' : '') +
      '</div></body>';
    document.getElementById('g').onclick = function () {
      // redirectTo는 해시·쿼리 없는 깨끗한 URL — 기존 #access_token이 중복되어 파싱 깨지는 것 방지
      sb.auth.signInWithOAuth({ provider: 'google', options: { queryParams: { hd: DOMAIN, prompt: 'select_account' }, redirectTo: location.origin + location.pathname } });
    };
    var o = document.getElementById('o');
    if (o) o.onclick = function () { sb.auth.signOut().then(function () { location.reload(); }); };
  }

  function cleanHash() {
    // 로그인 후 URL의 #access_token=... 토큰 흔적 제거
    if (location.hash || location.search) {
      try { history.replaceState(null, '', location.origin + location.pathname); } catch (e) {}
    }
  }
  function isDomain(session) {
    var email = (session && session.user && session.user.email || '').toLowerCase();
    return email.slice(-(DOMAIN.length + 1)) === '@' + DOMAIN;
  }
  function emailOf(session) { return (session && session.user && session.user.email) || ''; }
  function decide(sb, session) {
    if (isDomain(session)) { cleanHash(); reveal(); }
    else loginWall(sb, emailOf(session));
  }
  // access_token(JWT) payload 디코드 — setSession 성공 여부에 의존하지 않고 이메일·만료 직접 확인(게이트 신뢰도↑)
  function jwtInfo(at) {
    try {
      var part = at.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (part.length % 4) part += '=';
      var o = JSON.parse(decodeURIComponent(escape(atob(part))));
      return { email: (o.email || '').toLowerCase(), exp: o.exp || 0 };
    } catch (e) { return null; }
  }
  function boot() {
    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
    });
    var hash = (location.hash || '').replace(/^#/, '');
    if (hash.indexOf('access_token=') >= 0) {
      var p = new URLSearchParams(hash);
      var at = p.get('access_token'), rt = p.get('refresh_token') || '';
      try { sb.auth.setSession({ access_token: at, refresh_token: rt }); } catch (e) { /* 영속화는 best-effort */ }
      var info = jwtInfo(at);
      var now = Math.floor(Date.now() / 1000);
      if (info && info.email.slice(-(DOMAIN.length + 1)) === '@' + DOMAIN && info.exp > now) { cleanHash(); reveal(); return; }
      loginWall(sb, info ? info.email : ''); return;
    }
    // 저장된 세션 확인(재방문)
    sb.auth.getSession()
      .then(function (res) { decide(sb, res && res.data && res.data.session); })
      .catch(function () { loginWall(sb, ''); });
  }

  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  s.onload = boot;
  s.onerror = reveal;   // 라이브러리 로드 실패 시 잠그지 않음(가용성 우선)
  (document.head || document.documentElement).appendChild(s);
})();
