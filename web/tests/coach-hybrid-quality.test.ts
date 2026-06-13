/**
 * tests/coach-hybrid-quality.test.ts — EPIC H · 품질 스캔·무검증 채널 봉합 (H-05·H-06)
 *
 * 개선 G(검증 비대칭 닫기 — LLM 출력 품질축 결정론 스캔)와 H(무검증 채널 차단 — 거울·추천 합본 1패스)를
 *   박제. '테스트 그린인데 이사님은 별로'를 깨는 4스캐너(은유 과용·끼니 나열·모호 기간어·재료 밖 음식명)와,
 *   거울/추천 슬롯값이 발행 직전 가드를 우회하지 못함(combineForVerify 합본)을 검출+오탐방지로 잠근다.
 *
 * 실제 엔진은 coachGrounding.qualityScan({letter, materialFoods})가 Letter B 스캔 진입점(EPIC D
 *   letterQualityScan 재사용 + 단문 나열 보강). 합본은 coachQuality.combineForVerify로 만든다(라이브 무수정·import만).
 */
import { describe, it, expect } from 'vitest';
import { qualityScan } from '../lib/coachGrounding';
import { combineForVerify, offMaterialFood } from '../lib/coachQuality';

const scan = (letter: string, materialFoods: string[] = []) => qualityScan({ letter, materialFoods });
const has = (rs: string[], frag: string) => rs.some((r) => r.includes(frag));

// ── H-05 — 4스캐너 검출 + 오탐방지 ─────────────────────────────────────────────────
describe('HB-05 qualityScan 4축 (H-05)', () => {
  it('HB-05-1 은유 과용 검출(통장+계단 2종)', () => {
    expect(has(scan('편식은 통장 같아요. 한 걸음씩 계단을 올라요'), '은유')).toBe(true);
  });
  it('HB-05-2 은유 1개 자연 비유는 통과(오탐방지)', () => {
    expect(has(scan('오늘은 작은 한 걸음을 권해요'), '은유')).toBe(false);
  });
  it('HB-05-3 동일 은유 반복도 과용으로 검출', () => {
    expect(has(scan('통장에 쌓이듯, 통장처럼 모이듯 채워가요'), '은유')).toBe(true);
  });
  it('HB-05-4 끼니 나열 패턴 검출(어제 X·Y·Z 먹었어요)', () => {
    expect(has(scan('어제 당근·브로콜리·밥을 먹었어요'), '나열')).toBe(true);
  });
  it('HB-05-5 나열 아님(행동 권유)은 통과(오탐방지)', () => {
    expect(has(scan('오늘 저녁 당근을 볶음밥에 넣어보세요', ['당근', '볶음밥']), '나열')).toBe(false);
  });
  it('HB-05-6 모호 기간어 요즘 단독 검출', () => {
    expect(has(scan('요즘 채소가 부족해요'), '모호 기간어')).toBe(true);
  });
  it('HB-05-7 수치 동반 기간은 통과(오탐방지)', () => {
    expect(has(scan('최근 7일 중 비타민A 채소가 3일이었어요'), '모호 기간어')).toBe(false);
  });
  it('HB-05-8 이번주·최근 단독도 검출', () => {
    expect(has(scan('이번주는 좀 아쉬웠어요'), '모호 기간어')).toBe(true);
  });
  it('HB-05-9 재료 밖 음식명 검출(materials 밖 시금치파스타)', () => {
    expect(has(scan('시금치파스타를 해주세요', ['당근', '볶음밥']), '목록 밖 음식')).toBe(true);
  });
  it('HB-05-10 재료 안 음식명은 통과(오탐방지)', () => {
    expect(scan('볶음밥에 당근을 넣어보세요', ['당근', '볶음밥'])).toEqual([]);
  });
  it('HB-05-11 빈 편지·null 안전(throw 0)', () => {
    expect(() => scan('')).not.toThrow();
    expect(scan('')).toEqual([]);
    expect(() => qualityScan({ letter: null as unknown as string, materialFoods: [] })).not.toThrow();
  });
  it('HB-05-12 복합 위반 동시 검출(은유+나열+모호기간 >=3)', () => {
    const rs = scan('통장처럼 계단을 오르듯. 어제 당근·밥·국을 먹었어요. 요즘 채소가 비어요');
    expect(rs.length).toBeGreaterThanOrEqual(3);
  });
  it('HB-05-13 깨끗한 모범 편지는 빈 배열(종합 오탐방지)', () => {
    const clean = '최근 7일 중 비타민A 채소가 1일이었어요. 오늘 저녁 볶음밥에 당근을 한 스푼 넣어보세요. 당근은 베타카로틴이 눈·면역에 좋아요.';
    expect(scan(clean, ['당근', '볶음밥'])).toEqual([]);
  });
  it('HB-05-14 LLM 0콜(동기 반환·Promise 아님)', () => {
    const r = scan('요즘');
    expect(Array.isArray(r)).toBe(true);
    expect(typeof (r as unknown as { then?: unknown }).then).toBe('undefined');
  });
});

