/**
 * lib/coachScenarios.ts — 코칭 시나리오 라이브러리 + 선택기 (편지 다양성 엔진).
 *
 * 문서: coaching-scenarios.html (35개 편식 국제이론 근거 워크플로 산출).
 * 목적: 편지가 매일 똑같아지지 않게, 데이터 신호로 '오늘의 시나리오' 1개를 결정론적으로 골라
 *       그 각도로만 편지를 쓰게 한다. 최근 2일 쓴 시나리오는 1차 제외(중복 차단).
 *
 * 트리거는 cron/coach가 이미 계산하는 신호(timeseries·reds·home*·refused·notes·favoriteFoods 등)에만 의존.
 * promptHint는 coach.ts buildLetterUser에 주입돼 LLM의 '오늘 편지 각도'를 잡는다(P1~P10 규칙은 그대로).
 */

export type CoachSignals = {
  timeseries: string[];
  reds: string[];
  homeReds: string[];
  missing: string[];
  homeMissing: string[];
  homeRefused: string[];
  daycareRefused: string[];
  refused: string[];
  notes: string[];
  favoriteFoods: string[];
  attendsDaycare: boolean;
  ageBand: string;
  recentLoggedDays: number;
  recentWindow: number;
  icfqRiskCount: number; // 최근 60일 ICFQ 위험 응답 수
};

export type CoachScenario = {
  id: string;
  label: string;
  priority: number;
  theoryBasis: string[];
  promptHint: string; // LLM 편지 각도 지시(간결)
  avoid: string;
  trigger: (s: CoachSignals) => boolean;
};

const has = (arr: string[] | undefined, ...kw: string[]) => (arr || []).some((x) => kw.some((k) => String(x).includes(k)));
const notesHit = (notes: string[] | undefined, ...kw: string[]) => (notes || []).some((n) => kw.some((k) => String(n).includes(k)));

