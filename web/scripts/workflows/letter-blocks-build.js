// scripts/workflows/letter-blocks-build.js — 블록 라이브러리 제작 워크플로 (WBS C-04 템플릿 정본 · C-05~C-18 실행기)
// Claude Code Workflow 도구 스크립트(플레인 JS — 리포 직접 실행 아님). 재실행: Workflow({scriptPath: 이 파일}).
// 산출 = { blocks, report } — 메인 루프가 lib/letter-blocks.json에 머지하고 tests/blocks.test.ts(C-19)가 최종 게이트.
// 프리린트 규칙은 lib/letterBlocks.ts BLOCK_FORBID와 패리티(여기가 더 엄격한 건 허용·느슨한 건 금지).
export const meta = {
  name: 'letter-blocks-build',
  description: '조립식 편지 블록 풀 제작 — 13 제작 + 수리 + 도입 다양화 + 6렌즈 적대검수 + 보충',
  phases: [
    { title: 'Produce', detail: '유닛 12 + 공용 1 제작(평면 스키마·프리린트)' },
    { title: 'Repair', detail: '위반 블록 재작성 ≤2라운드 + 부족분 보충' },
    { title: 'Diversify', detail: '풀 전체 동일 도입 15자 ≤2 재작성' },
    { title: 'Adversarial', detail: '6렌즈 적대검수 — 위반은 수정 아닌 삭제' },
    { title: 'Refill', detail: '커버리지 보충 + 최종 린트' },
  ],
};

// ── 상수 ──────────────────────────────────────────────────────────────────────
const UNIT_STAGES = ['intro', 'why', 'how', 'observe', 'obstacle', 'advance', 'praise', 'pivot'];
const COMMON_STAGES = ['plateau', 'celebrate', 'lowdata', 'graduate', 'pivot-bridge', 'opener-weekday'];
const TARGET_UNIT = { intro: 4, why: 4, how: 5, observe: 5, obstacle: 4, advance: 5, praise: 5, pivot: 4 };
const TARGET_COMMON = { 'opener-weekday': 12, plateau: 5, celebrate: 5, lowdata: 4, graduate: 5, 'pivot-bridge': 5 };
const MIN_UNIT = 3, MIN_OPENER = 8, MIN_COMMON = 3;
const FOOD_UNITS = ['exposure-savings', 'food-bridge', 'link-rhythm'];

