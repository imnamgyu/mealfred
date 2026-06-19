/**
 * 아린(43942d34) 재생성 편지 전량 덤프 — 연속성 자가정독(랄프위검)용.
 *   각 편지: 날짜 · 커리큘럼(unit/step/mode/pivot) · 시나리오 · 주간 arc 단계 · 영양거울 노출 · 본문.
 * 실행: node --env-file=.env.local scripts/arin-read.mjs           (전문)
 *       node --env-file=.env.local scripts/arin-read.mjs --json     (구조화 JSON — 리뷰 에이전트용)
 */
import { createClient } from '@supabase/supabase-js';
const CID = '43942d34-b339-4bbd-978a-ec3f6a877031';
const JSON_OUT = process.argv.includes('--json');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await sb.from('coach_letters').select('letter_date,letter,oneliner,context').eq('child_id', CID).order('letter_date', { ascending: true });
const rows = data || [];
const out = rows.map((r) => {
  const c = r.context || {};
  return {
    date: r.letter_date,
    curriculum: c.curriculum ? `${c.curriculum.unit}/${c.curriculum.step}단/${c.curriculum.mode}${c.curriculum.pivotTo ? `→${c.curriculum.pivotTo}` : ''}` : null,
    scenario: c.scenarioId || null,
    arcStage: c.weekly?.arc?.stage || null,
    lever: c.weekly?.lever || null,
    behaviorGoal: c.weekly?.arc?.behaviorGoal || null,
    recoIng: c.recoIng || null,
    planSlot: c.planSlot ? `슬롯${c.planSlot.slotIndex}·${c.planSlot.ingredient}(${c.planSlot.track})${c.planSlot.dishes?.length ? '→'+c.planSlot.dishes.join('/') : ''}${c.planSlot.macro ? '·macro' : ''}${c.planSlot.mirrorKind ? '·거울:'+c.planSlot.mirrorKind : ''}` : null,
    stepStory: c.weekly?.arc?.stepStory ? `${c.weekly.arc.stepStory.mode}·${c.weekly.arc.stepStory.stepNum}/${c.weekly.arc.stepStory.totalSteps}단·${c.weekly.arc.stepStory.unitDays}일째${c.weekly.arc.stepStory.nextBehavior ? `·다음:${c.weekly.arc.stepStory.nextBehavior.slice(0,14)}` : ''}` : null,
    mirror: c.weekly?.arc?.progressNote || null,
    move: c.plan?.move || null,
    oneliner: r.oneliner,
    letter: r.letter,
  };
});

if (JSON_OUT) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }

for (const r of out) {
  console.log(`\n━━ ${r.date}  [${r.curriculum || '-'} · ${r.scenario || '-'} · arc:${r.arcStage || '-'} · lever:${r.lever || '-'}]`);
  console.log(`   행동목표: ${r.behaviorGoal || '-'} · 무브: ${r.move || '-'} · 추천: ${r.recoIng || '-'}${r.stepStory ? ` · 📈step:${r.stepStory}` : ''}${r.planSlot ? `\n   🎚️주간슬롯: ${r.planSlot}` : ''}`);
  console.log(r.letter);
}
console.log(`\n총 ${out.length}통.`);
