/**
 * ocr_logs(실제 업로드된 식단표 전사)를 라이브 엔진(scoreInstitutionMonth)으로 채점 →
 * ① 점수 변별력 분포 ② 기관명 매칭분 institution_menus/scores 적재.
 * 실행: cd web && npx tsx scripts/score-recovered-menus.ts [--insert]
 */
import fs from 'fs';
import path from 'path';
import { scoreInstitutionMonth, buildMenuItemRows, computeStandoutDims, type OcrMenuItem } from '../lib/institutionScore.ts';

// ── env ──
function loadEnv(): { url: string; key: string } {
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
}
const { url: URL_, key: KEY } = loadEnv();
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

// ── ocr_text 파서(두 포맷): "1(월) 점심: a, b / 오후간식: c"  와  "[1일 월요일]\n점심: a, b" ──
const SLOT_RE = /(오전간식|오후간식|점심|중식|조식|석식|간식)\s*[:：]\s*(.+)/;
function parseOcrText(text: string): OcrMenuItem[] {
  const items: OcrMenuItem[] = [];
  let curDay = '';
  for (const raw of text.split(/\n+/)) {
    let line = raw.trim();
    if (!line) continue;
    const mA = line.match(/^(\d{1,2})\s*\(\s*[월화수목금토일]\s*\)/);          // 1(월) ...
    const mB = raw.trim().match(/^\[\s*(\d{1,2})\s*일/);                       // [1일 월요일]
    if (mA) { curDay = mA[1]; line = line.slice(mA[0].length).trim(); }
    else if (mB) { curDay = mB[1]; line = line.replace(/^\[[^\]]*\]/, '').trim(); }
    if (!line || (!line.includes(':') && !line.includes('：'))) continue;
    if (/급식\s*없음|휴(원|무)|미운영/.test(line)) continue;
    for (const part of line.split(/\s*\/\s*/)) {                              // 포맷A: 한 줄에 끼니 여러 개
      const ms = part.match(SLOT_RE);
      if (!ms) continue;
      const slot = ms[1] === '중식' ? '점심' : (ms[1] === '간식' ? '오후간식' : ms[1]);
      const menusStr = ms[2].replace(/★[^★]*★/g, '').replace(/\([^)]*\)/g, '').trim();
      for (let menu of menusStr.split(/[,，]/)) {
        menu = menu.replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳\s]+$/, '').trim();
        if (menu && curDay) items.push({ date: curDay, slot, menu });
      }
    }
  }
  return items;
}

function extractInst(reason: string | null): { name: string | null; type: string; month: string | null } {
  const r = reason || '';
  const nm = r.match(/([가-힣A-Za-z0-9·]+(?:어린이집|유치원))/);
  const mo = r.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
  return {
    name: nm ? nm[1] : null,
    type: /유치원/.test(r) ? 'kindergarten' : 'daycare',
    month: mo ? `${mo[1]}-${mo[2].padStart(2, '0')}` : null,
  };
}