const UNITS_DATA = [
  { id: 'pressure-off', label: '압박 내려놓기', food: false,
    steps: ['"한 입만"·재촉 멘트 멈추기(남겨도 담담히)', '식탁 분위기를 압박 없이 유지(환호·박수도 담담하게)'],
    guide: 'Satter 역할분담(sDOR): 부모는 무엇·언제·어디서를, 아이는 먹을지·얼마나를 정한다. 어른은 방향을 잡고 아이는 속도를 정한다. 재촉·부탁·조건이 모두 압박이고, 과한 환호·박수도 부담이 된다(담담한 인정이 가장 안전한 칭찬). 남긴 접시를 담담히 치우는 모습이 아이의 긴장을 푼다.',
    ban: '압박 멘트를 예시·인용으로도 절대 쓰지 않는다(따라 말할 위험). 부모 죄책감 유발 금지.' },
  { id: 'hunger-rhythm', label: '공복 리듬', food: false,
    steps: ['끼니 직전 간식·우유 멈추기', '식사·간식 간격을 두세 시간 리듬으로'],
    guide: '식사와 간식 사이 두세 시간 리듬(WIC). 끼니 직전 간식·우유를 멈추면 식탁에 앉을 때 배고픔이 제때 살아난다. 식간에는 물만. 굶기는 게 아니라 배고픔의 리듬을 돌려주는 일.',
    ban: "'굶기세요' 어감 금지('배고픔이 살아나게' 프레임으로). 구체 시각·분 숫자 금지(한글 수사로)." },
  { id: 'table-stage', label: '식탁 무대', food: false,
    steps: ['하루 한 끼 화면 끄고 식탁에서', '주 다섯 끼 이상 같은 자리·같은 시간'],
    guide: '먹는 자리와 시작 신호의 일관성. 같은 자리, 수저 놓기 같은 짧은 시작 의식, 짧고 즐겁게 끝내기. 식탁이 예측 가능한 무대가 되면 새로운 음식을 받아들일 여유가 생긴다.',
    ban: "화면·영상·TV류 단어는 intro 스테이지에서만 허용. 다른 스테이지는 그 단어 없이 표현하라('조용한 식탁'·'시선을 끄는 것 없이' 등) — 기계 검수가 차단한다." },
  { id: 'exposure-savings', label: '노출 적금', food: true,
    steps: ['타깃을 아주 작은 양으로 말없이 식탁에(격일)', '노출 적립 이어가기 + 티스푼 맛보기 초대'],
    guide: '노출 적금: 새 음식은 여러 번 만나야 받아들인다(USDA NESR). 향 맡기·만지기·입에 댔다 뱉기도 전부 한 번의 노출로 적립된다 — 거부는 실패가 아니라 적립. 보기→만지기→냄새→맛의 감각 위계. 강요 없는 티스푼 맛보기 초대. 중간에 정체가 와도 정상이라고 예고해 안심시킨다.',
    ban: "'꼭 먹여야' 금지. 횟수·차수 숫자 금지(누적·통계는 {fact}로만 들어온다). 음식 이름은 {food} 슬롯으로만." },
  { id: 'fullness-respect', label: '배부름 존중', food: false,
    steps: ['"배불러" 인정하고 종료(완식 강요 멈추기)', '적게 담고 더 달라면 추가, 길어지면 부담 없이 정리'],
    guide: "적게 담고 더 달라면 추가하는 방식. 아이가 그만 먹겠다는 신호를 그대로 인정하고 마무리한다 — 배부름 감각을 존중받은 아이가 식사를 신뢰한다. 길어진 식사는 부담 없이 정리하고 다음 끼니를 기다린다.",
    ban: "'남기면 안 돼' 류 금지. 분 단위 숫자 금지." },
  { id: 'parent-model', label: '부모가 메뉴판', food: false,
    steps: ['같은 음식을 곁에서 말없이 맛있게(하루 한 번)', '가족 저녁을 더 자주(배달·간단식도 OK)'],
    guide: '부모가 같은 음식을 곁에서 말없이 맛있게 먹는 모습이 가장 강력한 한 가지 방법. 가족 식사는 형식이 아니라 관계 — 배달이어도, 간단해도 함께면 충분한 가치가 있다. 권하지 않고 보여주기만 한다.',
    ban: "'주 N회 의무' 같은 숫자·의무 어조 금지. '모델링' 같은 전문용어 금지(쉬운 말로)." },
  { id: 'no-bargain', label: '달콤한 협상 끊기', food: false,
    steps: ['조건 걸기(거래) 멈추기', '디저트 지위 중립화(소량을 끼니와 함께, 악마화 금지)'],
    guide: "'먹으면 ~을 받는' 조건 걸기는 음식의 가치를 왜곡한다 — 채소는 벌처럼, 달콤한 것은 상처럼 보이게 만든다. 디저트는 벌도 상도 아닌 중립: 소량을 끼니의 일부로 담담히 낸다. 금지하고 숨길수록 더 간절해진다(제한의 역효과).",
    ban: "달콤한 간식 악마화 금지. 거래 대사 인용 금지. 구체 간식명 금지('달콤한 간식' 같은 일반어로)." },
  { id: 'table-talk', label: '식탁의 말', food: false,
    steps: ['금지어 끊기', '객체 중심 질문으로 바꾸기(맛·색·소리가 어땠는지)'],
    guide: "식탁의 말을 음식이라는 '객체'로 돌린다: 얼마나 먹었는지 대신 맛·색·소리·온도가 어땠는지 가볍게 묻는다(평가가 아닌 호기심). 아이의 먹는 양·태도를 화제로 삼지 않는 것이 핵심.",
    ban: "정체성 라벨(편식가 규정) 예문 금지. 질문 예시에 구체 음식명 금지 — '오늘 반찬'·'새로 만난 음식' 같은 일반어로(이 주제는 {food} 슬롯도 금지)." },
  { id: 'sensory-texture', label: '감각·질감 트랙', food: false,
    steps: ['한 끼만 한 단계 위 질감(거부하면 즉시 후퇴)', '일반식 비중 천천히 올리기'],
    guide: '감각 위계: 같이 있기→보기→만지기→냄새→입에 대기→씹기. 한 번에 반 걸음만, 거부하면 즉시 한 단계 후퇴(후퇴는 실패가 아님). 먹기 전에 손으로 만지고 향을 맡는 것만으로도 전진. 식사 전 몸을 크게 움직이는 놀이가 감각 수용을 돕는다.',
    ban: "'치료' 단어 금지. 단계 숫자 금지." },
  { id: 'food-bridge', label: '확장 트랙(음식 다리)', food: true,
    steps: ['잘 먹는 음식의 사촌 한 가지를 식탁에(한 축만 변형)', '사슬 다음 칸으로(찍어먹기 짝짓기 활용)'],
    guide: '푸드 체이닝: 잘 먹는 음식에서 색·온도·질감·맛 중 한 축만 바꾼 사촌으로 잇는다. 좋아하는 소스에 찍어 먹기는 맛과 맛을 잇는 가장 쉬운 다리. 새 음식은 익숙한 것 옆에 둘 때 덜 낯설다.',
    ban: '음식명 하드코딩 금지 — {food} 슬롯으로만. 목록 밖 조합 창작 금지.' },
  { id: 'autonomy-part', label: '자율성·참여 트랙', food: false,
    steps: ['두 가지 중 아이가 고르게 + 하루 한 끼 스스로 떠먹기', '셀프 서빙·상차림 역할 주기'],
    guide: "작은 선택권(두 가지 중 고르기), 스스로 떠먹기, 수저 놓기·채소 씻기 같은 작은 역할. '내가 정했다'는 감각이 식욕과 시도를 키운다. 흘리는 건 배우는 중이라는 신호.",
    ban: "'흘리면 안 돼' 금지. 통제 어조 금지." },
  { id: 'link-rhythm', label: '연계·리듬 트랙', food: true,
    steps: ['기관에서 거부한 식재료를 집에서 저압력으로 다시', '격일 리듬으로 재노출 이어가기'],
    guide: '어린이집에서 거부한 음식을 집에서 부담 없이 다시 만나게 한다. 며칠 간격(격일쯤)이 적당하고, 매일 들이밀면 오히려 물린다(권태 효과). 기관과 집은 한 팀 — 집은 압력 없는 재시도 무대.',
    ban: '기관(어린이집·선생님) 비판·평가 어조 금지.' },
  { id: 'common', label: '공용 블록', food: false, steps: [],
    guide: ['plateau: 잔잔한 구간 칭찬 — 태도·꾸준함만. 식단이 완성됐다는 단정 금지.',
      'celebrate: 반가운 변화를 함께 기뻐하기 — 행동 요청 없이 축하만.',
      'lowdata: 기록이 빈 날의 따뜻한 권유 — "기억나는 만큼만". 다그침 금지.',
      'graduate: 한 가지가 몸에 붙었음을 축하 — 무엇이 끝났는지 내부 개념 없이("이제 자연스러워졌어요" 톤).',
      "pivot-bridge: 주제 전환 연결문 — '한 가지를 찬찬히 살펴봤으니 이번엔 결이 다른 걸음을' 류. 직전 주제를 명시하지 않는 일반형.",
      'opener-weekday: 데이터 무관 워밍 도입 한 문장 — 계절·날씨·요일 언급 없이 보편적으로. 12종 전부 다른 첫 어절과 다른 문형.'].join('\n'),
    ban: "plateau에 '충분' 금지. graduate에 내부 개념(단계·진도류 뉘앙스) 금지." },
];

