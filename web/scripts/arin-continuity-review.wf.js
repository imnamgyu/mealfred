/**
 * 아린 편지 연속성 자가정독(랄프위검) 워크플로우 — 재생성 후 launch.
 * args = { loop: 'F-16', file: '/tmp/arin-letters-f16.txt', baseline: 52 }
 *   file = scripts/arin-read.mjs 텍스트 덤프(각 편지: 날짜·커리큘럼[unit/step/mode/pivot]·시나리오·레버·행동목표·무브·추천·본문).
 * 다차원 리뷰(병렬, 각 에이전트가 Read로 파일 정독) → 종합(연속성 점수 + 우선순위 문제 + 문서 보강점).
 */
export const meta = {
  name: 'arin-continuity-review',
  description: 'Adversarial self-read of Arin letters for continuity (move-unit binding/repetition/parrot/contradiction/arc) + doc-reinforcement findings',
  phases: [
    { title: 'Review', detail: 'parallel reviewers per continuity dimension (each reads the dump file)' },
    { title: 'Synthesize', detail: 'continuity score + ranked problems + doc reinforcement' },
  ],
}

const loop = args?.loop || "도입 소재 daySeed 회전 풀(6종 수사 장치) + '부모님' 호명 도입 금지(24통 중 17통 '부모님,' 수렴 차단·도입 다양성)"
const file = args?.file || '/tmp/arin-letters-pref.txt'
const baseline = args?.baseline ?? 48

const COMMON = `당신은 영유아 편식 코칭 편지 엔진의 '연속성 감사관'입니다. 먼저 Read 도구로 파일 \`${file}\` 을 끝까지 읽으세요 — 한 아이(아린)에게 가입 1일차부터 오늘까지 매일 발행된 편지 24통을 순서대로 정독한 것입니다. 이번 검토는 방금 적용한 수정 '${loop}'의 효과/부작용을 보는 라운드입니다(직전 라운드 연속성 ${baseline}/100).

각 편지엔 코드가 정한 메타(커리큘럼 유닛/단계/모드/피벗, 시나리오, 주간 레버, 행동목표, 오늘의 무브, 추천 식재료)가 붙어 있습니다. '말투'가 아니라 **구조적 연속성**을 봅니다. 부모가 24일을 연속으로 읽었을 때 느낄 반복·모순·정체·잡탕을 냉정하게 찾으세요. 칭찬 말고 문제를 찾는 게 임무입니다(랄프위검처럼 솔직하게). 반드시 실제 날짜와 인용으로 증거를 대세요.

[참고 — 이번은 '대수술 누적분 전부 출고 후' 종합 통독. 코드 분석가가 미리 관찰한 것(검증/반박/보강하라, 맹신 금지)]
- 이번 세션 출고 누적: ①선호계량화(미상을 liked 오판 차단·콜드스타트 정상화) ②F-18 슬롯본문봉합(비-콩류 슬롯 날 슬롯 음식 직조·두부 누수 0·거울 음식=슬롯 음식) ③커리큘럼 B(hardStall 18일 강제 피벗·deepen 봉합 → table↔exposure 교대) C(온보딩 3주차) A(추천근거 어드민) ④P0-D(프로브 질문→신호 다리: 환경 유닛 답변이 envTablePct로 흐름) ⑤프로브 일별 회전(ts-env/ts-ritual 교대) ⑥카테고리 정합(challenge 슬롯='감자 잘 먹으니 단호박' 명시 연결, '콩류 부족→단호박' 모순 제거) ⑦급식 근거('또래 급식에 자주 오르는 익숙한 재료' 안심 톤). ⑧⭐이번 라운드: 도입 소재 daySeed 회전 풀(관찰형·변화포착·질문형·장면묘사·일상결·공감형 6종 수사 장치)을 openBlock에 주입 + '부모님' 호명 시작 금지(기존 아이 이름 시작 금지와 대칭) — 직전 24통 중 17통(후반 8/9)이 "부모님," 호명으로 도입 수렴하던 것을 차단.
- ⭐⭐이번 라운드 핵심 검증(도입 다양성 — 강하게 측정하라): 24통의 '첫 문장'만 따로 모아 읽어라. (ㄱ)몇 통이 "부모님," 호명(또는 아이 이름)으로 여는가? 직전 라운드 17/24에서 실제로 대폭 줄었는가(날짜로 카운트)? (ㄴ)첫 문장 '여는 수사 장치'가 날마다 회전하는가(구체관찰/작은변화/질문/장면묘사/일상결/공감) — 아니면 다른 정형(예: '오늘은~'·'어린이집이 채워준~')으로 새 수렴이 생겼나? (ㄷ)도입 회전이 그날 시나리오 각도와 자연스럽게 어우러지나, 아니면 소재 지시가 본문과 따로 노는 어색함이 있나? 인접 2일 도입 복붙도 카운트.
- ⭐핵심 검증(강하게 반박하라): (가)카테고리 정합 —정말 '부족 X 호명 + 다른군 Y 추천' 모순이 사라졌는가, 아직 남은 날 있나(날짜)? challenge 날 'pairLiked 잘 먹으니 slotDish' 명시 연결이 자연스러운가? (나)급식 근거가 서열·비교로 안 읽히고 안심 톤인가? 과다 반복인가? (다)table↔exposure 교대가 진척으로 읽히나 핑퐁 정체로 읽히나? step 1단→2단 전진은 여전히 0(아린 양성신호 미입력 — P0-D는 다리만 깔고 실데이터 대기). (라)여전히 미해결 천장: 추천 풀 협소(두부·달걀 반복)·단일 앵커(감자/소고기 반복)·plateau 위로 템플릿·lever:food 태그 불일치·macro dead. 어느 게 통독상 가장 아픈지 우선순위.
- ⭐이사님 5조건(반드시 평가): 음식타깃 구체성·주간수업 정체·BMI/macro·주간계획 다양성·커리큘럼 진행.`

