/**
 * NEIS 학교급식 API → 초등 식단 수집 → institutions(type=elementary, ext_code=NEIS코드) + institution_menu_items 적재.
 * 어린이집/유치원은 종이 식단표라 OCR(유료)했지만, 초등은 NEIS가 구조화 JSON으로 주니 OCR 불필요.
 * ⭐ 공공데이터 제약: 호출당 max 1,000건 → pIndex 페이지네이션(list_total_count까지).
 *
 * 실행: cd web && NEIS_KEY=xxx npx tsx scripts/pull-neis.ts --sido=서울특별시 [--gu=강남구] --from=202509 --to=202602 [--limit=5] [--dry]
 *   (NEIS_KEY는 .env.local의 NEIS_KEY= 또는 위처럼 환경변수)
 *   --dry: 적재 없이 학교·급식 건수만 미리보기(키만 있으면 비용 0, 안전 확인용)
 */
import fs from 'fs';
import path from 'path';
import { scoreInstitutionMonth, computeStandoutDims, computeSevenAxes, sevenAxisScore, buildMenuItemRows, type OcrMenuItem } from '../lib/institutionScore.ts';

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try { for (const l of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch { /* */ }
  return env;
}
const env = loadEnv();
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SKEY = env.SUPABASE_SERVICE_ROLE_KEY;
const NEIS_KEY = process.env.NEIS_KEY || env.NEIS_KEY || '';
const H: Record<string, string> = { apikey: SKEY!, authorization: `Bearer ${SKEY}`, 'content-type': 'application/json' };
const enc = encodeURIComponent;

const args = process.argv.slice(2);
const arg = (k: string, d = '') => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const SIDO = arg('sido', '서울특별시');
const GU = arg('gu');
const FROM = arg('from');               // YYYYMM
const TO = arg('to', FROM);
const LIMIT = parseInt(arg('limit', '0'), 10);
const DRY = args.includes('--dry');

const NEIS = 'https://open.neis.go.kr/hub';
// ⭐ 페이지네이션: 호출당 max 1000건(공공데이터 제약) → list_total_count까지 pIndex 증가
async function neisAll(endpoint: string, params: Record<string, string>): Promise<any[]> {
  if (!NEIS_KEY) { console.error('❌ NEIS_KEY 없음 — .env.local에 NEIS_KEY=... 추가하거나 NEIS_KEY=xxx로 실행'); process.exit(1); }
  const out: any[] = [];
  for (let pIndex = 1; pIndex <= 100; pIndex++) {
    const qs = new URLSearchParams({ KEY: NEIS_KEY, Type: 'json', pIndex: String(pIndex), pSize: '1000', ...params });
    let j: any = null;
    try { j = await (await fetch(`${NEIS}/${endpoint}?${qs}`)).json(); } catch { break; }
    const block = j?.[endpoint];
    if (!Array.isArray(block)) break;          // INFO-200(해당 데이터 없음)·ERROR 코드
    const rows = block.find((b: any) => b.row)?.row || [];
    out.push(...rows);
    const total = block.find((b: any) => b.head)?.head?.find((h: any) => 'list_total_count' in h)?.list_total_count || 0;
    if (rows.length < 1000 || out.length >= total) break;
  }
  return out;
}

// DDISH_NM 파싱: '<br/>' 구분 · (알레르기 숫자)·끝자리 숫자·괄호 제거
function parseDish(ddish: string): string[] {
  return (ddish || '').split(/<br\s*\/?>/i)
    .map((s) => s.replace(/\([0-9.\s]*\)/g, '').replace(/[0-9.]+\s*$/, '').replace(/\s+/g, ' ').trim())
    .filter((s) => s && s.length > 1 && !/^[0-9.\s]*$/.test(s));
}
const SLOT: Record<string, string> = { '조식': 'breakfast', '중식': 'lunch', '석식': 'dinner' };
const guOf = (addr: string) => ((addr || '').match(/[가-힣]+[시군구]/g) || []).find((x) => /[구군]$/.test(x)) || '';
async function rest(p: string, opt?: any) { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H, ...opt }); return r.json().catch(() => null); }