const SLOT_GUIDE = [
  '슬롯(치환 토큰): {name}=아이 이름 · {fact}=코드가 계산한 사실 산문(한 문장, "~했어요" 꼴) · {next}=다음 걸음 행동구("~하기" 명사구) · {food}=음식 이름(화이트리스트에서 주입).',
  '조사 토큰: {이가} {은는} {을를} {과와} {으로} — 슬롯 바로 뒤에만 사용("{name}{이가} 어제…" → 아린이가/지호가).',
  '⛔ 슬롯 바로 뒤에 조사를 직접 붙이지 마라("{food}를" ❌ → "{food}{을를}" ✓). 받침에 따라 깨진다.',
  '{fact}는 문장이 들어오니 "기록을 보니 {fact}."처럼 마침표로 받기. {next}는 "오늘은 {next} 차례예요"처럼 구로 받기.',
  '사용한 슬롯은 전부 slots 배열에 선언. observe 블록은 requires:["fact"], advance 블록은 requires:["next"] 필수.',
].join('\n');

const STAGE_GUIDE = [
  'intro: 이번 주 이 주제로 부드럽게 초대. 4개 중 2개는 {fact}를 인용(slots+requires에 fact), 2개는 슬롯 없이.',
  'why: 이 걸음이 아이에게 왜 도움이 되는지 원리를 한 입 크기로. 관찰 사실·통계 언급 금지.',
  'how: 행동 직전·직후의 구체 장면 하나. 행동은 1개만.',
  'observe: {fact}(어제의 사실)에 따뜻하게 반응. 전부 slots:["fact"]+requires:["fact"].',
  'obstacle: 흔히 막히는 순간 하나에 공감 + 그 순간의 대처 1개.',
  'advance: 어제 걸음을 인정하고 {next}를 다음 걸음으로 제시. 전부 slots:["next"]+requires:["next"].',
  'praise: 부모의 실행을 담담하고 구체적으로 강화(과장 환호 금지·사실 단정 없이).',
  'pivot: 이 주제를 잠시 접고 쉬어가는 안내(아쉬움·실패감 없이).',
].join('\n');