phase('Review')
const FINDING_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['dimension', 'severity', 'findings'],
  properties: {
    dimension: { type: 'string' },
    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['issue', 'dates', 'evidence', 'rootCauseGuess'],
      properties: {
        issue: { type: 'string' },
        dates: { type: 'array', items: { type: 'string' } },
        evidence: { type: 'string', description: 'quote the repeated/contradictory text' },
        rootCauseGuess: { type: 'string', description: 'which engine mechanism (file/concept)' },
      } } },
  },
}

const DIMENSIONS = [
  { key: '무브-유닛 결속(F-16 핵심)', prompt: `각 편지 본문의 실제 '행동 제안'이 그날 커리큘럼 유닛과 맞는지 보라. 노출/음식 유닛(exposure-savings·food-bridge·link-rhythm) 날인데 본문이 환경 얘기(TV·간식타이밍·정리·수저)만 하면 결속 실패. 환경/자율/식감 유닛 날에 음식 곁들임/섞기가 들어가면 잡탕. 유닛 피벗 뒤 본문이 며칠이나 그 유닛을 따라갔는지 날짜로. 메타 레버와 본문이 어긋난 날을 모두 짚어라.` },
  { key: '반복·앵무새', prompt: `여러 날 거의 같은 문장/표현/클로징(특히 '어린이집 덕에…' 영양거울 결핍줄), 같은 무브, 같은 추천 식재료, 같은 칭찬 틀의 반복. 인접일(연속 2일) 복붙에 가까운 쌍 최우선. 같은 환경 무브 4종이 몇 번씩 재등장하는지 카운트.` },
  { key: '모순·잡탕·괴식·한번에하나', prompt: `데이터/직전 편지와 모순되는 단정, 한 편지 안 레버 잡탕(환경 코칭인데 음식 숙제도), 괴식(단과일+짭짤·김치섞기·미역↔생선), '오늘 행동 1개' 위반(요구 2~3개). 주간 레버=food인데 본문은 환경인 모순도.` },
  { key: '아크·진도 서사', prompt: `24일 통틀어 '커리큘럼이 전진하는 느낌'이 부모에게 가는가? step 1단 고정인데 본문 진도감 0인지, '지난주 X→이번주 Y' 누적 서사 부재인지(F-17 대상 — 증거만 모아라), 졸업/피벗이 서사로 드러나는지. 같은 유닛을 며칠째 같은 말로 반복하는 정체.` },
  { key: '도입 다양성·온보딩', prompt: `첫 문장이 매일 다른 소재로 열리는지, 같은 도입 구조(아이 이름 시작·'어린이집이 채워준'·메모 일화) 반복인지. 온보딩(첫 1~2일) 따뜻함·적절성·인접 복붙.` },
  // ⭐ 이사님 지시(2026-06-18) — 랄프위검 정식 조건 3종 추가(주간계획·영양 정합)
  { key: '🥗 음식 타깃 구체성(이사님 조건)', prompt: `이사님 반복 지시: 주간계획의 '음식 타깃'은 카테고리(식품군: 콩류·과일·비타민A채소 등)가 아니라 '구체적 음식/메뉴 이름'(예: 두부조림·순두부찌개·소고기무국)이어야 한다. 편지 본문·주간계획 메타에서 음식 타깃/추천이 여전히 식품군 카테고리로만 제시되는지(구체 메뉴명 부재), 구체 메뉴가 나와도 매번 같은 것(두부 도돌이표)인지 날짜로 짚어라. popularDishesFor 같은 구체메뉴 산출이 주간계획에 배선됐는가.` },
  { key: '📚 주간 수업 정체(이사님 조건)', prompt: `이사님 지적: 주간계획 '이번 주 수업'(커리큘럼 유닛·step)이 여러 주(W22·W23·W24…) 거의 동일(식탁무대 1단 고정)하면 안 된다. 같은 유닛·같은 step이 2주+ 반복되는지, focusFatigue(2주 정체 유닛 강등)가 작동하는지, 유닛이 table↔exposure 진동만 하고 졸업/전진이 없는지. 부모가 '3주째 똑같은 수업'으로 느끼는 정체를 주차별로 짚어라.` },
  { key: '⚖️ BMI·성장 → 탄단지 트랙(이사님 조건)', prompt: `이사님 지시: 아이 BMI·성장을 고려해 '탄단지(탄수화물·단백질·지방) 보강'도 타깃이 돼야 한다 — 저체중/성장더딤이면 과일·채소가 아니라 '고기류(단백질·지방)'를 타깃 음식으로. 현재 타깃이 BMI/성장과 무관하게 결핍 식품군(과일·콩류)만 잡는지, 성장 신호가 있는데 macro 보강 트랙이 누락됐는지. 과체중이면 간식 절제, 저체중/성장더딤이면 탄단지↑ 트랙이 격주로 배선됐는가.` },
  { key: '📈 커리큘럼 진행(이사님 조건)', prompt: `이사님 지시: 커리큘럼이 '잘 진행되고 있는지' 체크. step이 여러 주 1단에 고착인지, 유닛이 졸업(mastered)·전진(step++)하지 못하고 table↔exposure 진동만 하는지, passWhen 충족이 한 번도 안 일어나는지(신호 포착 병목), 부모가 '진도가 어디로도 안 간다'고 느낄 정체인지. 진행이 막혔다면 그 원인(신호 미포착/유닛 부적합/passWhen 임계 과엄격)을 주차별로 짚어라.` },
]