async function fetchPage(table: string, qs: string): Promise<any[]> {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${table}?${qs}&offset=${off}&limit=1000`, { headers: H });
    const d = await r.json();
    out.push(...d);
    if (!Array.isArray(d) || d.length < 1000) break;
  }
  return out;
}

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const q = (p: number) => s[Math.min(n - 1, Math.floor(p * (n - 1)))];
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { n, min: s[0], max: s[n - 1], mean: +mean.toFixed(1), sd: +sd.toFixed(1), p10: q(.1), p25: q(.25), median: q(.5), p75: q(.75), p90: q(.9) };
}

async function main() {
  const doInsert = process.argv.includes('--insert');
  console.log('ocr_logs(is_menu=true) 수집…');
  const rows = await fetchPage('ocr_logs', 'select=ocr_text,reject_reason,created_at&is_menu=eq.true&order=created_at.desc');
  console.log(`  총 ${rows.length}건`);

  // 동일 ocr_text 중복 업로드 제거(고유 식단표만)
  const seen = new Set<string>();
  const uniq: { text: string; reason: string | null }[] = [];
  for (const r of rows) {
    const t = (r.ocr_text || '').trim();
    if (t.length < 60) continue;                       // 너무 짧은(비식단) 제외
    const k = t.replace(/\s/g, '').slice(0, 400);
    if (seen.has(k)) continue;
    seen.add(k); uniq.push({ text: t, reason: r.reject_reason });
  }
  console.log(`  고유 식단표 ${uniq.length}건 채점 시작\n`);

  const scored: { score: number; days: number; items: number; red: number; reason: string | null; inst: ReturnType<typeof extractInst>; itemsArr: OcrMenuItem[] }[] = [];
  for (const u of uniq) {
    const items = parseOcrText(u.text);
    if (items.length < 4) continue;                    // 파싱 빈약 제외
    const sc = scoreInstitutionMonth(items);
    scored.push({ score: sc.score, days: sc.dayCount, items: sc.itemCount, red: sc.redGroups.length, reason: u.reason, inst: extractInst(u.reason), itemsArr: items });
  }

  const valid = scored.filter((s) => s.days >= 3);     // 표본 3일+
  console.log(`채점 완료: ${scored.length}건(표본3일+ ${valid.length}건)\n`);

  // ── 변별력 분포 ──
  const st = stats(valid.map((s) => s.score));
  console.log('━━━ 점수 변별력 분포 (표본 3일+ ' + st.n + '건) ━━━');
  console.log(`  min ${st.min} · p10 ${st.p10} · p25 ${st.p25} · 중앙값 ${st.median} · p75 ${st.p75} · p90 ${st.p90} · max ${st.max}`);
  console.log(`  평균 ${st.mean} · 표준편차 ${st.sd} · 범위(max-min) ${st.max - st.min}`);
  console.log('\n  히스토그램(10점 구간):');
  for (let lo = 0; lo < 100; lo += 10) {
    const c = valid.filter((s) => s.score >= lo && s.score < (lo === 90 ? 101 : lo + 10)).length;
    console.log(`   ${String(lo).padStart(3)}~${lo + 9 === 99 ? 100 : lo + 9}: ${'█'.repeat(c)} ${c}`);
  }
  const sortd = [...valid].sort((a, b) => b.score - a.score);
  const lab = (s: typeof valid[0]) => `${s.score}점 (${s.days}일·${s.items}메뉴·결핍${s.red}군) ${s.inst.name || s.reason?.slice(0, 22) || '미상'}`;
  console.log('\n  ▲ 상위 5:'); sortd.slice(0, 5).forEach((s) => console.log('   ' + lab(s)));
  console.log('  ▼ 하위 5:'); sortd.slice(-5).forEach((s) => console.log('   ' + lab(s)));

  // ── 랭킹 테이블 적재(기관명 매칭분) ──
  if (doInsert) {
    console.log('\n━━━ 랭킹 테이블 적재(기관 매칭) ━━━');
    let inserted = 0, matched = 0;
    const usedInstMonth = new Set<string>();
    for (const s of sortd) {
      if (!s.inst.name) continue;
      const month = s.inst.month || '2026-06';
      const norm = s.inst.name.replace(/\s/g, '');
      const found = await (await fetch(`${URL_}/rest/v1/institutions?select=id,name,type,sido,sigungu&type=eq.${s.inst.type}&name_norm=ilike.*${encodeURIComponent(norm)}*&limit=3`, { headers: H })).json();
      const inst = (found || []).find((x: any) => x.name.replace(/\s/g, '') === norm) || (found || [])[0];
      if (!inst) continue;
      matched++;
      const imKey = `${inst.id}|${month}`;
      if (usedInstMonth.has(imKey)) continue;          // 같은 기관-월 중복 적재 방지
      usedInstMonth.add(imKey);
      // institution_menus upsert
      const mr = await (await fetch(`${URL_}/rest/v1/institution_menus?on_conflict=institution_id,month`, {
        method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ institution_id: inst.id, month, source: 'recovered_ocr', updated_at: new Date().toISOString() }),
      })).json();
      const menuId = mr?.[0]?.id;
      if (!menuId) continue;
      await fetch(`${URL_}/rest/v1/institution_menu_items?institution_menu_id=eq.${menuId}`, { method: 'DELETE', headers: H });
      const itemRows = buildMenuItemRows(s.itemsArr, month, menuId);
      if (itemRows.length) await fetch(`${URL_}/rest/v1/institution_menu_items`, { method: 'POST', headers: H, body: JSON.stringify(itemRows) });
      await fetch(`${URL_}/rest/v1/institution_scores?on_conflict=institution_id,month`, {
        method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ institution_id: inst.id, month, type: inst.type, sido: inst.sido, sigungu: inst.sigungu, score: s.score, red_groups: [], day_count: s.days, item_count: s.items, standout_dims: computeStandoutDims(s.itemsArr, month), computed_at: new Date().toISOString() }),
      });
      inserted++;
      console.log(`   ✓ ${inst.name}(${inst.sigungu || '?'}) ${month} → ${s.score}점`);
    }
    console.log(`\n  기관명 추출 ${sortd.filter((s) => s.inst.name).length} · 매칭 ${matched} · 적재 ${inserted}`);
  } else {
    console.log(`\n(적재하려면 --insert · 기관명 있는 건 ${valid.filter((s) => s.inst.name).length})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