const CHECKLIST = [
  '숫자(아라비아)·% 금지 — 횟수·통계·시각은 {fact}·{next} 슬롯으로만 들어온다(한글 수사는 최소한으로).',
  '체중·몸무게·다이어트·비만·BMI·칼로리 금지.',
  '의학 단어(진단·처방·치료·증상·결핍·영양제·장애) 금지.',
  "내부 개념(점수·등급·미션·과제·챌린지·숙제·목표·수업·진도·커리큘럼) 금지 — 부모는 '자연스러운 편지'만 본다.",
  '매운 것·튀김·초가공(과자·사탕 등 구체 간식명 포함) 권유 금지.',
  "빈도 단정어(항상·매일·맨날·날마다·계속·늘) 금지 — 시계열 라벨은 {fact}가 가져온다.",
  '압박 문구("한 입만"·"다 먹어야"·"안 먹으면") 인용 금지.',
  '지시·압박 어조(해야 해요·먹여야·반드시·혼내·다그치·왜 안) 금지. 거래 대사(줄게·보상으로) 금지.',
  '아이에게 주체높임(-시-) 금지(부모에게는 존댓말).',
  '음식 이름 하드코딩 금지(두부·콩·당근·우유·김치 등) — 음식은 {food} 슬롯으로만.',
  '줄표(—·–) 금지: 마침표로 끊기. 이모지 금지.',
  '한 블록 1~2문장(최대 3문장), 길이 20~90자(슬롯 토큰 포함). 블록 안에서 같은 종결어미 3연속 금지.',
  '한 블록 한 행동 — 행동 제안은 블록당 최대 1개.',
  '같은 스테이지 변형끼리 첫 어절을 전부 다르게, 문형도 서로 확연히 다르게(복붙 변형 금지).',
  '따뜻한 존댓말(-요 체), 부모 죄책감 유발 금지, 과장 환호 금지.',
].map((s, i) => `${i + 1}. ${s}`).join('\n');

const TONE_ANCHOR = [
  '— 톤 기준(기존 코칭 문구 발췌, 이 결을 따르되 표현은 새로): —',
  '"말 걸지 않고, 부모가 곁에서 같은 음식을 자연스럽게 맛있게 먹는 모습 보여주기"',
  '"아이에게 수저·컵 놓기를 맡겨 \\"이제 식사 시간\\"이라는 작은 신호 만들기"',
  '"잘 안 되는 날도 있지요. 그런 날은 한 템포 쉬어가도 괜찮아요."',
  '"거부해도 한 번의 만남으로 쌓여요. 오늘은 식탁에 함께 있는 것만으로도 충분한 진도예요."(※ plateau 외에는 \'충분\' 사용 가능하나 남용 금지)',
].join('\n');

// ── 프리린트(플레인 JS — lib/letterBlocks.ts와 패리티) ─────────────────────────
const RULES = [
  [/[0-9０-９%]/, '숫자·% 금지'],
  [/체중|몸무게|다이어트|비만|BMI|칼로리/, '체중·수치 단어'],
  [/진단|처방|치료(?!사)|증상|결핍|영양제|장애(?!물)/, '의학 단어'],
  [/점수|등급|미션|과제|챌린지|숙제|목표|수업|진도|커리큘럼/, '내부 개념 노출'],
  [/맵|매운|고추|불닭|까스|너겟|핫도그|튀김|소시지|어묵|과자|사탕|초콜릿|젤리|탄산/, '매운·튀김·초가공'],
  [/항상|매일|맨날|날마다|계속|늘\s/, '빈도 단정어'],
  [/한\s?입만|다\s?먹어야|안\s?먹으면/, '압박 문구 인용'],
  [/해야\s?(해요|합니다|돼요)|먹여야|반드시|혼내|다그치|왜\s?안/, '지시·압박 어조'],
  [/줄게|보상으로/, '거래·보상 대사'],
  [/\{name\}[^.!?]{0,16}(드시|잡수|좋아하시|먹으시|하셨)/, '아이 주체높임'],
  [/두부|콩(?!기름)|당근|브로콜리|시금치|고등어|연어|멸치|새우|계란|달걀|우유|치즈|요거트|요구르트|버섯|감자|고구마|토마토|오이|사과|바나나|딸기|포도|수박|멜론|배추|깍두기|김치|된장|두유/, '음식명 하드코딩'],
  [/\{(name|fact|next|food)\}(이가|이는|이를|이와|이로|가|이|는|은|를|을|와|과|로|랑)(?=[\s.,!?…]|$)/, '슬롯 뒤 조사 하드코딩'],
  [/—|–/, '줄표 금지'],
  [/지난\s?달|지난\s?주|몇\s?달|개월|한\s?달\s?전|몇\s?주|작년/, '환각 시점 표현'],
  [/[\u{1F300}-\u{1FAFF}☀-➿]/u, '이모지 금지'],
];
const SCREEN_RE = /화면|영상|티비|TV|텔레비전|태블릿|스마트폰|휴대폰|유튜브/;
const MIX_RE = /섞|버무리/;
const PLATEAU_RE = /충분|가지\s?(식재료|음식)/;
const SLOT_RE = /\{(name|fact|next|food)\}/g;
const TONES = ['warm', 'praise', 'empathy'];

