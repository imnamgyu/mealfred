/* cookie-common.js — 밀프레드 1분 진단 시리즈 공통: 공유(카톡·맘카페) + 시리즈 크로스링크 */
(function () {
  var SERIES = [
    { id: 'mealplan', ico: '🍱', label: '우리 아이 맞춤 식단표', desc: '급식 데이터로 일주일 식단', href: '/cookie-mealplan.html' },
    { id: 'cousins', ico: '🥔', label: '사촌 음식 찾기', desc: '잘 먹는 음식의 다음 도전', href: '/cookie-cousins.html' },
    { id: 'normal', ico: '🧭', label: '편식 정상 진단', desc: '우리 아이 편식, 정상일까?', href: '/cookie-normal.html' },
    { id: 'quiz', ico: '🧠', label: '편식 IQ 퀴즈', desc: '내 편식 대처법, 맞을까?', href: '/cookie-quiz.html' }
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

  // 시리즈 크로스링크 스트립 — 매 페이지 푸터 위에 자동 삽입(현재 도구 제외)
  function strip() {
    var cur = (document.body.dataset.cookie || '');
    var others = SERIES.filter(function (s) { return s.id !== cur; });
    if (!others.length) return;
    var wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:540px;margin:0 auto;padding:4px 18px 26px';
    var inner = '<div style="background:#fff;border:1.5px solid #FFE0C0;border-radius:16px;padding:16px">'
      + '<div style="font-size:13.5px;font-weight:800;color:#1a2b4a;margin-bottom:4px">🍪 밀프레드 1분 진단</div>'
      + '<div style="font-size:11.5px;color:#9a8a7a;font-weight:600;margin-bottom:11px">다른 진단도 1분이면 끝나요</div>'
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
