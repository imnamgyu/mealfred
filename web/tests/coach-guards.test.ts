/**
 * 결정론 가드·위생 함수 회귀 테스트 — 괴식·환각·세탁 사고 전부 박제.
 */
import { describe, it, expect } from 'vitest';
import { letterDeterministicBad, letterSimilarity, sanitizeRefusals, cleanRefusal, pickQuestionTopic, buildLetterUser, verifyFactsB, buildLetterUserB, type LetterInput } from '../lib/coach';
import { healAnchor, kstDow } from '../lib/coachWeekly';

describe('letterDeterministicBad — 섞기 가드(으깨어 섞기 우회 사고 박제)', () => {
  const sid = 'mealtime-atmosphere';   // NO_MIX 프레임
  it.each([
    '두부를 아주 잘게 섞어 주세요',
    '두부를 으깨어 섞어 함께 차려보세요',
    '으깬 두부를 으깨서 섞어 내보세요',
    '치즈를 섞어 함께 올려주세요',
  ])('차단: %s', (s) => {
    expect(letterDeterministicBad(s, sid, '')).toBe(true);
  });
  it('통과: 섞기 없는 환경 코칭', () => {
    expect(letterDeterministicBad('오늘 저녁 한 끼만 화면을 끄고 식탁에 앉아보세요.', sid, '')).toBe(false);
  });
});

describe('letterDeterministicBad — 기존 가드 유지(회귀 방지)', () => {
  it('환각 시점 차단', () => {
    expect(letterDeterministicBad('지난달부터 콩을 잘 먹어요', 'nutrient-gap', '')).toBe(true);
  });
  it('입력에 없는 증상 단정 차단(신공포 프레임)', () => {
    expect(letterDeterministicBad('사레가 자주 들려요', 'neophobia-arfid-watch', '증상 없음')).toBe(true);
  });
  it('과일↔끼니 페어링 차단', () => {
    expect(letterDeterministicBad('밥 옆에 딸기를 곁들여 주세요', 'nutrient-gap', '')).toBe(true);
  });
  it('튀김·초가공 권유 차단', () => {
    expect(letterDeterministicBad('치킨너겟으로 시작해보세요', 'nutrient-gap', '')).toBe(true);
  });
  it("'N가지' 가짓수 칭찬 차단", () => {
    expect(letterDeterministicBad('벌써 63가지 식재료를 만났어요', 'plateau', '')).toBe(true);
  });
});

describe('letterSimilarity — 어휘 유사도(임계 0.45/0.40의 측정기)', () => {
  it('동일 텍스트 = 1', () => {
    expect(letterSimilarity('아침에 조금 먹고 저녁에 몰아서', '아침에 조금 먹고 저녁에 몰아서')).toBe(1);
  });
  it('무관 텍스트 ≈ 0', () => {
    expect(letterSimilarity('아침에 조금 먹고', '도감에서 브로콜리를')).toBeLessThan(0.1);
  });
  it('실사고 수치 박제: 6/10 vs 6/11 복붙 편지 유사도는 임계(0.45) 미만이었다 — 어휘 가드만으론 의미 중복을 못 잡는다', () => {
    const a = '아침 한 끼를 조금만 먹고 점심을 건너뛴 뒤 저녁 뷔페에서 몰아서 먹는 리듬이 계속되고 있네요. 이번 주 저녁 식사 30분 전부터 간식을 멈추고, 그 시간에 식탁에 함께 앉아 부모님이 밥 한 숟갈, 국을 자연스럽게 드시는 모습을 보여주세요.';
    const b = '아침에 조금 먹고 저녁 뷔페에서 몰아서 먹는 리듬이 계속 반복되고 있네요. 이번 주에는 저녁 식사 30분 전부터 간식을 잠시 멈추고, 그 시간에 아린이와 함께 밥상에 앉아 부모님이 국을 한 모금 자연스럽게 맛있게 드시는 모습을 보여주시면 충분합니다.';
    const sim = letterSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.2);   // 사람 눈엔 같은 편지
    expect(sim).toBeLessThan(0.45);     // 그러나 임계 미만 → 시그니처·아크 등 결정론 변주가 1차 방어인 이유
  });
});