function lintOne(b) {
  const issues = [];
  const t = b.text || '';
  for (const [re, why] of RULES) if (re.test(t)) issues.push(why);
  if (SCREEN_RE.test(t) && !(b.unit === 'table-stage' && b.stage === 'intro')) issues.push('화면 단어는 table-stage.intro만');
  if (MIX_RE.test(t) && !(FOOD_UNITS.includes(b.unit) && ['how', 'advance', 'obstacle'].includes(b.stage))) issues.push('섞기 표현 스테이지 위반');
  if (b.stage === 'plateau' && PLATEAU_RE.test(t)) issues.push("plateau '충분'·가짓수 금지");
  if (t.length < 20 || t.length > 90) issues.push(`길이 ${t.length}자(20~90)`);
  const stages = b.unit === 'common' ? COMMON_STAGES : UNIT_STAGES;
  if (!stages.includes(b.stage)) issues.push(`스테이지 위반: ${b.stage}`);
  if (!TONES.includes(b.tone)) issues.push(`tone 위반: ${b.tone}`);
  const used = [...new Set([...t.matchAll(SLOT_RE)].map((m) => m[1]))];
  const declared = Array.isArray(b.slots) ? b.slots : [];
  for (const u of used) if (!declared.includes(u)) issues.push(`미선언 슬롯 {${u}}`);
  for (const d of declared) if (!used.includes(d)) issues.push(`미사용 슬롯 선언 ${d}`);
  for (const r of b.requires || []) if (!declared.includes(r)) issues.push(`requires 미선언 참조 ${r}`);
  if (b.stage === 'observe' && !(b.requires || []).includes('fact')) issues.push('observe는 requires:["fact"]');
  if (b.stage === 'advance' && !(b.requires || []).includes('next')) issues.push('advance는 requires:["next"]');
  if (b.unit !== 'common' && !FOOD_UNITS.includes(b.unit) && declared.includes('food')) issues.push('비-food 유닛의 {food} 사용');
  if (b.unit === 'common' && declared.some((d) => d !== 'name')) issues.push('공용 블록은 {name} 외 슬롯 금지');
  const ends = t.split(/(?<=[.!?…])\s+/).map((s) => s.replace(/[.!?…\s]+$/, '').slice(-3)).filter(Boolean);
  for (let i = 0; i + 2 < ends.length; i++) if (ends[i] === ends[i + 1] && ends[i] === ends[i + 2]) { issues.push('내부 종결 3연속'); break; }
  if (t.split(/(?<=[.!?…])\s+/).filter(Boolean).length > 3) issues.push('문장 4+');
  return issues;
}
const tri = (s) => { const t = (s || '').replace(/\s+/g, ''); const g = new Set(); for (let i = 0; i + 3 <= t.length; i++) g.add(t.slice(i, i + 3)); return g; };
function sim(a, b) { const A = tri(a), B = tri(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); }
const head15 = (t) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 15);
const eojeol1 = (t) => ((t || '').trim().split(/\s+/)[0] || '');

/** 그룹 내 다양성 린트 — 첫 어절 중복·유사도 0.6+. 위반 블록 인덱스 집합 반환(뒤쪽 변형을 위반으로). */
function lintGroup(group) {
  const bad = new Map();
  const heads = new Map();
  for (let i = 0; i < group.length; i++) {
    const h = eojeol1(group[i].text);
    if (heads.has(h)) bad.set(i, `첫 어절 중복('${h}')`);
    else heads.set(h, i);
  }
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
    if (!bad.has(j) && sim(group[i].text, group[j].text) >= 0.6) bad.set(j, '변형 간 유사도 0.6+');
  }
  return bad;
}

const BLOCKS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['blocks'],
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['stage', 'variant', 'text', 'slots', 'tone'],
        properties: {
          stage: { type: 'string' }, variant: { type: 'number' }, text: { type: 'string' },
          slots: { type: 'array', items: { type: 'string' } }, tone: { type: 'string', enum: ['warm', 'praise', 'empathy'] },
          minStep: { type: 'number' }, requires: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};
const KILLS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['kills'],
  properties: { kills: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'reason'], properties: { id: { type: 'string' }, reason: { type: 'string' } } } } },
};

