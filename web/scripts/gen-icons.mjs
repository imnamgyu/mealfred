/**
 * gen-icons.mjs — 도감 식재료 아이콘 일괄 생성 (OpenAI gpt-image-1).
 *
 * 밀프레드 디자인(따뜻·둥글·플랫·투명배경·다크금지·글자없음)으로 통일된 식재료 아이콘을
 * 풀 전체에 대해 생성해 web/public/icons/<nm>.png 로 저장. 이미 있으면 건너뜀(이어돌리기).
 *
 * 실행:
 *   export OPENAI_API_KEY=sk-...        # 본인 키 (코드/깃에 안 들어감)
 *   ICON_DRYRUN=1 node scripts/gen-icons.mjs     # 비용·개수만 미리보기(과금 X)
 *   node scripts/gen-icons.mjs                    # 실제 생성
 * 옵션(env): ICON_MODEL(gpt-image-1|dall-e-3) · ICON_QUALITY(low|medium|high|standard|hd) · ICON_SIZE(1024x1024)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const MODEL = process.env.ICON_MODEL || 'gpt-image-1';
const QUALITY = process.env.ICON_QUALITY || 'medium';
const SIZE = process.env.ICON_SIZE || '1024x1024';
const DRY = process.env.ICON_DRYRUN === '1';
const KEY = process.env.OPENAI_API_KEY;
const OUT = 'public/icons';

// 대략 단가(USD/장) — 변동 가능, 공식 가격 확인 권장
const PRICE = { 'gpt-image-1': { low: 0.011, medium: 0.042, high: 0.167 }, 'dall-e-3': { standard: 0.04, hd: 0.08 } };
const unit = (PRICE[MODEL] || {})[QUALITY] ?? 0.042;

const CAT_HINT = {
  곡물_탄수: 'grain/rice/bread staple', 뿌리채소: 'root vegetable', 잎채소: 'leafy green vegetable',
  열매채소: 'fruiting vegetable', 기타채소: 'vegetable', 버섯: 'mushroom', 해조류: 'edible seaweed',
  콩_콩제품: 'bean / soy food', 고기: 'raw meat cut', 생선: 'whole fish', 갑각_조개: 'shellfish / crustacean',
  계란: 'egg', 유제품: 'dairy product', 과일: 'fruit', 견과_씨앗: 'nut / seed',
  향신_허브: 'herb / spice', 가공식품: 'processed food', 발효식품: 'fermented food',
};

const promptFor = (nm, cat) => `App icon of a single ${nm} (Korean ${CAT_HINT[cat] || 'food ingredient'}) for "Mealfred", a toddler nutrition app. Friendly rounded flat-vector illustration with fresh natural colors, soft highlights and a subtle soft shadow. Cute but not babyish, clean, wholesome, parent-friendly. Centered with generous padding, transparent background, smooth gradients, no harsh outlines, no text. 1:1 square, crisp at small sizes.`;

const pool = JSON.parse(readFileSync('public/ingredients-light.json', 'utf8')).ingredients;
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const todo = pool.filter((p) => !existsSync(`${OUT}/${p.nm}.png`));
console.log(`도감 ${pool.length}종 · 생성 대상 ${todo.length}종(이미 있는 건 스킵) · 모델 ${MODEL}/${QUALITY}`);
console.log(`예상 비용: ${todo.length} × $${unit} ≈ $${(todo.length * unit).toFixed(2)}  (≈ ₩${Math.round(todo.length * unit * 1380).toLocaleString()})`);

if (DRY) {
  console.log('\n[DRY RUN] 과금 없음. 프롬프트 샘플 3개:');
  todo.slice(0, 3).forEach((p) => console.log(`  · ${p.nm}: ${promptFor(p.nm, p.cat)}`));
  process.exit(0);
}
if (!KEY) { console.error('❌ OPENAI_API_KEY 환경변수가 없습니다.'); process.exit(1); }

const body = (prompt) => MODEL === 'gpt-image-1'
  ? { model: MODEL, prompt, size: SIZE, quality: QUALITY, background: 'transparent', n: 1 }
  : { model: MODEL, prompt, size: SIZE, quality: QUALITY, response_format: 'b64_json', n: 1 };

let done = 0, fail = 0;
for (const p of todo) {
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body(promptFor(p.nm, p.cat))),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || res.status);
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('no image');
    writeFileSync(`${OUT}/${p.nm}.png`, Buffer.from(b64, 'base64'));
    done++; console.log(`  ✓ ${done}/${todo.length} ${p.nm}`);
  } catch (e) {
    fail++; console.log(`  ✗ ${p.nm} — ${String(e).slice(0, 120)}`);
  }
}
console.log(`\n완료: ${done} 생성 · ${fail} 실패 · 실제 비용 ≈ $${(done * unit).toFixed(2)}`);
