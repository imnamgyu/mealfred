/* ═══════════════════════════════════════════════════════
   밀프레드 랜딩페이지 — main.js (Unified Tabs)
   IntersectionObserver + GSAP (counters only) + Interactions
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ── CURRENT TAB STATE ──
  let currentTab = 'institution';

  // ── NAV SCROLL + FLOATING CTA ──
  const nav = document.querySelector('.nav');
  const floatInstitution = document.getElementById('float-institution');
  const floatHome = document.getElementById('float-home');

  function updateFloatingCta() {
    const scrollY = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPct = docHeight > 0 ? scrollY / docHeight : 0;
    const isVisible = scrollPct > 0.15;

    if (currentTab === 'institution') {
      floatInstitution.classList.toggle('visible', isVisible);
      floatHome.classList.remove('visible');
      floatInstitution.style.display = '';
      floatHome.style.display = 'none';
    } else {
      floatHome.classList.toggle('visible', isVisible);
      floatInstitution.classList.remove('visible');
      floatHome.style.display = '';
      floatInstitution.style.display = 'none';
    }
  }

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (scrollY > 60) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    updateFloatingCta();
  });

  // ── SMOOTH SCROLL NAV LINKS ──
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── MOBILE NAV TOGGLE ──
  const mobileToggle = document.querySelector('.nav-mobile-toggle');
  if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
      const activeNavLinks = document.querySelector('.nav-links:not(.nav-links-hidden)');
      if (activeNavLinks) {
        activeNavLinks.classList.toggle('mobile-open');
      }
    });
  }

  // ═══════════════════════════════════════════
  // TAB SWITCHING — disabled (now scroll-based layout)
  // Both sections are always visible, entry cards use scrollIntoView via inline onclick

  // ═══════════════════════════════════════════
  // SCROLL REVEAL (IntersectionObserver)
  // ═══════════════════════════════════════════

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  function initScrollReveals() {
    // Section headers — fade up
    document.querySelectorAll('.section-tag, .h1, .display, .desc').forEach(el => {
      if (!el.classList.contains('revealed')) {
        el.classList.add('reveal');
        revealObserver.observe(el);
      }
    });

    // Card groups — fade up with stagger delay
    const staggerSelectors = [
      '.problem-grid .problem-card',
      '.bento-grid .bento-card',
      '.steps-grid .step-card',
      '.hm-step-card',
      '.kpi-grid .kpi-card',
      '.discount-cards .discount-card',
      '.admin-checklist .admin-check',
      '.sample-list .sample-item',
      '.faq-list .faq-item',
      '.hm-guide-cards .hm-guide-card',
      '.hm-cost-cards .hm-cost-card',
      '.hm-product-grid .hm-p-card'
    ];

    staggerSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach((el, i) => {
        if (!el.classList.contains('revealed')) {
          el.classList.add('reveal');
          el.style.transitionDelay = `${i * 0.08}s`;
          revealObserver.observe(el);
        }
      });
    });

    // Menu cards — scale reveal with stagger
    document.querySelectorAll('.menu-grid .menu-card').forEach((el, i) => {
      if (!el.classList.contains('revealed')) {
        el.classList.add('reveal-scale');
        el.style.transitionDelay = `${i * 0.05}s`;
        revealObserver.observe(el);
      }
    });

    // Photo grid — scale reveal with stagger
    document.querySelectorAll('.photo-grid img').forEach((el, i) => {
      if (!el.classList.contains('revealed')) {
        el.classList.add('reveal-scale');
        el.style.transitionDelay = `${i * 0.06}s`;
        revealObserver.observe(el);
      }
    });

    // Delivery layers — slide from left with stagger
    document.querySelectorAll('.delivery-layer').forEach((el, i) => {
      if (!el.classList.contains('revealed')) {
        el.classList.add('reveal-left');
        el.style.transitionDelay = `${i * 0.1}s`;
        revealObserver.observe(el);
      }
    });

    // Quiz items
    document.querySelectorAll('.hm-qi').forEach((el, i) => {
      if (!el.classList.contains('revealed')) {
        el.classList.add('reveal-scale');
        el.style.transitionDelay = `${i * 0.06}s`;
        revealObserver.observe(el);
      }
    });

    // Exposure chart bars
    document.querySelectorAll('.hm-bar-row').forEach((el, i) => {
      if (!el.classList.contains('revealed')) {
        el.classList.add('reveal');
        el.style.transitionDelay = `${i * 0.1}s`;
        revealObserver.observe(el);
      }
    });
  }

  // Initial reveal setup
  initScrollReveals();

  // ═══════════════════════════════════════════
  // GSAP — counters & special animations only
  // ═══════════════════════════════════════════

  gsap.registerPlugin(ScrollTrigger);

  // ── COUNTER ANIMATION (KPI) ──
  const kpiNums = document.querySelectorAll('.kpi-num[data-target]');
  kpiNums.forEach(el => {
    const target = el.getAttribute('data-target');
    const suffix = el.getAttribute('data-suffix') || '';
    const prefix = el.getAttribute('data-prefix') || '';
    const isFloat = target.includes('.');
    const numTarget = parseFloat(target.replace(/,/g, ''));

    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      onEnter: () => {
        const obj = { val: 0 };
        gsap.to(obj, {
          val: numTarget,
          duration: 2,
          ease: 'power2.out',
          onUpdate: () => {
            if (isFloat) {
              el.textContent = prefix + obj.val.toFixed(1) + suffix;
            } else {
              el.textContent = prefix + Math.round(obj.val).toLocaleString() + suffix;
            }
          }
        });
      },
      once: true
    });
  });

  // ── TRUST BAR COUNTER ──
  const trustNums = document.querySelectorAll('.trust-stat-num[data-target]');
  trustNums.forEach(el => {
    const target = el.getAttribute('data-target');
    const suffix = el.getAttribute('data-suffix') || '';
    const numTarget = parseFloat(target.replace(/,/g, ''));

    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      onEnter: () => {
        const obj = { val: 0 };
        gsap.to(obj, {
          val: numTarget,
          duration: 1.8,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = Math.round(obj.val).toLocaleString() + suffix;
          }
        });
      },
      once: true
    });
  });

  // ── PROGRESS BAR ANIMATION ──
  document.querySelectorAll('.progress-fill').forEach(progressFill => {
    ScrollTrigger.create({
      trigger: progressFill,
      start: 'top 90%',
      onEnter: () => {
        progressFill.style.width = progressFill.getAttribute('data-width');
      },
      once: true
    });
  });

  // ── MENU FILTER ──
  const filterBtns = document.querySelectorAll('.menu-filter-btn');
  const menuCardEls = document.querySelectorAll('.menu-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const category = btn.getAttribute('data-filter');

      menuCardEls.forEach(card => {
        if (category === 'all' || card.getAttribute('data-category') === category) {
          card.style.display = '';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.9)';
          requestAnimationFrame(() => {
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
          });
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // ── TESTIMONIAL TABS ──
  const testimonialTabs = document.querySelectorAll('.testimonial-tab');
  const testimonialPanels = document.querySelectorAll('.testimonial-panel');

  testimonialTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      testimonialTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      testimonialPanels.forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-panel') === target);
      });
    });
  });

  // ── CURRICULUM TABS ──
  const curriculumTabs = document.querySelectorAll('.curriculum-tab');
  const curriculumPanels = document.querySelectorAll('.curriculum-panel');

  curriculumTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      curriculumTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      curriculumPanels.forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-panel') === target);
      });
    });
  });

  // ── FAQ ACCORDION ──
  document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.faq-item');
      const answer = item.querySelector('.faq-answer');
      const isOpen = item.classList.contains('open');
      const faqList = item.closest('.faq-list');

      // Close all within same FAQ list
      if (faqList) {
        faqList.querySelectorAll('.faq-item.open').forEach(openItem => {
          openItem.classList.remove('open');
          openItem.querySelector('.faq-answer').style.maxHeight = '0';
        });
      }

      // Toggle current
      if (!isOpen) {
        item.classList.add('open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });

  // ── CTA BUTTON PULSE (institution tab) ──
  gsap.to('#tab-institution .btn-primary', {
    boxShadow: '0 4px 14px rgba(255,107,26,0.3), 0 0 0 0 rgba(255,107,26,0)',
    repeat: -1,
    yoyo: true,
    duration: 2,
    ease: 'sine.inOut',
    keyframes: [
      { boxShadow: '0 4px 14px rgba(255,107,26,0.3), 0 0 0 0 rgba(255,107,26,0.15)', duration: 1 },
      { boxShadow: '0 4px 14px rgba(255,107,26,0.3), 0 0 0 8px rgba(255,107,26,0)', duration: 1 }
    ]
  });

  // ── HERO PARALLAX ──
  const heroBlob = document.querySelector('.hero-img-blob');
  if (heroBlob) {
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      if (scrollY < 800) {
        heroBlob.style.transform = `translate(${scrollY * 0.02}px, ${scrollY * 0.05}px)`;
      }
    });
  }

  // ═══════════════════════════════════════════
  // HOME TAB — QUIZ
  // ═══════════════════════════════════════════
  const quizItems = document.querySelectorAll('.hm-qi');
  const quizResult = document.getElementById('hm-quiz-result');
  const quizResultTitle = document.getElementById('hm-quiz-result-title');
  const quizResultDesc = document.getElementById('hm-quiz-result-desc');

  const quizData = {
    '당근': {
      title: '🥕 당근 5주 코스 (입문)',
      desc: '편식 스코어 62.4. 밀프레드 8개 제품 연계. 주황색 시각 거부 + 아삭 식감. 첫 편식 극복 경험 최적. 5주×주 3회=15회, 연구 권장 범위 최대치. 199,000원 · 회당 13,267원'
    },
    '양파': {
      title: '🧅 양파 5주 코스 (입문)',
      desc: '편식 스코어 50.5. 밀프레드 31개 제품 연계. 매운 향+눈물 반응. 볶으면 당도 8→40 Brix. 5주×주 3회=15회, 연구 권장 범위 최대치. 199,000원 · 회당 13,267원'
    },
    '두부': {
      title: '🧈 두부 5주 코스 (입문)',
      desc: '편식 스코어 46.6. 물렁 식감 주원인. 바삭 두부스테이크→순두부 순 식감 단계화. 5주×주 3회=15회, 연구 권장 범위 최대치. 199,000원 · 회당 13,267원'
    },
    '버섯': {
      title: '🍄 버섯 5주 코스 (도전)',
      desc: '편식 스코어 72.8 (1위). 식감+냄새 이중 거부. 미니 재배키트로 친밀감 형성. 5주×주 3회=15회, 연구 권장 범위 최대치. 199,000원 · 회당 13,267원'
    },
    '토마토': {
      title: '🍅 토마토 5주 코스 (도전)',
      desc: '편식 스코어 57.7. 산미+물컹 복합 거부. 소스→건조→생 형태 변환 전략. 5주×주 3회=15회, 연구 권장 범위 최대치. 199,000원 · 회당 13,267원'
    },
    '파프리카': {
      title: '🫑 파프리카 5주 코스 (도전)',
      desc: '편식 스코어 49.9. 풋내 주원인. 빨간 파프리카(단맛)부터 시작. 5주×주 3회=15회, 연구 권장 범위 최대치. 199,000원 · 회당 13,267원'
    },
    '시금치': {
      title: '🥬 시금치 5주 코스 (고급)',
      desc: '편식 스코어 61.6. 쓴맛+풀냄새+물컹 삼중 거부. 파우더→건조→신선 순. 5주×주 3회=15회, 연구 권장 범위 최대치. 199,000원 · 회당 13,267원'
    },
    '브로콜리': {
      title: '🥦 브로콜리 5주 코스 (고급)',
      desc: '편식 스코어 57.5. 전 세계 편식 연구 최다 거부 채소 1위. 5주×주 3회=15회, 연구 권장 범위 최대치. 199,000원 · 회당 13,267원'
    },
    '가지': {
      title: '🍆 가지 5주 코스 (고급)',
      desc: '편식 스코어 60.9. 보라색 시각 거부+물렁 식감. 바삭 가지칩→구이→볶음. 5주×주 3회=15회, 연구 권장 범위 최대치. 199,000원 · 회당 13,267원'
    }
  };

  quizItems.forEach(item => {
    item.addEventListener('click', () => {
      // Toggle selection
      quizItems.forEach(qi => qi.classList.remove('selected'));
      item.classList.add('selected');

      const ingredient = item.getAttribute('data-ingredient');
      const data = quizData[ingredient];

      if (data && quizResult && quizResultTitle && quizResultDesc) {
        quizResultTitle.textContent = data.title;
        quizResultDesc.textContent = data.desc;
        quizResult.style.display = '';
      }
    });
  });

  // ═══════════════════════════════════════════
  // HOME TAB — PRODUCT FILTER
  // ═══════════════════════════════════════════
  const hmFilterBtns = document.querySelectorAll('.hm-pf-btn');
  const hmProductCards = document.querySelectorAll('.hm-p-card');

  hmFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      hmFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');

      hmProductCards.forEach(card => {
        const categories = card.getAttribute('data-category') || '';
        if (filter === 'all' || categories.includes(filter)) {
          card.style.display = '';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          requestAnimationFrame(() => {
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
          });
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

});
