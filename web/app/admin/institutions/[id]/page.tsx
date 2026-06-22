/**
 * /admin/institutions/[id] — 기관 상세: 원본 식단표 사진 + OCR로 인식해 표로 입력한 결과(캘린더).
 * 월별로 [왼쪽 원본 이미지 | 오른쪽 날짜·끼니·메뉴 표] → 관리자가 OCR 정확도를 눈으로 검수.
 * image_url 컬럼이 아직 없어도 캘린더는 보이게 resilient(이미지는 별도 쿼리).
 */
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const SLOT_KO: Record<string, string> = { am_snack: '오전간식', lunch: '점심', pm_snack: '오후간식' };
const SLOT_ORDER = ['am_snack', 'lunch', 'pm_snack'];
const TYPE_LABEL: Record<string, string> = { daycare: '어린이집', kindergarten: '유치원', school: '학교' };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const navy = '#1a2b4a';

type MenuRow = { id: string; month: string; source: string | null; analysis_count: number | null };
type ItemRow = { institution_menu_id: string; menu_date: string | null; slot: string; menus: string[] | null };

function weekday(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const dt = new Date(d + 'T00:00:00Z');
  return WD[dt.getUTCDay()];
}

export default async function InstitutionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  if (!isAdmin(user)) {
    return <main style={{ maxWidth: 480, margin: '60px auto', padding: 24, fontFamily: 'Pretendard' }}>
      <p style={{ color: '#6B7280' }}>🔒 관리자 전용. <Link href="/admin" style={{ color: '#FF6B1A' }}>← 콘솔</Link></p>
    </main>;
  }

  const db = createSupabaseAdmin();
  const { data: inst } = await db.from('institutions').select('id,name,type,sido,sigungu').eq('id', id).maybeSingle();
  const { data: menusData } = await db.from('institution_menus').select('id,month,source,analysis_count').eq('institution_id', id).order('month', { ascending: false });
  const menus = (menusData || []) as MenuRow[];
  const menuIds = menus.map((m) => m.id);

  const { data: itemsData } = menuIds.length
    ? await db.from('institution_menu_items').select('institution_menu_id,menu_date,slot,menus').in('institution_menu_id', menuIds)
    : { data: [] };
  const items = (itemsData || []) as ItemRow[];

  // 이미지 — image_url 컬럼이 없으면 에러나도 캘린더는 살아있게(resilient)
  const imageMap: Record<string, string> = {};
  const imgRes = menuIds.length ? await db.from('institution_menus').select('id,image_url').eq('institution_id', id) : { data: null };
  for (const r of ((imgRes.data || []) as { id: string; image_url: string | null }[])) if (r.image_url) imageMap[r.id] = r.image_url;

  const byMenu = new Map<string, ItemRow[]>();
  for (const it of items) { const a = byMenu.get(it.institution_menu_id); if (a) a.push(it); else byMenu.set(it.institution_menu_id, [it]); }

  if (!inst) {
    return <main style={{ maxWidth: 560, margin: '40px auto', padding: 24, fontFamily: 'Pretendard' }}>
      <Link href="/admin/institutions" style={{ color: '#FF6B1A', fontWeight: 700, textDecoration: 'none' }}>← 기관 목록</Link>
      <p style={{ color: '#9CA3AF', marginTop: 16 }}>기관을 찾을 수 없어요.</p>
    </main>;
  }

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: 24, fontFamily: 'Pretendard' }}>
      <Link href="/admin/institutions" style={{ fontSize: 13, color: '#FF6B1A', fontWeight: 700, textDecoration: 'none' }}>← 기관 목록</Link>
      <h1 style={{ fontSize: 23, fontWeight: 800, color: navy, marginTop: 10 }}>{inst.name}</h1>
      <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13 }}>
        {TYPE_LABEL[inst.type] || inst.type} · {inst.sigungu || inst.sido || ''} · 적재 <b>{menus.length}개월</b> · 좌측 원본 사진과 우측 OCR 인식 결과를 대조해 검수하세요.
      </p>

      {menus.map((m) => {
        const its = byMenu.get(m.id) || [];
        const byDate = new Map<string, Record<string, string[]>>();
        for (const it of its) {
          const d = it.menu_date || '미상';
          const sm = byDate.get(d); const slotMap = sm || {};
          if (!sm) byDate.set(d, slotMap);
          slotMap[it.slot] = (slotMap[it.slot] || []).concat(it.menus || []);
        }
        const dates = [...byDate.keys()].sort();
        const img = imageMap[m.id];
        return (
          <section key={m.id} style={{ marginTop: 22, border: '1px solid #E5E7EB', borderRadius: 14, padding: 16, background: '#fff' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: navy, margin: '0 0 12px' }}>
              📅 {m.month} <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600 }}>· {dates.length}일 · {m.source || '—'}{m.analysis_count ? ` · 분석 ${m.analysis_count}회` : ''}</span>
            </h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '0 0 340px', maxWidth: '100%' }}>
                {img
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <a href={img} target="_blank" rel="noreferrer"><img src={img} alt={`${m.month} 식단표 원본`} style={{ width: '100%', borderRadius: 10, border: '1px solid #E5E7EB', display: 'block' }} /></a>
                  : <div style={{ padding: '40px 16px', textAlign: 'center', background: '#F8F9FA', border: '1.5px dashed #D1D5DB', borderRadius: 10, color: '#9CA3AF', fontSize: 12.5, lineHeight: 1.7 }}>📷 원본 사진 미연결<br /><span style={{ fontSize: 11 }}>(재업로드 연결 후 표시)</span></div>}
              </div>
              <div style={{ flex: 1, minWidth: 320, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                  <thead><tr style={{ background: navy }}>
                    <th style={{ padding: '7px 8px', color: '#fff', fontWeight: 800, textAlign: 'left', whiteSpace: 'nowrap' }}>날짜</th>
                    {SLOT_ORDER.map((s) => <th key={s} style={{ padding: '7px 8px', color: '#fff', fontWeight: 800, textAlign: 'left' }}>{SLOT_KO[s]}</th>)}
                  </tr></thead>
                  <tbody>
                    {dates.map((d, i) => {
                      const sm = byDate.get(d)!;
                      const wd = weekday(d);
                      const isWeekend = wd === '토' || wd === '일';
                      return <tr key={d} style={{ background: i % 2 ? '#FAFBFC' : '#fff' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: isWeekend ? '#C62828' : navy, borderBottom: '1px solid #F1F3F5', whiteSpace: 'nowrap' }}>{d === '미상' ? '미상' : d.slice(5)}{wd ? ` (${wd})` : ''}</td>
                        {SLOT_ORDER.map((s) => <td key={s} style={{ padding: '6px 8px', color: '#374151', borderBottom: '1px solid #F1F3F5', lineHeight: 1.6 }}>{(sm[s] || []).join(', ') || '—'}</td>)}
                      </tr>;
                    })}
                    {!dates.length && <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#9CA3AF' }}>인식된 메뉴가 없어요.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}
      {!menus.length && <p style={{ marginTop: 20, color: '#9CA3AF' }}>적재된 식단이 없어요.</p>}
    </main>
  );
}
