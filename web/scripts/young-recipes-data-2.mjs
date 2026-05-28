// 영유아 레시피 배치 2 (직접 작성, LLM API 미사용) — 잎채소/뿌리/열매/곡물/콩/생선/고기/유제품/버섯/과일/기타
export const RECIPES = [
  // 잎채소
  { ing:'배추', name:'배추 된장국', method:'국·탕', ings:['배추','된장','두부','대파'], allergens:['대두'], nutri:'비타민C·엽산·식이섬유',
    steps:['물에 된장을 약간 풀어 끓인다','배추와 두부를 넣어 푹 끓인다','대파를 넣고 마무리'],
    ages:{ younger:{texture:'배추 잘게 썰어 푹 익힘, 저염',tip:'된장 아주 소량',time:15}, '3-4y':{texture:'잘게 썰어 부드럽게',tip:'',time:15}, '5y':{texture:'먹기 좋게',tip:'',time:15}, '6-7y':{texture:'일반',tip:'',time:15} } },
  { ing:'양배추', name:'양배추 찜', method:'조림·찜', ings:['양배추','참기름','약간의 소금'], allergens:[], nutri:'비타민C·식이섬유',
    steps:['양배추를 부드럽게 찐다','한입 크기로 썬다','참기름 살짝 둘러준다'],
    ages:{ younger:{texture:'아주 부드럽게 쪄 잘게',tip:'질긴 심 제거',time:10}, '3-4y':{texture:'부드러운 한입',tip:'',time:10}, '5y':{texture:'한입 크기',tip:'쌈으로도',time:10}, '6-7y':{texture:'일반',tip:'',time:10} } },
  { ing:'근대', name:'근대 된장국', method:'국·탕', ings:['근대','된장','멸치육수'], allergens:[], nutri:'철·엽산·비타민K',
    steps:['멸치육수를 낸다','된장을 풀고 근대를 넣어 끓인다','부드러워지면 마무리'],
    ages:{ younger:{texture:'근대 잘게, 저염',tip:'',time:15}, '3-4y':{texture:'잘게 썰어',tip:'',time:15}, '5y':{texture:'먹기 좋게',tip:'',time:15} } },
  { ing:'청경채', name:'청경채 두부볶음', method:'볶음·구이', ings:['청경채','두부','참기름'], allergens:['대두'], nutri:'비타민A·칼슘',
    steps:['청경채를 데쳐 잘게 썬다','두부를 으깨 함께 볶는다','참기름으로 마무리'],
    ages:{ younger:{texture:'잘게 다져 두부와 으깸',tip:'',time:10}, '3-4y':{texture:'잘게 썰어',tip:'',time:10}, '5y':{texture:'한입',tip:'',time:10}, '6-7y':{texture:'일반',tip:'',time:10} } },
  { ing:'아욱', name:'아욱 된장국', method:'국·탕', ings:['아욱','된장','멸치육수'], allergens:[], nutri:'철·칼슘·식이섬유',
    steps:['아욱을 주물러 씻어 풋내를 뺀다','멸치육수에 된장을 풀고 아욱을 넣는다','푹 끓여 부드럽게 한다'],
    ages:{ younger:{texture:'잘게, 저염',tip:'',time:18}, '3-4y':{texture:'잘게 썰어',tip:'',time:18}, '5y':{texture:'먹기 좋게',tip:'',time:18} } },

  // 뿌리채소
  { ing:'무', name:'소고기 뭇국', method:'국·탕', ings:['무','소고기','국간장','참기름'], allergens:['소고기'], nutri:'비타민C·소화효소',
    steps:['소고기를 참기름에 볶는다','무를 넣고 물을 부어 끓인다','국간장 소량으로 간한다'],
    ages:{ younger:{texture:'무·고기 잘게, 저염',tip:'',time:20}, '3-4y':{texture:'잘게 썰어',tip:'',time:20}, '5y':{texture:'먹기 좋게',tip:'',time:20}, '6-7y':{texture:'일반',tip:'',time:20} } },
  { ing:'연근', name:'연근 조림', method:'조림·찜', ings:['연근','간장','참기름'], allergens:[], nutri:'식이섬유·비타민C',
    steps:['연근을 얇게 썰어 푹 삶는다','간장 소량으로 자작하게 조린다','참기름으로 마무리'],
    ages:{ '3-4y':{texture:'얇게 썰어 푹 익혀 부드럽게',tip:'딱딱하면 더 삶기',time:20}, '5y':{texture:'한입 크기',tip:'',time:20}, '6-7y':{texture:'일반 조림',tip:'',time:20} } },

  // 열매채소
  { ing:'토마토', name:'토마토 달걀볶음', method:'볶음·구이', ings:['토마토','달걀','식용유 약간'], allergens:['달걀'], nutri:'리코펜·비타민C',
    steps:['토마토를 데쳐 껍질 벗겨 잘게 썬다','달걀을 풀어 스크램블한다','토마토를 넣어 가볍게 볶는다'],
    ages:{ younger:{texture:'껍질 벗겨 잘게, 부드럽게',tip:'',time:10}, '3-4y':{texture:'잘게 썰어',tip:'',time:10}, '5y':{texture:'한입',tip:'',time:10}, '6-7y':{texture:'일반',tip:'',time:10} } },
  { ing:'호박', name:'단호박 매시', method:'죽·미음', ings:['단호박','우유 또는 분유 약간'], allergens:['우유'], nutri:'비타민A·식이섬유',
    steps:['단호박을 푹 쪄 껍질을 벗긴다','곱게 으깬다','우유 약간 섞어 농도를 맞춘다'],
    ages:{ younger:{texture:'부드러운 매시',tip:'',time:15}, '3-4y':{texture:'으깬 매시',tip:'',time:15} } },
  { ing:'가지', name:'가지 된장볶음', method:'볶음·구이', ings:['가지','된장 약간','참기름'], allergens:['대두'], nutri:'안토시아닌·식이섬유',
    steps:['가지를 부드럽게 쪄 썬다','된장 소량에 가볍게 볶는다','참기름으로 마무리'],
    ages:{ '3-4y':{texture:'부드럽게 쪄 잘게',tip:'저염',time:12}, '5y':{texture:'한입',tip:'',time:12}, '6-7y':{texture:'일반',tip:'',time:12} } },
  { ing:'오이', name:'오이 두부무침', method:'무침·생채', ings:['오이','두부','참기름'], allergens:['대두'], nutri:'수분·비타민K',
    steps:['오이를 잘게 다진다','두부를 으깬다','참기름 살짝 둘러 무친다'],
    ages:{ '3-4y':{texture:'잘게 다져 두부와',tip:'생오이는 잘게',time:8}, '5y':{texture:'한입',tip:'',time:8}, '6-7y':{texture:'일반',tip:'',time:8} } },
  { ing:'파프리카', name:'파프리카 닭고기볶음', method:'볶음·구이', ings:['파프리카','닭안심','참기름'], allergens:[], nutri:'비타민C·비타민A',
    steps:['파프리카·닭안심을 잘게 썬다','닭을 먼저 볶다 파프리카를 넣는다','참기름으로 마무리'],
    ages:{ '3-4y':{texture:'잘게 썰어 부드럽게',tip:'',time:12}, '5y':{texture:'한입',tip:'',time:12}, '6-7y':{texture:'일반',tip:'',time:12} } },

  // 곡물·탄수
  { ing:'감자', name:'감자 매시', method:'죽·미음', ings:['감자','우유 또는 분유 약간'], allergens:['우유'], nutri:'비타민C·칼륨',
    steps:['감자를 푹 삶는다','곱게 으깬다','우유 약간 섞어 부드럽게'],
    ages:{ younger:{texture:'부드러운 매시',tip:'',time:18}, '3-4y':{texture:'으깬 매시',tip:'',time:18}, '5y':{texture:'살짝 덩어리',tip:'',time:18} } },
  { ing:'옥수수', name:'옥수수 채소죽', method:'죽·미음', ings:['옥수수','쌀','당근','물'], allergens:[], nutri:'식이섬유·탄수',
    steps:['옥수수알을 곱게 갈거나 으깬다','쌀죽에 옥수수·다진 당근을 넣는다','푹 끓여 부드럽게'],
    ages:{ younger:{texture:'옥수수 곱게 갈아 죽',tip:'옥수수알 통째 금지(질식)',time:22}, '3-4y':{texture:'으깬 옥수수죽',tip:'',time:22} } },

  // 콩
  { ing:'콩나물', name:'콩나물 무침', method:'무침·생채', ings:['콩나물','참기름','국간장'], allergens:[], nutri:'비타민C·식이섬유',
    steps:['콩나물을 푹 삶는다','잘게 썬다','참기름·국간장 소량으로 무친다'],
    ages:{ '3-4y':{texture:'푹 삶아 잘게 썰어',tip:'머리·꼬리 떼고 부드럽게',time:12}, '5y':{texture:'한입',tip:'',time:12}, '6-7y':{texture:'일반',tip:'',time:12} } },

  // 생선
  { ing:'명태', name:'명태살 채소죽', method:'죽·미음', ings:['명태살','애호박','당근','쌀','물'], allergens:[], nutri:'단백질·저지방',
    steps:['명태살의 가시를 제거하고 잘게 다진다','채소를 잘게 다진다','쌀죽에 넣어 푹 끓인다'],
    ages:{ younger:{texture:'생선 곱게 다진 죽',tip:'가시 두 번 확인',time:25}, '3-4y':{texture:'부드러운 죽',tip:'가시 확인',time:25} } },
  { ing:'삼치', name:'삼치 무조림', method:'조림·찜', ings:['삼치','무','간장','물'], allergens:[], nutri:'DHA·단백질·비타민D',
    steps:['무를 깔고 물을 부어 끓인다','가시 제거한 삼치를 올린다','간장 소량으로 조린다'],
    ages:{ '3-4y':{texture:'살 발라 부드럽게',tip:'먹이기 전 가시 확인',time:20}, '5y':{texture:'살 발라',tip:'가시 확인',time:20}, '6-7y':{texture:'일반 조림',tip:'',time:20} } },

  // 고기
  { ing:'소고기', name:'소고기 미역국', method:'국·탕', ings:['소고기','미역','국간장','참기름'], allergens:[], nutri:'철·아연·단백질·요오드',
    steps:['소고기를 참기름에 볶는다','불린 미역을 넣어 볶다 물을 붓는다','푹 끓여 국간장 소량으로 간한다'],
    ages:{ younger:{texture:'고기·미역 잘게, 저염',tip:'',time:25}, '3-4y':{texture:'잘게 썰어',tip:'',time:25}, '5y':{texture:'먹기 좋게',tip:'',time:25}, '6-7y':{texture:'일반',tip:'',time:25} } },
  { ing:'돼지고기', name:'돼지고기 채소볶음', method:'볶음·구이', ings:['돼지고기','양파','애호박','간장'], allergens:[], nutri:'비타민B1·단백질',
    steps:['돼지고기·채소를 잘게 썬다','고기를 익히고 채소를 넣어 볶는다','간장 소량으로 마무리'],
    ages:{ '3-4y':{texture:'잘게 썰어 부드럽게',tip:'기름기 적은 부위',time:14}, '5y':{texture:'한입',tip:'',time:14}, '6-7y':{texture:'일반',tip:'',time:14} } },

  // 유제품
  { ing:'우유', name:'단호박 우유스프', method:'국·탕', ings:['우유','단호박','양파'], allergens:['우유'], nutri:'칼슘·비타민D·비타민A',
    steps:['단호박·양파를 푹 삶아 곱게 간다','우유를 넣어 약불에 데운다','부드럽게 농도를 맞춘다'],
    ages:{ younger:{texture:'부드러운 스프',tip:'우유 알레르겐 확인',time:18}, '3-4y':{texture:'스프',tip:'',time:18}, '5y':{texture:'스프',tip:'',time:18}, '6-7y':{texture:'스프',tip:'',time:18} } },
  { ing:'치즈', name:'치즈 채소오믈렛', method:'전', ings:['아기치즈','달걀','애호박','당근'], allergens:['우유','달걀'], nutri:'칼슘·단백질',
    steps:['채소를 잘게 다져 달걀에 섞는다','약불 팬에 부치다 치즈를 올린다','반 접어 부드럽게 익힌다'],
    ages:{ younger:{texture:'잘게 썰어 부드럽게',tip:'저염 아기치즈',time:10}, '3-4y':{texture:'한입',tip:'',time:10}, '5y':{texture:'일반',tip:'',time:10}, '6-7y':{texture:'일반',tip:'',time:10} } },

  // 버섯
  { ing:'느타리버섯', name:'느타리 들깨볶음', method:'볶음·구이', ings:['느타리버섯','들깨가루','국간장','참기름'], allergens:[], nutri:'식이섬유·비타민D',
    steps:['느타리를 결대로 찢어 잘게 썬다','참기름에 볶다 들깨가루를 넣는다','국간장 소량으로 마무리'],
    ages:{ '3-4y':{texture:'잘게 썰어 부드럽게',tip:'질기면 더 익히기',time:10}, '5y':{texture:'한입',tip:'',time:10}, '6-7y':{texture:'일반',tip:'',time:10} } },
  { ing:'양송이버섯', name:'양송이 스프', method:'국·탕', ings:['양송이버섯','양파','우유','버터 약간'], allergens:['우유'], nutri:'식이섬유·단백질',
    steps:['양송이·양파를 볶아 곱게 간다','우유를 넣어 약불에 데운다','부드럽게 농도를 맞춘다'],
    ages:{ younger:{texture:'부드러운 스프',tip:'',time:15}, '3-4y':{texture:'스프',tip:'',time:15}, '5y':{texture:'스프',tip:'',time:15}, '6-7y':{texture:'스프',tip:'',time:15} } },

  // 과일
  { ing:'배', name:'배 갈이', method:'핑거푸드', ings:['배'], allergens:[], nutri:'수분·식이섬유',
    steps:['배 껍질을 벗긴다','강판에 갈거나 아주 잘게 썬다','그대로 먹인다'],
    ages:{ younger:{texture:'갈아서 또는 곱게 으깸',tip:'통째 금지 — 갈거나 잘게',time:5}, '3-4y':{texture:'작게 썰어',tip:'',time:5}, '5y':{texture:'한입 크기',tip:'',time:5}, '6-7y':{texture:'일반',tip:'',time:5} } },
  { ing:'귤', name:'귤 (생과일)', method:'핑거푸드', ings:['귤'], allergens:[], nutri:'비타민C·엽산',
    steps:['귤 껍질을 벗긴다','속 흰 실과 씨를 제거한다','한 알씩 작게 떼어 준다'],
    ages:{ younger:{texture:'속껍질·씨 제거, 작게',tip:'신맛 강하면 소량',time:3}, '3-4y':{texture:'작게 떼어',tip:'',time:3}, '5y':{texture:'한 조각',tip:'',time:3}, '6-7y':{texture:'일반',tip:'',time:3} } },
  { ing:'키위', name:'키위 (생과일)', method:'핑거푸드', ings:['키위'], allergens:['키위'], nutri:'비타민C·식이섬유',
    steps:['키위 껍질을 벗긴다','작게 썰거나 으깬다','그대로 먹인다'],
    ages:{ younger:{texture:'곱게 으깸',tip:'키위 알레르겐 — 첫 노출 소량',time:3}, '3-4y':{texture:'작게 썰어',tip:'알레르겐 주의',time:3}, '5y':{texture:'한입',tip:'',time:3}, '6-7y':{texture:'일반',tip:'',time:3} } },

  // 기타채소
  { ing:'양파', name:'양파 달걀볶음', method:'볶음·구이', ings:['양파','달걀','식용유 약간'], allergens:['달걀'], nutri:'비타민C·식이섬유',
    steps:['양파를 잘게 썰어 투명해질 때까지 볶는다(단맛↑)','달걀을 풀어 넣고 스크램블한다','부드럽게 익혀 마무리'],
    ages:{ younger:{texture:'양파 푹 볶아 달게, 잘게',tip:'',time:10}, '3-4y':{texture:'잘게',tip:'',time:10}, '5y':{texture:'한입',tip:'',time:10}, '6-7y':{texture:'일반',tip:'',time:10} } },
  { ing:'부추', name:'부추 달걀전', method:'전', ings:['부추','달걀','밀가루'], allergens:['달걀','밀'], nutri:'비타민A·비타민C',
    steps:['부추를 잘게 썬다','달걀·밀가루와 반죽한다','약불 팬에 작게 부친다'],
    ages:{ younger:{texture:'잘게 썰어 작고 얇게',tip:'밀·달걀 알레르겐 확인',time:12}, '3-4y':{texture:'한입',tip:'',time:12}, '5y':{texture:'일반',tip:'',time:12}, '6-7y':{texture:'일반',tip:'',time:12} } },
];