// 우선순위 높을수록 먼저(진전 축하=최우선, 정체기=최종 폴백). 문서 §3 로테이션 규칙과 동일.
export const SCENARIOS: CoachScenario[] = [
  {
    id: 'progress-celebrate', label: '진전 축하', priority: 100,
    theoryBasis: ['반복 노출(HabEat)', '단순노출 효과', '신뢰 모델'],
    promptHint: `시계열에 '거부→수용 전환'이 있다. 오늘은 그 전환된 식재료를 콕 집어 '받아들이기 시작한 순간'으로 축하만 하라. 그것이 부모의 강요 없는 꾸준한 노출 덕임을 돌려주되, 새 행동·새 숙제를 절대 얹지 마라(축하 직후 압박은 강화를 깬다).`,
    avoid: `축하에 곧장 새 숙제 얹기, '드디어' 같은 그동안을 탓하는 뉘앙스.`,
    trigger: (s) => has(s.timeseries, '거부→수용 전환', '받아들이기 시작'),
  },
  {
    id: 'neophobia-arfid-watch', label: '신경성 회피 관찰', priority: 92,
    theoryBasis: ['ARFID 구분', '감각적 음식 거부', '구강운동'],
    promptHint: `식사 적신호(사레·헛구역질·먹는 종류 감소)가 누적됐다. 진단하지 말고, 비알람 톤으로 '대부분은 시간이 약이지만 이런 신호가 이어지면 소아과·섭식 전문가와 한번 이야기 나눠보는 것도 좋다'고 1회만 부드럽게 안내하라. '장애·진단' 단어 금지, 부모 탓이 아님을 강조.`,
    avoid: `편지로 진단, 정상 편식에 과잉 경보, 강제 한 입.`,
    trigger: (s) => s.icfqRiskCount >= 2,
  },
  {
    id: 'low-data-gap', label: '기록 공백', priority: 84,
    theoryBasis: ['신뢰 모델', '편식 궤적'],
    promptHint: `최근 기록 공백이 있어 강한 진단을 보류해야 한다. 공백을 다그치지 말고, 있는 기록 안에서 작은 강점 1개만 비추고, 맨 끝에 부담 없는 한 줄로 '기억나는 날 식단만 살짝 채워두시면 더 정확히 봐드릴게요'를 한 번만.`,
    avoid: `공백 추궁, 적은 데이터로 심한 편식 단정, 없는 거부·결핍 지어내기.`,
    trigger: (s) => s.recentLoggedDays < s.recentWindow,
  },
  {
    id: 'mealtime-atmosphere', label: '식사 분위기', priority: 72,
    theoryBasis: ['압박의 역효과', '자율성 지지(SDT)', '무압력 식사'],
    promptHint: `부모 메모에 식사 압박·전쟁·영상·그레이징 신호가 있다. 분위기를 바꾸는 단일 레버 1개만 제안: 압박이면 '오늘 하루 먹어봐 한마디도 안 하기', 영상이면 끄기, 그레이징이면 끼니 30분 전 간식 멈추기, 또는 부모가 먼저 맛있게 먹는 모습 보이기 중 하나.`,
    avoid: `여러 개선을 한꺼번에 요구, 먹었을 때 과한 보상.`,
    trigger: (s) => notesHit(s.notes, '전쟁', '실랑이', '강요', '억지', '영상', '유튜브', '안 먹', '다 먹'),
  },
  {
    id: 'reward-bribe-backfire', label: '보상·협상 역효과', priority: 70,
    theoryBasis: ['보상 역효과(과잉정당화)', '제한의 역효과'],
    promptHint: `부모 메모에 보상·디저트 협상 신호가 있다. 보상이 단기엔 먹여도 장기엔 그 음식 선호를 떨어뜨림을 부드럽게 알리고, 오늘 '이거 먹으면 ~줄게' 거래를 한 번도 안 하기 1개. 디저트는 채소 먹었는지와 무관하게 끼니 일부로 함께 내기.`,
    avoid: `채소→디저트 관문 거래 유지, 특정 음식 완전 금지.`,
    trigger: (s) => notesHit(s.notes, '줄게', '상으로', '스티커', '디저트', '약속', '보상'),
  },
  {
    id: 'autonomy-power-struggle', label: '자율성 다툼', priority: 66,
    theoryBasis: ['자율성 발달', 'SDT', 'Satter DOR'],
    promptHint: `광범위 거부 + 고집 신호이고 어린 연령대다. 거부가 맛이 아니라 '내가 정한다'는 발달 과업일 수 있음을 짚고, 결과는 같되 아이가 고르는 작은 선택권 1개('A랑 B 중 뭐 먼저?')를 주라.`,
    avoid: `강제 한 입, 비행기 놀이, 빈 그릇 요구, 착한 아이 보상.`,
    trigger: (s) => (s.ageBand === 'younger' || s.ageBand === '3-4y') && notesHit(s.notes, '고집', '싫', '실랑이', '안 먹') && s.refused.length >= 2,
  },
  {
    id: 'texture-refusal', label: '식감 거부', priority: 60,
    theoryBasis: ['감각적 음식 거부', 'SOS', '질감 단계'],
    promptHint: `식감 거부 신호(뱉음·헛구역질·물컹·오래 물기)가 있다. 싫은 게 '음식'이 아니라 '그 느낌(질감)'일 수 있음을 짚고, 이미 잘 먹는 음식 중 비슷하지만 한 단계 순한 질감으로 형태만 바꿔 제시 1개(푹 익혀 으깨거나 바삭하게 굽기). 거부 반응엔 바로 빼주기.`,
    avoid: `같은 질감 반복 강요, 헛구역질 무시, 몰래 섞어 속이기.`,
    trigger: (s) => notesHit(s.notes, '뱉', '헛구역', '물컹', '식감', '물고', '안 삼'),
  },
  {
    id: 'new-refusal', label: '새 식재료 거부', priority: 58,
    theoryBasis: ['음식 신공포증', '반복 노출(HabEat)', '압박 역효과'],
    promptHint: `최근 거부한 식재료가 있다. 거부를 '실패'가 아니라 '아직 처음 보는 것'으로 재정의해 먼저 안심시키고, 행동은 '며칠 간격(격일~주2~3회)으로 부담 없이 다시 식탁에 작게 올려두기' 1개. 향 맡기·만지기도 한 번의 노출로 친다고 알려라.`,
    avoid: `첫 노출에 '한 입만'·보상·'키 크려면' 압력, 한두 번 거부로 영구 제외.`,
    trigger: (s) => s.homeRefused.length + s.daycareRefused.length > 0,
  },
  {
    id: 're-exposure-timing', label: '거부 재노출', priority: 54,
    theoryBasis: ['반복 노출(HabEat)', '맛보기 우선'],
    promptHint: `거부했던 식재료(특히 기관에서 거부한 것)가 있다. 한 번 거부로 빼버리면 친해질 기회가 사라짐을 짚고, 격일로 아주 작은 양을 집에서 다시 만나게 하는 타이밍 1개. 무서워하면 보기→만지기→냄새 사다리부터.`,
    avoid: `한두 번 거부로 영구 제외, 매일 들이밀어 권태, 기관 급식에 재노출 요청.`,
    trigger: (s) => s.daycareRefused.length > 0,
  },
  {
    id: 'home-daycare-gap', label: '집-기관 격차', priority: 50,
    theoryBasis: ['Satter DOR', '수유 스타일', '식사 구조'],
    promptHint: `전체 영양은 괜찮은데 집 끼니에서 비는 식품군·결핍이 있다(기관 급식 덕). P10대로 '어린이집이 잘 챙겨준 덕'이라고 솔직히 인정하고, 집 아침·저녁에서 비는 한 식품군 1개에만 행동을 두라. 기관 메뉴 변경 요청 금지.`,
    avoid: `기관 덕을 부모 공으로 뭉뚱그린 칭찬, 기관 메뉴 변경 요청.`,
    trigger: (s) => s.attendsDaycare && (s.homeMissing.length > 0 || s.homeReds.length > 0) && s.missing.length === 0,
  },
  {
    id: 'nutrient-gap', label: '영양 공백', priority: 48,
    theoryBasis: ['푸드 체이닝', '맛-맛 연합', '반응적 수유'],
    promptHint: `집 끼니에 부족한 식품군·결핍 영양소가 있다(우리 분석값만 사용). 부족한 한 가지를 짚고, 그것을 채울 행동 1개를 푸드 브릿지로: 좋아하는 음식에 잘게 섞거나, 그 식품군으로 만들 음식 이름 1~2개(레시피 금지).`,
    avoid: `특정 식재료 영양가 단정, 없는 결핍 지어내기, '흰쌀밥을 줄이라'.`,
    trigger: (s) => s.homeReds.length > 0 || s.homeMissing.length > 0 || s.missing.length > 0,
  },
  {
    id: 'repeat-menu', label: '반복 메뉴', priority: 46,
    theoryBasis: ['푸드 체이닝', '단순노출', '신공포증'],
    promptHint: `집 끼니가 단조롭다(같은 메뉴 반복). 반복 자체를 탓하지 말고(익숙함=안전), 그 인기 메뉴를 '다리'로 써서 한 칸만 바꾸기 1개. 좋아하는 점(바삭함·색) 하나는 유지하고 새 재료 하나만 더하기.`,
    avoid: `좋아하는 반복 메뉴를 건강 핑계로 끊기, 한 번에 여러 개 변경, 김치·흰쌀밥 반복 지적.`,
    trigger: (s) => has(s.timeseries, '회 반복', '반복'),
  },
  {
    id: 'plateau', label: '정체기', priority: 30,
    theoryBasis: ['편식 궤적(자연 완화)', '신뢰 모델'],
    promptHint: `뚜렷한 새 신호가 없는 정체 구간이다. 오늘은 행동을 빼고, 잘하고 있는 것을 과거 편지와 다른 식재료·다른 측면으로 구체 칭찬만 하라. 편식은 주·월 단위 궤적이며 정체로 보이는 구간도 정상임을 짚어 안심시켜라.`,
    avoid: `같은 식재료·행동을 3일째 반복, 정체를 부정적으로 프레이밍.`,
    trigger: () => true, // 최종 폴백
  },
];

/**
 * 신호로 오늘의 시나리오 1개를 결정론적으로 선택.
 * recentIds = 최근 2일 편지가 사용한 scenarioId들 → 1차 제외(중복 차단).
 * 후보가 전부 최근이거나 하나뿐이면 그냥 최상위 사용(각도 변형은 프롬프트의 '중복 금지' 지침이 처리).
 */
export function selectScenario(s: CoachSignals, recentIds: string[]): CoachScenario {
  const recent = new Set((recentIds || []).filter(Boolean));
  const fired = SCENARIOS.filter((sc) => { try { return sc.trigger(s); } catch { return false; } })
    .sort((a, b) => b.priority - a.priority);
  const fresh = fired.filter((sc) => !recent.has(sc.id));
  return fresh[0] || fired[0] || SCENARIOS[SCENARIOS.length - 1];
}
