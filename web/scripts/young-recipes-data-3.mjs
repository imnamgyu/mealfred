// 영유아 레시피 배치 3 (직접 작성, LLM API 미사용) — 나머지 식재료. 고추는 영유아 부적합으로 제외.
export const RECIPES = [
  // 잎채소
  { ing:'상추', name:'상추 쌈·무침', method:'무침·생채', ings:['상추','참기름','국간장'], allergens:[], nutri:'엽산·비타민K',
    steps:['상추를 잘게 썬다','참기름·국간장 소량으로 살짝 무친다','밥에 곁들인다'],
    ages:{ '3-4y':{texture:'잘게 썰어 부드러운 잎만',tip:'쌈으로도',time:5}, '5y':{texture:'쌈·무침',tip:'',time:5}, '6-7y':{texture:'일반',tip:'',time:5} } },
  { ing:'들깻잎', name:'깻잎 두부무침', method:'무침·생채', ings:['들깻잎','두부','참기름'], allergens:['대두'], nutri:'칼슘·비타민A',
    steps:['깻잎을 데쳐 잘게 썬다','두부를 으깨 함께 무친다','참기름으로 마무리'],
    ages:{ '3-4y':{texture:'데쳐 잘게, 향 약하게',tip:'향 강하면 소량',time:8}, '5y':{texture:'한입',tip:'',time:8}, '6-7y':{texture:'일반',tip:'',time:8} } },
  { ing:'미나리', name:'미나리 나물', method:'무침·생채', ings:['미나리','참기름','국간장'], allergens:[], nutri:'비타민A·식이섬유',
    steps:['미나리를 데쳐 잘게 썬다','참기름·국간장 소량으로 무친다'],
    ages:{ '3-4y':{texture:'데쳐 잘게',tip:'질긴 줄기 제거',time:8}, '5y':{texture:'한입',tip:'',time:8}, '6-7y':{texture:'일반',tip:'',time:8} } },
  { ing:'쑥', name:'쑥 된장국', method:'국·탕', ings:['쑥','된장','멸치육수'], allergens:[], nutri:'철·식이섬유',
    steps:['쑥을 깨끗이 씻어 데친다','멸치육수에 된장을 풀고 쑥을 넣는다','부드럽게 끓인다'],
    ages:{ '3-4y':{texture:'데쳐 잘게, 저염',tip:'향 강하면 소량 시작',time:15}, '5y':{texture:'먹기 좋게',tip:'',time:15}, '6-7y':{texture:'일반',tip:'',time:15} } },
  { ing:'쑥갓', name:'쑥갓 두부무침', method:'무침·생채', ings:['쑥갓','두부','참기름'], allergens:['대두'], nutri:'비타민A·칼슘',
    steps:['쑥갓을 데쳐 잘게 썬다','두부를 으깨 함께 무친다','참기름으로 마무리'],
    ages:{ '3-4y':{texture:'데쳐 잘게',tip:'향 약하게',time:8}, '5y':{texture:'한입',tip:'',time:8}, '6-7y':{texture:'일반',tip:'',time:8} } },
  { ing:'양상추', name:'양상추 달걀볶음', method:'볶음·구이', ings:['양상추','달걀','식용유 약간'], allergens:['달걀'], nutri:'엽산·식이섬유',
    steps:['양상추를 잘게 썬다','달걀 스크램블에 가볍게 볶는다'],
    ages:{ '3-4y':{texture:'잘게 썰어 살짝 익힘',tip:'',time:8}, '5y':{texture:'한입',tip:'',time:8}, '6-7y':{texture:'일반',tip:'',time:8} } },
  { ing:'얼갈이배추', name:'얼갈이 된장국', method:'국·탕', ings:['얼갈이배추','된장','멸치육수'], allergens:[], nutri:'비타민C·식이섬유',
    steps:['얼갈이를 데쳐 잘게 썬다','멸치육수에 된장 풀고 끓인다'],
    ages:{ younger:{texture:'잘게, 저염',tip:'',time:15}, '3-4y':{texture:'잘게',tip:'',time:15}, '5y':{texture:'먹기 좋게',tip:'',time:15} } },
  { ing:'달래', name:'달래 달걀찜', method:'조림·찜', ings:['달래','달걀','물'], allergens:['달걀'], nutri:'비타민C·칼슘',
    steps:['달래를 아주 잘게 썬다','달걀·물과 섞어 부드럽게 찐다'],
    ages:{ '3-4y':{texture:'아주 잘게, 부드러운 찜',tip:'향 약하게',time:10}, '5y':{texture:'한입',tip:'',time:10}, '6-7y':{texture:'일반',tip:'',time:10} } },
  { ing:'참나물', name:'참나물 무침', method:'무침·생채', ings:['참나물','참기름','국간장'], allergens:[], nutri:'비타민A·철',
    steps:['참나물을 데쳐 잘게 썬다','참기름·국간장 소량으로 무친다'],
    ages:{ '3-4y':{texture:'데쳐 잘게',tip:'',time:8}, '5y':{texture:'한입',tip:'',time:8}, '6-7y':{texture:'일반',tip:'',time:8} } },

  // 뿌리
  { ing:'더덕', name:'더덕 구이', method:'볶음·구이', ings:['더덕','참기름','약간의 간장'], allergens:[], nutri:'식이섬유·사포닌',
    steps:['더덕을 부드럽게 두드려 편다','참기름을 발라 약불에 굽는다'],
    ages:{ '5y':{texture:'부드럽게 구워 잘게',tip:'쌉쌀하면 꿀 소량(돌 이후)',time:12}, '6-7y':{texture:'일반 구이',tip:'',time:12} } },
  { ing:'도라지', name:'도라지 나물', method:'무침·생채', ings:['도라지','참기름','국간장'], allergens:[], nutri:'식이섬유·사포닌',
    steps:['도라지를 부드럽게 데친다','잘게 썰어 참기름·국간장 소량으로 무친다'],
    ages:{ '5y':{texture:'푹 데쳐 잘게',tip:'쓴맛은 소금물에 주물러 제거',time:12}, '6-7y':{texture:'일반',tip:'',time:12} } },
  { ing:'순무', name:'순무 뭇국', method:'국·탕', ings:['순무','소고기','국간장'], allergens:['소고기'], nutri:'비타민C·식이섬유',
    steps:['순무를 나박 썰어 소고기와 끓인다','국간장 소량으로 간한다'],
    ages:{ younger:{texture:'잘게, 저염',tip:'',time:18}, '3-4y':{texture:'잘게',tip:'',time:18}, '5y':{texture:'먹기 좋게',tip:'',time:18} } },
  { ing:'우엉', name:'우엉 조림', method:'조림·찜', ings:['우엉','간장','참기름'], allergens:[], nutri:'식이섬유',
    steps:['우엉을 얇게 썰어 푹 삶는다','간장 소량으로 자작하게 조린다'],
    ages:{ '5y':{texture:'얇게 푹 익혀 부드럽게',tip:'질기면 더 삶기',time:20}, '6-7y':{texture:'일반 조림',tip:'',time:20} } },

  // 열매
  { ing:'피망', name:'피망 닭고기볶음', method:'볶음·구이', ings:['피망','닭안심','참기름'], allergens:[], nutri:'비타민C·비타민A',
    steps:['피망·닭안심을 잘게 썬다','닭을 익히고 피망을 넣어 볶는다'],
    ages:{ '3-4y':{texture:'잘게 썰어 부드럽게',tip:'쓴맛 적은 빨강·노랑 추천',time:12}, '5y':{texture:'한입',tip:'',time:12}, '6-7y':{texture:'일반',tip:'',time:12} } },

  // 곡물
  { ing:'멥쌀', name:'쌀죽', method:'죽·미음', ings:['멥쌀','물'], allergens:[], nutri:'탄수·에너지',
    steps:['불린 쌀을 물에 푹 끓여 부드럽게 한다','농도를 연령에 맞게 맞춘다'],
    ages:{ younger:{texture:'완전히 퍼진 미음~죽',tip:'',time:20}, '3-4y':{texture:'무른 진밥',tip:'',time:20} } },
  { ing:'찹쌀', name:'찹쌀 단호박죽', method:'죽·미음', ings:['찹쌀','단호박','물'], allergens:[], nutri:'탄수·비타민A',
    steps:['찹쌀을 불려 단호박과 푹 끓인다','곱게 으깨 부드럽게 한다'],
    ages:{ younger:{texture:'부드러운 죽',tip:'찹쌀은 끈기 있으니 묽게',time:25}, '3-4y':{texture:'죽',tip:'',time:25} } },
  { ing:'보리', name:'보리밥', method:'밥·면류', ings:['보리','쌀'], allergens:[], nutri:'식이섬유·탄수',
    steps:['보리를 충분히 불린다','쌀과 섞어 진밥으로 짓는다'],
    ages:{ '3-4y':{texture:'보리 비율 낮춰 진밥',tip:'처음엔 쌀에 소량 섞기',time:30}, '5y':{texture:'잡곡밥',tip:'',time:30}, '6-7y':{texture:'일반',tip:'',time:30} } },
  { ing:'밀', name:'채소 수제비', method:'밥·면류', ings:['밀가루','애호박','당근','멸치육수'], allergens:['밀'], nutri:'탄수·에너지',
    steps:['밀가루를 반죽해 얇게 떼어낸다','멸치육수에 채소와 함께 끓인다','부드럽게 익힌다'],
    ages:{ '3-4y':{texture:'얇고 작게 떼어 부드럽게',tip:'밀 알레르겐 확인',time:20}, '5y':{texture:'한입',tip:'',time:20}, '6-7y':{texture:'일반',tip:'',time:20} } },

  // 콩
  { ing:'숙주나물', name:'숙주 무침', method:'무침·생채', ings:['숙주나물','참기름','국간장'], allergens:[], nutri:'비타민C·식이섬유',
    steps:['숙주를 데쳐 잘게 썬다','참기름·국간장 소량으로 무친다'],
    ages:{ '3-4y':{texture:'데쳐 잘게',tip:'',time:8}, '5y':{texture:'한입',tip:'',time:8}, '6-7y':{texture:'일반',tip:'',time:8} } },
  { ing:'콩(대두)', name:'콩 조림', method:'조림·찜', ings:['대두(콩)','간장','참기름'], allergens:['대두'], nutri:'단백질·식이섬유',
    steps:['콩을 푹 삶아 부드럽게 한다','간장 소량으로 조린다'],
    ages:{ '3-4y':{texture:'푹 삶아 으깨거나 잘게',tip:'통콩은 질식 주의 — 으깨 제공',time:30}, '5y':{texture:'부드러운 콩',tip:'',time:30}, '6-7y':{texture:'일반',tip:'',time:30} } },
  { ing:'땅콩', name:'땅콩 소스 무침', method:'무침·생채', ings:['땅콩버터(무가당)','두부','채소'], allergens:['땅콩','대두'], nutri:'단백질·불포화지방',
    steps:['땅콩버터를 물에 풀어 소스를 만든다','데친 채소·두부에 곱게 버무린다'],
    ages:{ '3-4y':{texture:'곱게 간 땅콩버터만(통땅콩 금지)',tip:'땅콩 알레르겐 — 첫 노출 극소량·반응 관찰, 통견과 질식 금지',time:8}, '5y':{texture:'땅콩버터 소스',tip:'알레르겐 주의',time:8}, '6-7y':{texture:'일반',tip:'',time:8} } },

  // 생선
  { ing:'가자미', name:'가자미 살 죽', method:'죽·미음', ings:['가자미살','애호박','쌀','물'], allergens:[], nutri:'단백질·저지방',
    steps:['가자미살의 가시를 제거해 잘게 다진다','쌀죽에 넣어 푹 끓인다'],
    ages:{ younger:{texture:'곱게 다진 부드러운 죽',tip:'가시 두 번 확인',time:25}, '3-4y':{texture:'부드러운 죽',tip:'가시 확인',time:25} } },
  { ing:'갈치', name:'갈치 무조림', method:'조림·찜', ings:['갈치','무','간장','물'], allergens:[], nutri:'단백질·비타민D',
    steps:['무를 깔고 가시 제거한 갈치를 올린다','간장 소량으로 자작하게 조린다'],
    ages:{ '3-4y':{texture:'살 발라 부드럽게',tip:'잔가시 많음 — 꼭 확인',time:20}, '5y':{texture:'살 발라',tip:'가시 확인',time:20}, '6-7y':{texture:'일반',tip:'',time:20} } },
  { ing:'대구', name:'대구 살 채소죽', method:'죽·미음', ings:['대구살','당근','애호박','쌀','물'], allergens:[], nutri:'단백질·저지방',
    steps:['대구살 가시를 제거해 잘게 다진다','쌀죽에 채소와 함께 끓인다'],
    ages:{ younger:{texture:'곱게 다진 죽',tip:'가시 확인',time:25}, '3-4y':{texture:'부드러운 죽',tip:'',time:25}, '5y':{texture:'대구탕(살 발라)',tip:'',time:25} } },

  // 고기
  { ing:'오리고기', name:'오리고기 채소볶음', method:'볶음·구이', ings:['오리살','양파','부추','간장'], allergens:[], nutri:'단백질·불포화지방',
    steps:['오리살의 기름을 적당히 제거하고 잘게 썬다','채소와 함께 볶아 간장 소량으로 간한다'],
    ages:{ '5y':{texture:'기름 적게, 잘게 썰어',tip:'기름기 많아 소량',time:14}, '6-7y':{texture:'일반 볶음',tip:'',time:14} } },

  // 계란류
  { ing:'계란', name:'계란찜', method:'조림·찜', ings:['계란','물','대파 약간'], allergens:['달걀'], nutri:'콜린·단백질·비타민D',
    steps:['계란을 풀어 물과 1:1로 섞어 거른다','약불 또는 전자레인지로 부드럽게 찐다'],
    ages:{ younger:{texture:'순두부처럼 부드럽게',tip:'첫 노출 소량 관찰',time:10}, '3-4y':{texture:'부드러운 찜',tip:'',time:10}, '5y':{texture:'일반',tip:'',time:10}, '6-7y':{texture:'일반',tip:'',time:10} } },
  { ing:'메추리알', name:'메추리알 채소조림', method:'조림·찜', ings:['메추리알','당근','감자','간장'], allergens:['달걀'], nutri:'단백질·철',
    steps:['메추리알을 삶아 껍질을 깐다','채소와 함께 간장 소량으로 조린다'],
    ages:{ younger:{texture:'반으로 잘라 또는 으깸',tip:'통째 금지(질식) — 잘게',time:18}, '3-4y':{texture:'반으로 잘라',tip:'',time:18}, '5y':{texture:'한입',tip:'',time:18}, '6-7y':{texture:'일반',tip:'',time:18} } },

  // 버섯
  { ing:'팽이버섯', name:'팽이 달걀국', method:'국·탕', ings:['팽이버섯','달걀','멸치육수'], allergens:['달걀'], nutri:'식이섬유·비타민B',
    steps:['팽이를 잘게 썰어 육수에 끓인다','달걀을 풀어 둘러 부드럽게 익힌다'],
    ages:{ younger:{texture:'팽이 잘게 썰어',tip:'길고 미끄러우니 짧게 썰기',time:10}, '3-4y':{texture:'잘게',tip:'',time:10}, '5y':{texture:'먹기 좋게',tip:'',time:10}, '6-7y':{texture:'일반',tip:'',time:10} } },

  // 과일
  { ing:'참외', name:'참외 (생과일)', method:'핑거푸드', ings:['참외'], allergens:[], nutri:'비타민C·수분',
    steps:['참외 껍질과 씨를 제거한다','작게 썰거나 으깬다'],
    ages:{ younger:{texture:'곱게 으깨거나 아주 작게',tip:'씨 제거',time:5}, '3-4y':{texture:'작게 썰어',tip:'',time:5}, '5y':{texture:'한입',tip:'',time:5}, '6-7y':{texture:'일반',tip:'',time:5} } },

  // 갑각·조개
  { ing:'바지락', name:'바지락 채소죽', method:'죽·미음', ings:['바지락살','애호박','당근','쌀','바지락육수'], allergens:['조개'], nutri:'철·타우린·단백질',
    steps:['바지락을 삶아 살만 발라 잘게 다진다','육수에 쌀과 채소를 넣어 죽을 쑨다','바지락살을 넣어 마무리'],
    ages:{ younger:{texture:'곱게 다진 죽',tip:'조개 알레르겐 — 첫 노출 소량',time:25}, '3-4y':{texture:'부드러운 죽',tip:'',time:25} } },
  { ing:'조개', name:'조갯살 채소죽', method:'죽·미음', ings:['조갯살','애호박','쌀','조개육수'], allergens:['조개'], nutri:'철·단백질',
    steps:['조갯살을 잘게 다진다','육수에 쌀·채소를 넣어 죽을 쑨다','조갯살을 넣어 끓인다'],
    ages:{ younger:{texture:'곱게 다진 죽',tip:'알레르겐 주의',time:25}, '3-4y':{texture:'부드러운 죽',tip:'',time:25} } },
  { ing:'오징어', name:'오징어 채소죽', method:'죽·미음', ings:['오징어','애호박','당근','쌀','물'], allergens:['오징어'], nutri:'단백질·타우린',
    steps:['오징어를 아주 잘게 다진다(질김 주의)','쌀죽에 채소와 함께 푹 끓인다'],
    ages:{ '3-4y':{texture:'아주 잘게 다져 부드럽게',tip:'질겨서 곱게 다짐, 알레르겐 주의',time:25}, '5y':{texture:'잘게 썰어 푹 익힘',tip:'',time:25}, '6-7y':{texture:'잘게',tip:'',time:25} } },
  { ing:'홍합', name:'홍합 미역국', method:'국·탕', ings:['홍합살','미역','국간장'], allergens:['조개'], nutri:'철·요오드·단백질',
    steps:['홍합을 삶아 살만 발라 잘게 썬다','미역과 함께 끓여 국간장 소량으로 간한다'],
    ages:{ '3-4y':{texture:'홍합살 잘게 썰어',tip:'조개 알레르겐 주의',time:20}, '5y':{texture:'먹기 좋게',tip:'',time:20}, '6-7y':{texture:'일반',tip:'',time:20} } },

  // 견과 (영유아 통견과 금지 → 가루·페이스트)
  { ing:'아몬드', name:'아몬드가루 죽 토핑', method:'죽·미음', ings:['아몬드가루','죽 또는 요거트'], allergens:['견과'], nutri:'비타민E·불포화지방',
    steps:['아몬드를 곱게 갈아 가루로 만든다','죽이나 요거트에 소량 뿌린다'],
    ages:{ younger:{texture:'곱게 간 가루만(통아몬드 금지)',tip:'질식 위험 — 반드시 가루, 첫 노출 소량',time:5}, '3-4y':{texture:'가루로',tip:'통견과 금지',time:5}, '5y':{texture:'가루·잘게',tip:'',time:5} } },
  { ing:'호두', name:'호두가루 토핑', method:'무침·생채', ings:['호두가루','나물 또는 죽'], allergens:['견과'], nutri:'오메가3·비타민E',
    steps:['호두를 곱게 갈아 가루로 만든다','나물이나 죽에 소량 뿌려 고소함을 더한다'],
    ages:{ younger:{texture:'곱게 간 가루만',tip:'통호두 금지(질식), 첫 노출 소량',time:5}, '3-4y':{texture:'가루로',tip:'',time:5}, '5y':{texture:'가루·잘게',tip:'',time:5} } },
  { ing:'대두', name:'대두 콩조림', method:'조림·찜', ings:['대두(콩)','간장','참기름'], allergens:['대두'], nutri:'단백질·식이섬유',
    steps:['콩을 푹 삶아 부드럽게 한다','간장 소량으로 조린다'],
    ages:{ '3-4y':{texture:'푹 삶아 으깨거나 잘게',tip:'통콩은 질식 주의 — 으깨 제공',time:30}, '5y':{texture:'부드러운 콩',tip:'',time:30}, '6-7y':{texture:'일반',tip:'',time:30} } },
];