// ── H-06 — 무검증 채널 차단(거울·추천 합본 1패스) ─────────────────────────────────
describe('HB-06 combineForVerify 합본 검증 (H-06)', () => {
  // 본문은 깨끗, 거울에 괴식(미역국=materials 밖)·추천에 위반을 심어 합본 검사가 잡는지.
  const materials = ['당근', '볶음밥', '시금치'];
  const verify = (parts: { body: string; mirror?: string | null; recommendations?: string[] | null }) =>
    scan(combineForVerify(parts.body, { mirror: parts.mirror, recommendations: parts.recommendations }), materials);

  it('HB-06-1 거울 속 괴식(미역국·materials 밖) 검출(합본)', () => {
    const rs = verify({ body: '식탁에 함께 앉아보세요', mirror: '미역국에 당근을 넣어 보세요', recommendations: [] });
    expect(rs.length).toBeGreaterThan(0);
    expect(has(rs, '목록 밖 음식')).toBe(true);
  });
  it('HB-06-2 본문만 검증하면 통과하던 것이 합본으로 차단(무검증 채널 닫힘 회귀)', () => {
    const body = '식탁에 함께 앉아보세요';
    expect(scan(body, materials)).toEqual([]);                                   // 본문만 = 깨끗
    const composite = scan(combineForVerify(body, { mirror: '미역국조림을 권해요' }), materials);
    expect(composite.length).toBeGreaterThan(0);                                 // 합본 = 거울 괴식 잡힘
  });
  it('HB-06-3 추천 문장의 모호 기간어 검출', () => {
    const rs = verify({ body: '오늘 한 스푼만 권해요', mirror: null, recommendations: ['요즘 채소가 비어요'] });
    expect(has(rs, '모호 기간어')).toBe(true);
  });
  it('HB-06-4 전부 깨끗 → 빈 배열(오탐방지)', () => {
    const rs = verify({ body: '오늘 저녁 한 스푼만 권해요', mirror: '볶음밥에 당근을 곁들여요', recommendations: ['시금치도 좋아요'] });
    expect(rs).toEqual([]);
  });
  it('HB-06-5 거울 null 안전(throw 0·본문만 검증)', () => {
    expect(() => combineForVerify('본문', { mirror: null, recommendations: null })).not.toThrow();
    expect(combineForVerify('본문', { mirror: null, recommendations: null })).toBe('본문');
  });
  it('HB-06-6 슬롯값이 materials 안 음식만이면 재료밖 위반 0', () => {
    const rs = verify({ body: '오늘도 잘 하고 있어요', mirror: '볶음밥에 시금치를 더해요', recommendations: ['당근도 권해요'] });
    expect(has(rs, '목록 밖 음식')).toBe(false);
  });
});

// ── 발견 결함 박제 — offMaterialFood '전(jeon)' 접미 과탐(도전·발전 등 동음 명사) ──────
// 30가정 통주 중 EPIC H 게이트가 적발: buildReasonPhrases의 '닮은 단호박도 도전해볼 만해요'가
//   offMaterialFood의 DISH_SUFFIX([가-힣]{1,6}전)에 '도전'(challenge)·'발전'(progress)으로 걸려
//   재료 밖 음식명 거짓 양성을 낸다. 라이브 스캐너(EPIC D) 한계 — Letter B 하네스(lib/replayB)는
//   품질 스캔 입력에서 자유 서술(rationale prose)을 빼고 '구조화된 음식 표면'(조합·기간·타깃)만 검사해
//   이 과탐을 우회한다(serializeMaterials rationale='' 분리). 아래는 현 동작을 회귀로 박제 — 미래에
//   스캐너가 동음 명사를 면제하도록 고치면 이 테스트가 의도적으로 빨개진다(개선 신호).
describe('HB-FINDING offMaterialFood 전-접미 동음 과탐(라이브 스캐너 한계 박제)', () => {
  it('현 동작: 도전·발전이 음식명으로 과탐됨(하네스가 입력 분리로 우회)', () => {
    expect(offMaterialFood('단호박도 도전해볼 만해요', ['단호박'])).toContain('도전');
    expect(offMaterialFood('아이가 발전했어요', [])).toContain('발전');
  });
  it('우회 검증: rationale 자유 서술을 뺀 구조화 음식 표면은 과탐 0', () => {
    // 실 하네스가 쓰는 입력 형태(조합·기간·타깃만, 서술 prose 제외) → 깨끗
    const structured = '[오늘 타깃] 비타민A채소 — 단호박\n검증된 조합(점수순): 카레+단호박(3)·볶음밥+단호박(2)\n기간: 비타민A채소 최근 7일 중 4일(권장 주 5일)';
    expect(qualityScan({ letter: structured, materialFoods: ['단호박', '카레', '볶음밥'] })).toEqual([]);
  });
});
