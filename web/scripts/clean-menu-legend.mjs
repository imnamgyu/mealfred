/**
 * scripts/clean-menu-legend.mjs — 식단표 하단 범례/사이드바가 날짜열로 흡수된 오염 정리(2026-06-25 이전 적재분, 재import 불가).
 *   2단계: ① 마커·콜론·범례 토큰 strip → ② 점심이 strip 후에도 >10토큰(=식품군/제철 예시요리가 진짜메뉴와 뒤섞여 복구불가)이거나
 *          하루가 통째로 비면 그 '날짜 전체' 삭제. 그 외엔 strip만(깨끗한 점심 보존).
 *   실행: node --env-file=.env.local scripts/clean-menu-legend.mjs <institution_id|all>           (dry-run)
 *         node --env-file=.env.local scripts/clean-menu-legend.mjs <institution_id|all> --apply
 */
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ALLERGEN = new Set(['난류', '우유', '메밀', '땅콩', '대두', '밀', '고등어', '게', '새우', '돼지고기', '복숭아', '토마토', '아황산류', '아황산', '아황산염', '호두', '닭고기', '쇠고기', '오징어', '조개류', '잣', '메추리', '전복', '홍합', '이황산염', '이황산류', '이황신류', '목숭아', '교등어']);
const CATEGORY = new Set(['육류', '수산물', '식육', '두부류', '난류류', '오리고기', '돼지', '고기']); // 순수 분류어(메뉴 아님)
const DROP1 = new Set(['다', '종', '이', '의', '등', '외', '는', '을', '를', '가', '와', '과', '도', '만', '에', '로']); // 1글자 OCR파편·조사(음식 아님 — 귤·배·파·감·김은 보존)
const LEGEND_RE = /푸드브릿지|제철음식|어육가공품|식육가공품|수산물가공품|산화방지제|보존료|표백제|나트륨함량|간접노출|소극적노출|적극적노출|기호도\s*낮은|HAPPYNEWYEAR/;
const BRACKET_RE = /^\s*\[?(채소|해산물|과일|채소류|해산물류)\]/;
const GARBAGE_RE = /재료를|재료의|재료본래|섞기|비중을|거부감|다진재료|느끼기|형태를|함니|표기함|목적으|사용되는식품|식품첨|아황산류는|^징어$|^가물|^단계$|^월의|^월표|^월제|들어간날짜|메뉴별로|별도표기|포함되어|낮은식재료|단계적으로|저염식메뉴|^점심$|^간식$|^오전간식$|^오후간식$|제공됩니다|영양량|평균$|^mg$|존료/;
function strip(menus) {
  const toks0 = menus || [];
  const algN = toks0.filter((t) => ALLERGEN.has(t)).length;
  const out = [];
  for (let t of toks0) {
    if (/^\s*:/.test(t)) continue;                        // 콜론머리 = 푸드브릿지 단계요리 사이드바(통째 제거)
    t = t.replace(/^[-·→@'"*\s]+/, '').trim();            // OCR 머리기호만 제거(→찐감자→찐감자 보존)
    if (!t) continue;                                     // 머리기호만이던 토큰
    if (t.length < 2 && (!/[가-힣]/.test(t) || DROP1.has(t))) continue;  // 한글 아닌 단일문자 + OCR파편/조사만 제거 — 귤·배·감·파·김 등 1자 식품 보존
    if (LEGEND_RE.test(t) || BRACKET_RE.test(t) || GARBAGE_RE.test(t)) continue;
    if (CATEGORY.has(t)) continue;
    if (algN >= 4 && ALLERGEN.has(t)) continue;           // 알레르기 범례 클러스터만 제거(단독 '우유' 간식은 보존)
    out.push(t);
  }
  return out;
}

const arg = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!arg) { console.error('사용법: clean-menu-legend.mjs <institution_id|all> [--apply]'); process.exit(1); }

let mq = sb.from('institution_menus').select('id,institution_id,month');
if (arg !== 'all') mq = mq.eq('institution_id', arg);
const { data: menus } = await mq;
const instIds = [...new Set(menus.map((m) => m.institution_id))];
const { data: insts } = await sb.from('institutions').select('id,name,sigungu,sido').in('id', instIds);
const nameOf = Object.fromEntries(insts.map((i) => [i.id, `${i.name} (${i.sigungu || i.sido || ''})`]));

const delIds = [], updates = []; // updates: {id, menus}
let delDays = 0, stripRows = 0;
for (const m of menus) {
  const { data: items } = await sb.from('institution_menu_items').select('id,menu_date,slot,menus').eq('institution_menu_id', m.id);
  const byDate = {};
  for (const it of items || []) (byDate[it.menu_date] ||= []).push(it);
  for (const [date, rows] of Object.entries(byDate)) {
    const cleaned = rows.map((r) => ({ ...r, clean: strip(r.menus) }));
    const lunchRaw = (rows.find((r) => r.slot === 'lunch')?.menus || []).length;
    const lunchDump = lunchRaw >= 26;                               // 점심 원본 ≥26 = 하단범례 통째 흡수, 진짜메뉴 분리 불가
    const dayEmpty = cleaned.every((r) => r.clean.length === 0);    // 신정/사이드바만 = 빈 날
    if (!cleaned.some((r) => r.clean.length !== (r.menus || []).length)) continue; // 변화 없음
    if (lunchDump || dayEmpty) {
      delDays++;
      console.log(`🗑️  삭제 ${nameOf[m.institution_id]} ${date} (점심원본 ${lunchRaw}토큰, ${lunchDump ? '범례덤프' : '빈날'})`);
      for (const r of rows) { console.log(`     - ${r.slot}: ${(r.menus || []).join(', ')}`); delIds.push(r.id); }
    } else {
      for (const r of cleaned) {
        if (r.clean.length !== (r.menus || []).length) {
          stripRows++;
          console.log(`✂️  strip ${nameOf[m.institution_id]} ${date} ${r.slot}`);
          console.log(`     before: ${(r.menus || []).join(', ')}`);
          console.log(`     after : ${r.clean.join(', ') || '(빈칸→행삭제)'}`);
          if (r.clean.length === 0) delIds.push(r.id); else updates.push({ id: r.id, menus: r.clean });
        }
      }
    }
  }
}

console.log(`\n${APPLY ? '🔴 적용' : '🔍 DRY-RUN'} | ${arg === 'all' ? '전체' : nameOf[arg] || arg}`);
console.log(`삭제 날짜 ${delDays}일 · strip 행 ${stripRows}개 · 삭제행 ${delIds.length} · 수정행 ${updates.length}`);

if (APPLY) {
  for (let i = 0; i < delIds.length; i += 100) {
    const { error } = await sb.from('institution_menu_items').delete().in('id', delIds.slice(i, i + 100));
    if (error) { console.error('❌ 삭제 실패:', error.message); process.exit(1); }
  }
  for (const u of updates) {
    const { error } = await sb.from('institution_menu_items').update({ menus: u.menus }).eq('id', u.id);
    if (error) { console.error('❌ 수정 실패:', error.message); process.exit(1); }
  }
  console.log('✅ 적용 완료.');
} else {
  console.log('(보고만 — 실제 반영하려면 --apply)');
}
