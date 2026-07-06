/* cookie-common.js — 밀프레드 1분 진단 시리즈 공통: 공유(카톡·맘카페) + 시리즈 크로스링크 */
(function () {
  // 스트립엔 실제 배포(공개)된 서비스만 노출(이사님 2026-07-06) — 비공개 쿠키 초안은 여기 넣지 말 것.
  var SERIES = [
    { id: 'quiz', ico: '💯', label: '아이 편식 상식 점수', desc: '나는 편식을 잘 아는 부모일까? 10문제 1분', href: '/picky-score.html' },
    { id: 'child', ico: '🍽️', label: '우리 아이 먹BTI', desc: '우리 아이는 어떤 미식가 유형일까?', href: '/meokbti.html' },
    { id: 'eval', ico: '🍱', label: '어린이집 식단표 평가', desc: '식단표 사진 한 장이면 영양 점수·전국 비교까지', href: '/daycare-eval.html' },
    { id: 'app', ico: '💌', label: '밀프레드 편식 코칭', desc: '우리 아이 편식 전담 코치 · 35개 국제 가이드라인 기반', href: 'https://app.mealfred.com/?utm_source=cookie&utm_medium=strip' }
  ];

  window.mfToast = function (msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1F2D3D;color:#fff;font-size:13px;font-weight:700;padding:11px 18px;border-radius:100px;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:90%;text-align:center;line-height:1.5';
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 400); }, 2400);
  };

  // 공유 — 모바일은 네이티브 공유시트(카톡 포함), 데스크톱은 링크 복사
  window.mfShare = function (text) {
    var msg = text || window.mfShareText || '밀프레드 1분 진단 — 우리 아이 편식, 1분이면 알아요';
    var url = location.origin + location.pathname;
    if (window.gtag) gtag('event', 'cookie_share', { tool: document.body.dataset.cookie || '' });
    if (navigator.share) {
      navigator.share({ title: '밀프레드 1분 진단', text: msg + '\n👉 너도 해봐', url: url }).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg + '\n👉 ' + url).then(function () { mfToast('링크 복사됨! 카톡·맘카페에 붙여넣기 하세요 📋'); }).catch(function () { mfToast(url); });
    } else { mfToast(url); }
  };

  // 공개 도구(rankings 등)는 비공개 쿠키 cross-link 대신 → 편식코칭앱 유입 CTA(미끼→앱 전환)
  var APP_CTA_TOOLS = ['rankings'];
  // 스트립 자체를 안 붙이는 페이지 — quiz는 급식순위용 배너 카피가 맥락에 안 맞음(이사님 2026-07-05), 자체 CTA(coach)로 충분
  var NO_STRIP_TOOLS = ['quiz'];
  function appCta() {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:540px;margin:0 auto;padding:4px 18px 26px';
    wrap.innerHTML = '<div style="background:linear-gradient(135deg,#FFF8F2,#FFEAD6);border:1.5px solid #FFCF9F;border-radius:16px;padding:18px;text-align:center">'
      + '<div style="font-size:14.5px;font-weight:800;color:#1a2b4a;margin-bottom:5px">📱 우리 아이는 이 중에 뭘 잘 먹을까?</div>'
      + '<div style="font-size:12px;color:#8a7a6a;font-weight:600;line-height:1.65;margin-bottom:13px">급식 순위는 <b>전체 평균</b>이에요. 우리 아이 식단만 입력하면<br><b>편식코칭앱</b>이 35가지 편식이론으로 <b>맞춤 코칭 + 편식 도감</b>을 만들어줘요.</div>'
      + '<a href="https://app.mealfred.com" onclick="window.gtag&&gtag(\'event\',\'cookie_app_cta_click\',{tool:document.body.dataset.cookie||\'\'})" style="display:inline-block;background:#E89244;color:#fff;font-size:13.5px;font-weight:800;text-decoration:none;padding:12px 26px;border-radius:100px">편식코칭앱 무료로 시작 →</a>'
      + '</div>';
    var footer = document.querySelector('footer');
    if (footer) footer.parentNode.insertBefore(wrap, footer); else document.body.appendChild(wrap);
    if (window.gtag) gtag('event', 'cookie_app_cta_view', { tool: document.body.dataset.cookie || '' });
  }
  // 시리즈 크로스링크 스트립 — 매 페이지 푸터 위에 자동 삽입(현재 도구 제외)
  function strip() {
    var cur = (document.body.dataset.cookie || '');
    if (NO_STRIP_TOOLS.indexOf(cur) !== -1) return;
    if (APP_CTA_TOOLS.indexOf(cur) !== -1) { appCta(); return; }
    var others = SERIES.filter(function (s) { return s.id !== cur; });
    if (!others.length) return;
    var wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:540px;margin:0 auto;padding:4px 18px 26px';
    var inner = '<div style="background:#fff;border:1.5px solid #FFE0C0;border-radius:16px;padding:16px">'
      + '<div style="font-size:13.5px;font-weight:800;color:#1a2b4a;margin-bottom:4px">🥄 밀프레드 편식 서비스</div>'
      + '<div style="font-size:11.5px;color:#9a8a7a;font-weight:600;margin-bottom:11px">우리 아이 편식, 여기서부터 풀려요</div>'
      + '<div style="display:flex;flex-direction:column;gap:8px">';
    others.forEach(function (s) {
      inner += '<a href="' + s.href + '" style="display:flex;align-items:center;gap:11px;padding:11px 13px;border:1.5px solid #F0E0CE;border-radius:11px;text-decoration:none;color:#1a2b4a">'
        + '<span style="font-size:20px">' + s.ico + '</span>'
        + '<span style="flex:1;min-width:0"><b style="font-size:13.5px;font-weight:800;display:block">' + s.label + '</b><span style="font-size:11px;color:#8a7a6a;font-weight:600">' + s.desc + '</span></span>'
        + '<span style="color:#E89244;font-weight:800">→</span></a>';
    });
    inner += '</div></div>';
    wrap.innerHTML = inner;
    var footer = document.querySelector('footer');
    if (footer) footer.parentNode.insertBefore(wrap, footer); else document.body.appendChild(wrap);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', strip); else strip();
})();