function basePrompt(u) {
  const targets = u.id === 'common' ? TARGET_COMMON : TARGET_UNIT;
  const stageGuide = u.id === 'common' ? u.guide : STAGE_GUIDE;
  return [
    `너는 영유아 편식 코칭 서비스 '밀프레드'의 편지 블록 작가다. 부모에게 가는 따뜻한 코칭 편지를 코드가 '조립'할 수 있도록, 사전 검수된 한국어 문장 블록을 만든다.`,
    u.id === 'common'
      ? `이번 작업: 공용(common) 블록 — 특정 주제와 무관하게 쓰이는 블록 6종.\n[스테이지별 지침]\n${stageGuide}`
      : `이번 작업: 코칭 주제 '${u.label}'(${u.id}) 블록 8 스테이지.\n[주제 핵심(이 근거 안에서만)]\n${u.guide}\n[부모가 받게 될 행동 단계(참고 — {next} 슬롯으로 들어오는 문구, 블록에 베껴 쓰지 말 것)]\n${u.steps.map((s, i) => `${i + 1}단: ${s}`).join('\n')}\n[스테이지 지침]\n${STAGE_GUIDE}`,
    `[이 주제 고유 금지]\n${u.ban}`,
    `[슬롯 문법]\n${SLOT_GUIDE}${u.id !== 'common' && !u.food ? '\n※ 이 주제는 {food} 슬롯 사용 금지(음식 주제가 아님).' : ''}${u.id === 'common' ? '\n※ 공용 블록은 {fact}{next}{food} 사용 금지({name}만 선택적 허용).' : ''}`,
    `[검수 체크리스트 — 전 항목 기계 검수됨. 하나라도 어기면 리젝]\n${CHECKLIST}`,
    TONE_ANCHOR,
    `[수량] ${Object.entries(targets).map(([s, n]) => `${s} ${n}개`).join(' · ')} — 총 ${Object.values(targets).reduce((a, b) => a + b, 0)}개.`,
    `출력: StructuredOutput 도구로 {blocks:[{stage,variant,text,slots,tone,requires?,minStep?}]}만. variant는 스테이지 안에서 1부터. minStep은 둘째 단 이상에서만 의미 있을 때(예: 심화 how)에 2로, 그 외 생략.`,
  ].join('\n\n');
}

function normalize(u, raw) {
  const arr = (raw && Array.isArray(raw.blocks)) ? raw.blocks : [];
  return arr.map((b) => ({
    unit: u.id, stage: String(b.stage || ''), variant: Number(b.variant) || 0,
    text: String(b.text || '').replace(/\s+/g, ' ').trim(),
    slots: Array.isArray(b.slots) ? b.slots.map(String) : [],
    tone: String(b.tone || 'warm'),
    ...(b.minStep ? { minStep: Number(b.minStep) } : {}),
    ...(Array.isArray(b.requires) && b.requires.length ? { requires: b.requires.map(String) } : {}),
  })).filter((b) => b.text);
}

/** 유닛 묶음 린트: ok/bad 분리(개별 규칙 + 그룹 다양성) */
function splitLint(u, blocks) {
  const ok = [], bad = [];
  const byStage = new Map();
  for (const b of blocks) {
    const issues = lintOne(b);
    if (issues.length) { bad.push({ b, issues }); continue; }
    byStage.set(b.stage, [...(byStage.get(b.stage) || []), b]);
  }
  for (const [, group] of byStage) {
    const badIdx = lintGroup(group);
    group.forEach((b, i) => { if (badIdx.has(i)) bad.push({ b, issues: [badIdx.get(i)] }); else ok.push(b); });
  }
  return { ok, bad };
}

function needOf(u, okBlocks) {
  const targets = u.id === 'common' ? TARGET_COMMON : TARGET_UNIT;
  const cnt = {};
  for (const b of okBlocks) cnt[b.stage] = (cnt[b.stage] || 0) + 1;
  const need = {};
  for (const [s, n] of Object.entries(targets)) if ((cnt[s] || 0) < n) need[s] = n - (cnt[s] || 0);
  return need;
}

function repairPrompt(u, okBlocks, bad, need, extraGuide) {
  return [
    basePrompt(u),
    extraGuide ? `[추가 지침 — 적대검수 반려 사유 반영]\n${extraGuide}` : '',
    `[이미 확보된 블록 — 이것들과 첫 어절·문형이 겹치지 않게]\n${okBlocks.map((b) => `(${b.stage}) ${b.text}`).join('\n') || '(없음)'}`,
    bad.length ? `[리젝된 블록과 사유 — 같은 스테이지로 '새로' 써라(고치지 말고 재작성)]\n${bad.map((x) => `(${x.b.stage}) ${x.b.text} ⛔ ${x.issues.join(' / ')}`).join('\n')}` : '',
    `[지금 필요한 수량만 출력] ${Object.entries(need).map(([s, n]) => `${s} ${n}개`).join(' · ') || '없음'}`,
  ].filter(Boolean).join('\n\n');
}

// ── 본체 ──────────────────────────────────────────────────────────────────────
const report = { produced: 0, rejected1: 0, repaired: 0, rejected2: 0, diversified: 0, killed: 0, refilled: 0, fallbackGaps: [] };