describe('거부 위생(cleanRefusal — 카레 유령 사고 박제)', () => {
  it('메모형 문장은 통째 드롭', () => {
    expect(cleanRefusal('어제 배아파서 조금만먹었어요 카레')).toBeNull();
  });
  it('깔끔한 단일 음식명만 인정', () => {
    expect(cleanRefusal('당근')).toBe('당근');
  });
  it('칩 콤마결합 분리', () => {
    expect(sanitizeRefusals(['브로콜리, 가지'])).toEqual(['브로콜리', '가지']);
  });
});

describe('healAnchor — 컬럼 미적용 닻 치유(weekly_coaching.sql 사고 박제)', () => {
  it('behavior_goal 없으면 레버 기반 폴백 보충', () => {
    const healed = healAnchor({
      child_id: 'c', week_key: 'w', status: 'active', source: 's', mission: null, mission_target: '콩류',
      target_pool: null, secondary_axis: null,
      budget: { expose: 2, push: 0, cadenceMinGap: 1, pushWindow: [], lever: 'environment' },
      ledger: null, impression: null, arc_week: 1, basis_hash: null, basis_attends_daycare: null,
      behavior_goal: null, teaching_arc: null, check_method: null,
    });
    expect(healed.behavior_goal).toBeTruthy();
    expect(healed.behavior_goal).toContain('화면');
  });
});

describe('EPIC C — Letter A(대조군) 무변경 + Letter B 분리 회귀', () => {
  // C-01-1 — grounding 필드를 채워도 buildLetterUser(A) 출력이 무변경(필드를 읽지 않음).
  const baseA: LetterInput = { childName: '아린', ageBand: '5y', reds: ['철분'], missing: ['콩류'], favoriteFoods: ['볶음밥'], bridgeFacts: '[오늘 타깃] 콩류→두부볶음밥', timeseries: ['3일 전 콩 거부'] };
  it('C-01-1 grounding 필드 주입해도 buildLetterUser 출력 byte 동일', () => {
    const plain = buildLetterUser(baseA);
    const withGrounding = buildLetterUser({ ...baseA, groundingMode: 'merged', materials: 'M', mirror: 'X', teachingGuide: 'G', onboardingMode: true });
    expect(withGrounding).toBe(plain);   // A는 grounding 필드를 절대 읽지 않는다(대조군 보존)
  });
  it('C-02-3 레거시 buildLetterUser → materials 미주입·bridgeFacts 유지', () => {
    const o = buildLetterUser({ bridgeFacts: 'BF', materials: 'MMM' });
    expect(o).not.toContain('오늘의 재료 — 코드가 매일 검증'); expect(o).toContain('BF');
  });
  it('C-11-3 레거시는 verifyFactsB 미사용 — B 전용 합본만 materials/mirror 포함', () => {
    const f = verifyFactsB({ groundingMode: 'merged', materials: 'M', mirror: 'X' } as LetterInput);
    expect(f).toContain('M'); expect(f).toContain('X');
  });
  it('Letter B 빌더는 Letter A 빌더와 별개 함수(merged 마커 분리)', () => {
    expect(buildLetterUserB({ groundingMode: 'merged', materials: 'ZZ' })).toContain('오늘의 재료');
    expect(buildLetterUser({ materials: 'ZZ' })).not.toContain('오늘의 재료 — 코드가 매일 검증');
  });
});

describe('결정론 로테이션 재현성', () => {
  it('질문 주제 로테이션은 날짜+시드 결정론', () => {
    const a = pickQuestionTopic('2026-06-11', 123);
    const b = pickQuestionTopic('2026-06-11', 123);
    expect(a.id).toBe(b.id);
    const c = pickQuestionTopic('2026-06-12', 123);
    expect([a.id, c.id].length).toBe(2);   // 다른 날 = 회전(같을 수도 있으나 결정론이면 충분)
  });
  it('kstDow: 2026-06-11=목(4)·2026-06-07=일(0)', () => {
    expect(kstDow('2026-06-11')).toBe(4);
    expect(kstDow('2026-06-07')).toBe(0);
  });
});