const reviews = await parallel(DIMENSIONS.map((d) => () =>
  agent(`${COMMON}\n\n## 당신의 검토 차원: ${d.key}\n${d.prompt}\n\n구조화 결과(JSON)로만. 문제 없으면 findings=[]·severity=low.`,
    { label: `review:${d.key}`, phase: 'Review', schema: FINDING_SCHEMA })
))

phase('Synthesize')
const valid = reviews.filter(Boolean)
const synthesis = await agent(
  `당신은 코칭 엔진 연속성 종합관입니다. 먼저 Read로 \`${file}\` 24통을 정독하고, 아래 차원별 감사 결과를 종합하세요. 이번 라운드 수정='${loop}'(직전 연속성 ${baseline}/100).\n\n## 차원별 감사 결과\n${JSON.stringify(valid, null, 2)}\n\n## 종합 임무\n(1) 연속성 점수 0~100(${baseline} 대비 ${loop}로 올랐는지/내렸는지 + 근거). (2) 우선순위 문제(가장 아픈 것부터·날짜·증거·중복제거). (3) 각 문제별 '개발 문서 보강점'(어느 메커니즘을 어떻게·F-16/F-17/K-04b/그 외 EPIC 중 무엇의 영역). (4) '${loop}'가 의도대로 작동했는가 판정(무브-유닛 결속이 본문에 실제 드러나는가) + 남은 한계.`,
  { label: 'synthesize', phase: 'Synthesize', schema: {
    type: 'object', additionalProperties: false,
    required: ['continuityScore', 'scoreRationale', 'fixVerdict', 'rankedProblems', 'docReinforcements'],
    properties: {
      continuityScore: { type: 'number' },
      scoreRationale: { type: 'string' },
      fixVerdict: { type: 'string' },
      rankedProblems: { type: 'array', items: { type: 'object', additionalProperties: false,
        required: ['rank', 'problem', 'dates', 'evidence', 'owner'],
        properties: { rank: { type: 'number' }, problem: { type: 'string' }, dates: { type: 'array', items: { type: 'string' } }, evidence: { type: 'string' }, owner: { type: 'string' } } } },
      docReinforcements: { type: 'array', items: { type: 'object', additionalProperties: false,
        required: ['target', 'note'], properties: { target: { type: 'string' }, note: { type: 'string' } } } },
    },
  } }
)

return { loop, baseline, reviews: valid, synthesis }