const perUnit = await pipeline(
  UNITS_DATA,
  // 1) 제작
  (u) => agent(basePrompt(u), { label: `make:${u.id}`, phase: 'Produce', schema: BLOCKS_SCHEMA })
    .then((raw) => ({ u, blocks: normalize(u, raw) })),
  // 2) 린트 + 수리 1
  async (r, u) => {
    if (!r) return { u, ok: [] };
    report.produced += r.blocks.length;
    const { ok, bad } = splitLint(u, r.blocks);
    report.rejected1 += bad.length;
    const need = needOf(u, ok);
    if (!bad.length && !Object.keys(need).length) return { u, ok };
    const raw = await agent(repairPrompt(u, ok, bad, need), { label: `fix:${u.id}`, phase: 'Repair', schema: BLOCKS_SCHEMA });
    const fixed = normalize(u, raw);
    report.repaired += fixed.length;
    return { u, ok, fixed };
  },
  // 3) 수리 2(잔여 위반 드랍·부족분만 한 번 더)
  async (r, u) => {
    if (!r) return { u: u, ok: [] };
    let ok = r.ok || [];
    if (r.fixed) {
      const merged = splitLint(u, [...ok, ...r.fixed]);
      report.rejected2 += merged.bad.length;
      ok = merged.ok;
    }
    const need = needOf(u, ok);
    if (Object.keys(need).length) {
      const raw = await agent(repairPrompt(u, ok, [], need), { label: `fix2:${u.id}`, phase: 'Repair', schema: BLOCKS_SCHEMA });
      const merged2 = splitLint(u, [...ok, ...normalize(u, raw)]);
      ok = merged2.ok;
    }
    return { u, ok };
  },
);

let pool = perUnit.filter(Boolean).flatMap((r) => r.ok || []);
log(`제작+수리 완료 — 풀 ${pool.length}블록(제작 ${report.produced}·1차 리젝 ${report.rejected1}·2차 리젝 ${report.rejected2})`);

// 임시 id 부여(적대검수 참조용)
function renumber(blocks) {
  const byKey = new Map();
  for (const b of blocks) {
    const k = `${b.unit}.${b.stage}`;
    byKey.set(k, [...(byKey.get(k) || []), b]);
  }
  const out = [];
  for (const [, group] of byKey) group.forEach((b, i) => out.push({ ...b, variant: i + 1, id: `${b.unit}.${b.stage}.${i + 1}` }));
  return out;
}
pool = renumber(pool);

// ── Diversify — 풀 전체 동일 도입 15자 ≤2 ─────────────────────────────────────
phase('Diversify');
{
  const groups = new Map();
  for (const b of pool) { const h = head15(b.text); groups.set(h, [...(groups.get(h) || []), b]); }
  const dups = [...groups.values()].filter((g) => g.length > 2).flatMap((g) => g.slice(2));
  if (dups.length) {
    const raw = await agent([
      '다음 한국어 코칭 블록들의 "도입부(첫 문장 앞부분)"가 풀 전체에서 겹친다. 의미·스테이지 성격은 유지하되 첫 어절부터 완전히 다른 도입으로 각각 재작성하라.',
      `[검수 체크리스트 — 동일 적용]\n${CHECKLIST}`,
      `[슬롯 문법 — 원문이 쓰던 슬롯은 그대로 유지]\n${SLOT_GUIDE}`,
      '[재작성 대상]',
      dups.map((b, i) => `${i + 1}. [${b.unit}/${b.stage}/slots:${(b.slots || []).join(',') || '-'}] ${b.text}`).join('\n'),
      '출력: {blocks:[{stage,variant,text,slots,tone,requires?}]} — 입력과 같은 순서·같은 개수·같은 unit 의미. variant는 입력 번호.',
    ].join('\n\n'), { label: 'diversify', phase: 'Diversify', schema: BLOCKS_SCHEMA });
    const rewritten = normalize({ id: 'mixed' }, raw);
    const keep = new Set(dups.map((b) => b.id));
    const byIdx = new Map();
    dups.forEach((b, i) => byIdx.set(i + 1, b));
    let applied = 0;
    for (const r of rewritten) {
      const orig = byIdx.get(r.variant);
      if (!orig) continue;
      const cand = { ...orig, text: r.text, slots: r.slots, tone: r.tone, ...(r.requires ? { requires: r.requires } : {}) };
      if (!lintOne(cand).length) { pool = pool.map((b) => (b.id === orig.id ? cand : b)); keep.delete(orig.id); applied++; }
    }
    pool = pool.filter((b) => !keep.has(b.id));   // 재작성 실패분은 드랍(Refill이 메움)
    report.diversified = applied;
    log(`도입 다양화 — 재작성 ${applied}건·드랍 ${keep.size}건(대상 ${dups.length})`);
  } else log('도입 중복 없음');
}