async function main() {
  if (!FROM) { console.error('❌ --from=YYYYMM 필요 (예: --from=202509 --to=202602)'); process.exit(1); }
  console.log(`NEIS 초등 수집 · ${SIDO}${GU ? '/' + GU : ''} · ${FROM}~${TO}${DRY ? ' · DRY(미적재)' : ''}`);

  // 1) 초등 학교 목록(schoolInfo) — 시도 전체 → 구 필터
  let schools = await neisAll('schoolInfo', { LCTN_SC_NM: SIDO, SCHUL_KND_SC_NM: '초등학교' });
  if (GU) schools = schools.filter((s: any) => (s.ORG_RDNMA || '').includes(GU));
  if (LIMIT) schools = schools.slice(0, LIMIT);
  console.log(`  대상 초등 ${schools.length}곳`);

  let inserted = 0; const insts = new Set<string>(); const skip: string[] = [];
  for (const s of schools) {
    const atpt = s.ATPT_OFCDC_SC_CODE, schul = s.SD_SCHUL_CODE, name = (s.SCHUL_NM || '').trim();
    const sigungu = guOf(s.ORG_RDNMA);

    // 2) 급식 식단(mealServiceDietInfo) — 월 범위(페이지네이션은 neisAll이 처리)
    const rows = await neisAll('mealServiceDietInfo', { ATPT_OFCDC_SC_CODE: atpt, SD_SCHUL_CODE: schul, MLSV_FROM_YMD: FROM + '01', MLSV_TO_YMD: TO + '31' });
    if (!rows.length) { skip.push(`${name}: 급식 0건`); continue; }

    // 월별 (날짜·끼니·메뉴) 집계
    const byMonth: Record<string, OcrMenuItem[]> = {};
    for (const r of rows) {
      const ymd = String(r.MLSV_YMD || ''); if (ymd.length !== 8) continue;
      const month = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}`, date = `${month}-${ymd.slice(6, 8)}`;
      const slot = SLOT[r.MMEAL_SC_NM] || 'lunch';
      for (const menu of parseDish(r.DDISH_NM)) (byMonth[month] ||= []).push({ date, slot, menu } as OcrMenuItem);
    }
    if (DRY) { const ms = Object.keys(byMonth).sort(); console.log(`  ✓DRY ${name}(${sigungu}) ${ms.length}개월 · ${ms.map((m) => m + ':' + byMonth[m].length).join(' ')}`); continue; }

    // 3) institution upsert (ext_code로 멱등 — 제약 없이 select→insert)
    const ext = `neis:${atpt}:${schul}`;
    const found = await rest(`institutions?select=id&ext_code=eq.${enc(ext)}&limit=1`);
    let instId = found?.[0]?.id;
    if (!instId) {
      const up = await rest('institutions', { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ name, name_norm: name.replace(/\s/g, ''), type: 'elementary', inst_type: '초등학교', sido: SIDO, sigungu, address: s.ORG_RDNMA, ext_code: ext, source: 'neis', status: 'active' }) });
      instId = up?.[0]?.id;
    }
    if (!instId) { skip.push(`${name}: institution upsert 실패`); continue; }
    insts.add(instId);

    // 4) 월별 menus → items → scores (어린이집/유치원과 동일 채점 파이프라인)
    for (const month of Object.keys(byMonth)) {
      const items = byMonth[month];
      const sc = scoreInstitutionMonth(items); if (sc.dayCount < 3) { skip.push(`${name} ${month}: 표본<3일`); continue; }
      const axes = computeSevenAxes(items, month), total = sevenAxisScore(axes), dims = computeStandoutDims(items, month);
      const mr = await rest('institution_menus?on_conflict=institution_id,month', { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ institution_id: instId, month, source: 'neis', updated_at: new Date().toISOString() }) });
      const menuId = mr?.[0]?.id; if (!menuId) { skip.push(`${name} ${month}: menus 실패`); continue; }
      await fetch(`${URL_}/rest/v1/institution_menu_items?institution_menu_id=eq.${menuId}`, { method: 'DELETE', headers: H });
      const rr = buildMenuItemRows(items, month, menuId);
      if (rr.length) await fetch(`${URL_}/rest/v1/institution_menu_items`, { method: 'POST', headers: H, body: JSON.stringify(rr) });
      await fetch(`${URL_}/rest/v1/institution_scores?on_conflict=institution_id,month`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ institution_id: instId, month, type: 'elementary', sido: SIDO, sigungu, score: total, day_count: sc.dayCount, item_count: sc.itemCount, axes, standout_dims: dims, computed_at: new Date().toISOString() }) });
      inserted++; console.log(`  ✓ ${name}(${sigungu}) ${month} → ${total}점 (${sc.dayCount}일)`);
    }
  }
  console.log(`\n━━━ 완료: ${inserted}개월 적재 / ${insts.size}개 초등 / 스킵 ${skip.length} ━━━`);
  skip.slice(0, 20).forEach((s) => console.log('   skip:', s));
}
main().catch((e) => { console.error(e); process.exit(1); });
