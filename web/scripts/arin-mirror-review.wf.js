/**
 * 아린 편지 연속성 자가정독(랄프위검) — '영양거울 출현빈도 쿨다운' 라운드 전용(2026-06-20).
 *   공용 arin-continuity-review.wf.js의 포크 — 같은 덤프(/tmp/arin-letters-pref.txt)를 읽되,
 *   이번 라운드 초점을 '어린이집 덕에…' 거울줄의 출현빈도 격일화(어절 변주가 아니라 출현 자체)로 재설정.
 *   별도 파일로 둔 이유: 공용 워크플로우를 동시에 다른 세션(도입 회전 라운드)이 편집 중이라 클로버 방지.
 * 실행: Workflow({scriptPath:'web/scripts/arin-mirror-review.wf.js'})  (replay→read 후)
 */
export const meta = {
  name: 'arin-mirror-cooldown-review',
  description: 'Adversarial self-read of Arin letters — measure nutrition-mirror appearance-frequency cooldown (어린이집 덕에 격일화) + full continuity',
  phases: [
    { title: 'Review', detail: 'parallel reviewers per continuity dimension (mirror-frequency lead)' },
    { title: 'Synthesize', detail: 'continuity score + mirror-cooldown verdict + ranked problems' },
  ],
}

const loop = args?.loop || "영양거울 출현빈도 쿨다운 — '어린이집/기관 급식 덕에 영양 채워진다' 거울줄을 어절 변주가 아니라 출현빈도 자체로 격일화(최근 2일 거울 있으면 오늘 생략·전체결핍 심하면 면제) + 쿨다운날 LLM 자체 안심문구 금지 가드"
const file = args?.file || '/tmp/arin-letters-pref.txt'
const baseline = args?.baseline ?? 48

const COMMON = `당신은 영유아 편식 코칭 편지 엔진의 '연속성 감사관'입니다. 먼저 Read 도구로 파일 \`${file}\` 을 끝까지 읽으세요 — 한 아이(아린)에게 가입 1일차부터 오늘까지 매일 발행된 편지 24통을 순서대로 정독한 것입니다. 이번 검토는 방금 적용한 수정 '${loop}'의 효과/부작용을 보는 라운드입니다(직전 라운드 연속성 ${baseline}/100).

각 편지엔 코드가 정한 메타(커리큘럼 유닛/단계/모드/피벗, 시나리오, 주간 레버, 행동목표, 오늘의 무브, 추천 식재료, 그리고 이번 라운드 신규로 '거울:노출/생략' 플래그)가 붙어 있습니다. '말투'가 아니라 **구조적 연속성**을 봅니다. 부모가 24일을 연속으로 읽었을 때 느낄 반복·모순·정체·잡탕을 냉정하게 찾으세요. 칭찬 말고 문제를 찾는 게 임무입니다(랄프위검처럼 솔직하게). 반드시 실제 날짜와 인용으로 증거를 대세요.

[참고 — 코드 분석가가 미리 관찰한 것(검증/반박/보강하라, 맹신 금지)]
- ⭐⭐이번 라운드 핵심(영양거울 출현빈도 — 강하게 측정하라): 직전 라운드까지 '어린이집/기관 급식 덕에 (전체) 영양이 채워진다'류 거울 안심줄이 24통 중 약 17통(거의 매일)에 박혀 앵무새처럼 반복됐다. 이번 수정은 '어절을 바꾸는 변주'가 아니라 '출현 자체를 며칠 간격으로' 줄이는 것이다(쿨다운: 최근 2일 안에 거울이 나왔으면 오늘은 생략, 단 전체 결핍이 심한 날은 면제). 측정하라: (ㄱ)24통 중 '어린이집/기관 덕에 영양 채워진다'류 거울 안심줄이 실제 몇 통에 등장하는가? 17 대비 대폭 줄었는가(등장한 날짜를 모두 나열)? (ㄴ)'거울:노출/생략' 메타 플래그와 본문이 일치하는가 — 메타가 '생략'인 날인데 본문에 여전히 기관-안심 문구가 들어간 날이 있나(LLM 습관 누수·날짜로)? (ㄷ)거울이 생략된 날의 마무리가 어색하거나 공허하지 않고 다른 말(구체 행동·작은 변화·따뜻한 마무리)로 자연스럽게 닫히는가? (ㄹ)생략이 과해 정작 '집에서 부족한 식품군'을 며칠씩 한 번도 안 짚어 부모가 결핍 신호를 놓치는 역효과는 없나(전체결핍 면제가 잘 작동하나)?
- 참고(이번 라운드와 함께 라이브인 직전 수정들, 맹신 말 것): 도입 소재 daySeed 회전('부모님' 호명 도입 차단)·F-18 슬롯본문봉합(슬롯 음식 직조·두부 누수 0)·선호계량화·커리큘럼 피벗.
- ⭐미해결 천장(통독상 가장 아픈 것 우선순위): 추천 풀 협소(두부·달걀 반복)·단일 앵커(감자/소고기 반복)·step 1단 전진 0(양성신호 미입력)·plateau 위로 템플릿. 거울 쿨다운이 이것들을 가렸는지/드러냈는지도 보라.`

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
  { key: '🪞 영양거울 출현빈도(이번 라운드 핵심)', prompt: `오직 '어린이집/기관 급식 덕에 (전체) 영양이 채워진다·받쳐준다·골고루 챙긴다'류 거울 안심줄만 추적하라. (1)24통 각각에 그 안심줄이 있는지 ○/✗로 전수 판정하고 등장 통수를 세라(목표: 17→대폭 감소·이상적 8 안팎). (2)등장한 날짜를 모두 나열. (3)연속 2일 이상 거울이 등장한 구간이 남았는지(쿨다운 누수). (4)'거울:생략' 메타인데 본문엔 안심줄이 들어간 모순 날(LLM 습관 누수). (5)거울이 어절만 바뀌고(두루↔골고루↔받쳐주) 여전히 매일 나오면 = 수정 실패. severity는 '17→얼마로 줄었나'로 판단(거의 그대로면 high, 절반이면 medium, 1/3 이하면 low).` },
  { key: '반복·앵무새(거울 외)', prompt: `거울 안심줄을 뺀 나머지 반복: 여러 날 거의 같은 문장/표현/클로징, 같은 무브, 같은 추천 식재료(두부·달걀 도돌이표), 같은 칭찬 틀. 인접일(연속 2일) 복붙에 가까운 쌍 최우선. 같은 환경 무브가 몇 번씩 재등장하는지 카운트. 거울을 줄인 자리에 다른 상투구가 새로 수렴했는지도 보라.` },
  { key: '거울 생략날 마무리 품질', prompt: `'거울:생략'으로 표시된 날들만 모아, 편지의 '마무리 문장'이 자연스러운지 본다. 거울이 빠져서 (가)끝이 갑자기 끊기거나 (나)공허한 위로("천천히 가도 충분")로 때우거나 (다)거울 대신 다른 안심 상투구가 그 자리를 메우지 않았는지. 생략날에도 '오늘의 행동 1개'가 또렷하고 따뜻하게 닫히는가.` },
  { key: '결핍 신호 누락 역효과(degrade-safe)', prompt: `거울 쿨다운이 과해서 '집에서 부족한 식품군(콩류 등)'을 며칠 연속 한 번도 안 짚어 부모가 결핍을 놓칠 위험. 전체 결핍이 분명한 날(메타·본문 근거)에는 쿨다운 면제로 거울이 반드시 나오는지(degrade-safe 작동), 아니면 결핍한데도 거울이 며칠씩 사라졌는지 날짜로.` },
  { key: '모순·잡탕·괴식·한번에하나', prompt: `데이터/직전 편지와 모순되는 단정, 한 편지 안 레버 잡탕(환경 코칭인데 음식 숙제도), 괴식(단과일+짭짤·김치섞기·미역↔생선), '오늘 행동 1개' 위반(요구 2~3개). 거울 쿨다운으로 음식 추천 채널이 사라진 환경날(_noFood)에 음식이 아예 0이 됐는지도 점검.` },
  { key: '도입 다양성·온보딩', prompt: `첫 문장이 매일 다른 소재로 열리는지, 같은 도입 구조(아이 이름 시작·'부모님' 호명·'어린이집이 채워준'·메모 일화) 반복인지. 직전 라운드(도입 회전)가 살아있으니 '부모님,' 호명이 줄었는지도 부수적으로 확인. 인접 2일 도입 복붙 카운트.` },
  { key: '아크·진도 서사', prompt: `24일 통틀어 '커리큘럼이 전진하는 느낌'이 부모에게 가는가? step 1단 고정인데 본문 진도감 0인지, '지난주 X→이번주 Y' 누적 서사 부재인지, 졸업/피벗이 서사로 드러나는지. 같은 유닛을 며칠째 같은 말로 반복하는 정체.` },
]