// ── Adversarial — 6렌즈, 위반은 삭제 ─────────────────────────────────────────
const LENSES = [
  ['괴식·안전', '슬롯 {food}에 어떤 흔한 음식(두부·딸기·생선 등)이 와도 안전한가? 질식 위험 형태 권유, 이상한 조합, 연령 부적합(영유아 매운맛·통견과·꿀), 위험해질 수 있는 표현을 죽여라.'],
  ['압박·죄책감', '부모 탓하기, 아이 압박, 의무·죄책감 유발, 우회적 강요("~만 하면 돼요"의 압박 변형 포함)를 죽여라.'],
  ['의학·단정', '의학적 진단·처방 뉘앙스, 발달 단정, 효능 과장(키·두뇌 등), 데이터 없이 단정하는 표현을 죽여라.'],
  ['반복감·상투', '상투구("정성스러운 기록 덕분" 류), 영혼 없는 빈말, 번역투, 같은 풀 안에서 사실상 같은 말인 블록을 죽여라.'],
  ['슬롯·렌더', '슬롯 치환 시 문장이 깨질 블록: 조사 충돌(슬롯 뒤 하드코딩 조사), {fact} 문장이 들어오면 이중 주어가 되는 구조, {next} 명사구가 안 맞는 받침 문형을 죽여라.'],
  ['정직·비노출', "내부 개념 누출(단계·트랙·주차 뉘앙스), 블록 자체에 박힌 사실 단정('어제 잘 먹었어요'류 — 사실은 {fact}로만), 거짓 칭찬이 될 수 있는 단정을 죽여라."],
];
phase('Adversarial');
{
  const listing = pool.map((b) => `${b.id} [${(b.slots || []).join(',') || '-'}|${b.tone}] ${b.text}`).join('\n');
  const verdicts = await parallel(LENSES.map(([name, brief]) => () => agent([
    `너는 영유아 편식 코칭 편지 블록 풀의 적대 검수자다. 렌즈: ${name}.`,
    brief,
    '확실한 위반만 죽여라(애매하면 통과). 위반 블록은 수정이 아니라 삭제 대상이다.',
    `[검수 기준 전문]\n${CHECKLIST}`,
    `[블록 풀]\n${listing}`,
    '출력: {kills:[{id,reason}]} — 위반 없으면 빈 배열.',
  ].join('\n\n'), { label: `lens:${name}`, phase: 'Adversarial', schema: KILLS_SCHEMA })));
  const kills = new Map();
  for (const v of verdicts.filter(Boolean)) for (const k of v.kills || []) if (!kills.has(k.id)) kills.set(k.id, k.reason);
  pool = pool.filter((b) => !kills.has(b.id));
  report.killed = kills.size;
  report.killList = [...kills.entries()].map(([id, reason]) => `${id}: ${reason}`);
  log(`적대검수 — 삭제 ${kills.size}건`);
}

// ── Refill — 커버리지 보충 ────────────────────────────────────────────────────
phase('Refill');
{
  const minOf = (u, s) => (u === 'common' ? (s === 'opener-weekday' ? MIN_OPENER : MIN_COMMON) : MIN_UNIT);
  const gapsByUnit = new Map();
  for (const u of UNITS_DATA) {
    const stages = u.id === 'common' ? COMMON_STAGES : UNIT_STAGES;
    const need = {};
    for (const s of stages) {
      const n = pool.filter((b) => b.unit === u.id && b.stage === s).length;
      const target = (u.id === 'common' ? TARGET_COMMON : TARGET_UNIT)[s];
      if (n < minOf(u.id, s)) need[s] = target - n;          // 최소선 미달 → 타깃까지 보충
    }
    if (Object.keys(need).length) gapsByUnit.set(u.id, { u, need });
  }
  if (gapsByUnit.size) {
    const fills = await parallel([...gapsByUnit.values()].map(({ u, need }) => () => {
      const okNow = pool.filter((b) => b.unit === u.id);
      const killHints = (report.killList || []).filter((k) => k.startsWith(`${u.id}.`)).slice(0, 8).join('\n');
      return agent(repairPrompt(u, okNow, [], need, killHints ? `이 유닛에서 삭제된 블록과 사유:\n${killHints}\n같은 함정을 피하라.` : ''),
        { label: `fill:${u.id}`, phase: 'Refill', schema: BLOCKS_SCHEMA })
        .then((raw) => ({ u, blocks: normalize(u, raw) }));
    }));
    for (const f of fills.filter(Boolean)) {
      const merged = splitLint(f.u, [...pool.filter((b) => b.unit === f.u.id), ...f.blocks]);
      const others = pool.filter((b) => b.unit !== f.u.id);
      pool = [...others, ...merged.ok];
      report.refilled += merged.ok.length;
    }
  }
  pool = renumber(pool);
  // 최종 점검 — 남은 갭은 정직하게 보고(숨은 캡 금지)
  for (const u of UNITS_DATA) {
    const stages = u.id === 'common' ? COMMON_STAGES : UNIT_STAGES;
    for (const s of stages) {
      const n = pool.filter((b) => b.unit === u.id && b.stage === s).length;
      if (n < minOf(u.id, s)) report.fallbackGaps.push(`${u.id}.${s}=${n}`);
    }
  }
  log(`보충 완료 — 최종 풀 ${pool.length}블록${report.fallbackGaps.length ? ` · ⚠️ 잔여 갭 ${report.fallbackGaps.join(',')}` : ' · 갭 0'}`);
}

return { blocks: pool, report };
