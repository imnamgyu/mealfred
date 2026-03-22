// Referral tracking - load on ALL pages
(function() {
  var params = new URLSearchParams(window.location.search);
  var ref = params.get('ref');
  if (!ref) {
    ref = sessionStorage.getItem('mealfred_ref');
  }
  if (!ref) return;

  // Persist across page navigations
  sessionStorage.setItem('mealfred_ref', ref);

  // Track the visit (fire once per session per ref)
  var tracked = sessionStorage.getItem('mealfred_ref_tracked_' + ref);
  if (tracked) return;

  // GA4 referral visit event
  if (typeof gtag === 'function') {
    gtag('event', 'referral_visit', { referral_code: ref, page: window.location.pathname });
  }

  fetch('/api/track-visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      referralCode: ref,
      pageUrl: window.location.href
    })
  }).then(function() {
    sessionStorage.setItem('mealfred_ref_tracked_' + ref, '1');
  }).catch(function() {});
})();