const reviews = await parallel(DIMENSIONS.map((d) => () =>
  agent(`${COMMON}\n\n## 당신의 검토 차원: ${d.key}\n${d.prompt}\n\n구조화 결과(JSON)로만. 문제 없으면 findings=[]·severity=low.`,
    { label: `review:${d.key}`, phase: 'Review', schema: FINDING_SCHEMA })
))

phase('Synthesize')
const valid = reviews.filter(Boolean)
const synthesis = await agent(
  `당신은 코칭 엔진 연속성 종합관입니다. 먼저 Read로 \`${file}\` 24통을 정독하고, 아래 차원별 감사 결과를 종합하세요. 이번 라운드 수정='${loop}'(직전 연속성 ${baseline}/100).\n\n## 차원별 감사 결과\n${JSON.stringify(valid, null, 2)}\n\n## 종합 임무\n(1) 연속성 점수 0~100(${baseline} 대비 이번 라운드로 올랐는지/내렸는지 + 근거). (2) ⭐거울 출현빈도 판정: '어린이집 덕에…' 거울 안심줄이 24통 중 몇 통에 등장하는지 최종 카운트(17 대비)와, 쿨다운이 '출현빈도 자체'를 의도대로 격일화했는지(어절만 바뀐 게 아니라 실제 출현이 줄었는지) 판정 + 누수·역효과. (3) 우선순위 문제(가장 아픈 것부터·날짜·증거·중복제거). (4) 각 문제별 '개발 문서 보강점'(어느 메커니즘을 어떻게 — 거울 쿨다운=route.ts mirrorCooldownDue/coach.ts mirrorBlock, 그 외 EPIC).`,
  { label: 'synthesize', phase: 'Synthesize', schema: {
    type: 'object', additionalProperties: false,
    required: ['continuityScore', 'scoreRationale', 'mirrorVerdict', 'mirrorCountAfter', 'fixVerdict', 'rankedProblems', 'docReinforcements'],
    properties: {
      continuityScore: { type: 'number' },
      scoreRationale: { type: 'string' },
      mirrorVerdict: { type: 'string', description: '거울 출현빈도 격일화가 의도대로 작동했는가 + 누수/역효과' },
      mirrorCountAfter: { type: 'number', description: "24통 중 '어린이집 덕에' 거울 안심줄이 등장한 통수(최종)" },
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
