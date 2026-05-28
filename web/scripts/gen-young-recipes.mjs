// 영유아(만 1~7세) age-matched 레시피 생성 → ingredient_recipes 에 저장 (detail jsonb)
// 기존 학령기(만6-18세) 레시피를 "참고"로 넣어 연령에 맞게 순화·변형. per 연령당 N개(다양성).
// 일회성 빌드: LLM 생성·검수 → 이후 식단 composer는 LLM 없이 결정적으로 서빙.
//
// 사용:
//   cd web && node --env-file=.env.local scripts/gen-young-recipes.mjs --dry --only=시금치 --per=3
//   cd web && node --env-file=.env.local scripts/gen-young-recipes.mjs --per=3        (전체 저장, 기존 AI템플릿 정리 후)

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const only = (args.find(a => a.startsWith('--only=')) || '').split('=')[1]?.split(',').filter(Boolean) || null;
const PER = parseInt((args.find(a => a.startsWith('--per=')) || '--per=3').split('=')[1], 10) || 3;
const SOURCE = 'AI 생성(영유아 템플릿)';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const AGE_BANDS = [
  { code: 'younger', label: '만 1-2세', rule: '잘게 다지거나 으깨 부드럽게. 통견과·딱딱하고 둥근 것·떡·포도알 통째 금지(질식). 간 최소(저염), 꿀 금지. 손으로 잡는 핑거푸드 OK.' },
  { code: '3-4y', label: '만 3-4세', rule: '작게 썰기, 일부 핑거푸드·일반식. 질긴 고기·통견과 주의. 간 약하게.' },
  { code: '5y', label: '만 5세', rule: '일반식에 가까움. 매운·짠 양념 줄이기.' },
  { code: '6-7y', label: '만 6-7세(초1·2)', rule: '일반식. 가족식과 비슷하되 자극적 양념 절제.' },
];

const RECIPE = {
  type: 'object',
  properties: {
    recipe_name: { type: 'string' },
    cooking_method: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    texture: { type: 'string' },
    tip: { type: 'string' },
    time_min: { type: 'integer' },
    allergens: { type: 'array', items: { type: 'string' } },
    nutri_point: { type: 'string' },
  },
  required: ['recipe_name', 'cooking_method', 'ingredients', 'steps', 'texture', 'tip', 'time_min', 'allergens', 'nutri_point'],
  additionalProperties: false,
};
const SCHEMA = { type: 'object', properties: { recipes: { type: 'array', items: RECIPE } }, required: ['recipes'], additionalProperties: false };

// 같은 식재료의 기존 학령기 레시피(detail null)를 참고로 — 만6-11세 우선
async function fetchReference(ingId) {
  const { data } = await supabase
    .from('ingredient_recipes')
    .select('recipe_name,cooking_method,age_band')
    .eq('ingredient_id', ingId)
    .is('detail', null)
    .limit(40);
  if (!data || !data.length) return [];
  const rank = { '만3-5세(유아)': 0, '만6-11세': 1, '만12-18세': 2 };
  data.sort((a, b) => (rank[a.age_band] ?? 9) - (rank[b.age_band] ?? 9));
  return data.slice(0, 8).map(r => `${r.recipe_name}(${r.cooking_method})`);
}

async function genRecipes(ingName, band, n, refList) {
  const refBlock = refList.length
    ? `\n[참고 — 실제 급식/가정에서 쓰는 '${ingName}' 메뉴]: ${refList.join(', ')}\n위 참고 메뉴를 ${band.label}에 맞게 "순화"(식감 부드럽게·간 약하게·안전)해서 변형하거나, 영유아에 더 적합한 메뉴로. 그대로 베끼지 말 것.`
    : '';
  const prompt = `${band.label} 아이에게 '${ingName}'를 먹이는 한국 가정 레시피 ${n}개를 **서로 다른 조리법으로 다양하게** 만들어줘.${refBlock}
[연령 안전 — 반드시 지킬 것] ${band.rule}
각 레시피 필드:
- recipe_name: 흔한 가정식 이름 (예: "시금치 두부무침")
- cooking_method: 국·탕 / 볶음·구이 / 무침·생채 / 조림·찜 / 죽·미음 / 밥·면류 / 전 / 핑거푸드 중 하나
- ingredients: 주재료('${ingName}') 포함 5개 이내, 실제 구할 수 있는 것
- steps: 3~5단계, 짧고 명확히
- texture: 이 연령에 맞춘 식감 처리 (예: "잘게 다져 으깸")
- tip: 안전·편식 팁 한 줄 (질식·알레르겐·소량 반복노출 등)
- time_min: 조리 시간(분, 현실적)
- allergens: 식약처 알레르겐 중 해당 (없으면 [])
- nutri_point: 아이에게 주는 핵심 영양 (예: "철분·엽산")
**실제로 아이가 먹을 만한 현실적인 레시피만.** ${n}개는 조리법이 겹치지 않게. recipes 배열로 응답.`;
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
  });
  const tb = resp.content.find((b) => b.type === 'text');
  return (JSON.parse(tb.text).recipes || []).slice(0, n);
}

async function main() {
  const { data, error } = await supabase
    .from('ingredients').select('id,name,grade_label').in('grade_label', ['필수', '권장']);
  if (error) { console.error('ingredients 조회 실패:', error.message); process.exit(1); }
  let ings = data;
  if (only) ings = ings.filter((i) => only.includes(i.name));
  console.log(`대상 ${ings.length}종 × ${AGE_BANDS.length}연령 × ${PER}개 = ${ings.length * AGE_BANDS.length * PER} 레시피 ${DRY ? '(DRY · 미저장)' : ''}`);

  if (!DRY && !only) {
    const { error: delErr } = await supabase.from('ingredient_recipes').delete().eq('source', SOURCE);
    console.log(delErr ? `기존 AI 템플릿 정리 실패: ${delErr.message}` : '기존 AI 템플릿 정리 완료(재실행 안전)');
  }

  let made = 0, failed = 0;
  for (const ing of ings) {
    const ref = await fetchReference(ing.id);
    for (const band of AGE_BANDS) {
      try {
        const recipes = await genRecipes(ing.name, band, PER, ref);
        for (let i = 0; i < recipes.length; i++) {
          const r = recipes[i];
          made++;
          if (DRY) {
            console.log(`\n[${ing.name} · ${band.label}] ${r.recipe_name} (${r.cooking_method}, ${r.time_min}분)`);
            console.log('  재료:', r.ingredients.join('·'), '| 식감:', r.texture, '| 영양:', r.nutri_point);
            console.log('  조리:', r.steps.join(' → '));
            console.log('  팁:', r.tip, '| 알레르겐:', (r.allergens || []).join(',') || '없음');
          } else {
            await supabase.from('ingredient_recipes').insert({
              ingredient_id: ing.id, recipe_name: r.recipe_name, age_band: band.code,
              cooking_method: r.cooking_method, allergens: (r.allergens || []).join(','),
              is_top_pick: i === 0, rank_in_ingredient: i + 1, source: SOURCE,
              detail: { ingredients: r.ingredients, steps: r.steps, texture: r.texture, tip: r.tip, time_min: r.time_min, nutri_point: r.nutri_point },
            });
          }
        }
      } catch (e) { failed++; console.error(`  ✗ ${ing.name}/${band.code}: ${e.message}`); }
    }
    if (!DRY) console.log(`  · ${ing.name} 완료 (누적 ${made})`);
  }
  console.log(`\n완료: ${made} ${DRY ? '생성(미저장)' : '저장'} · 실패 ${failed}`);
}

main();
