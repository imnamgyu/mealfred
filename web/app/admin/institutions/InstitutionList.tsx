'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';

type Row = {
  institutionId: string; name: string; sigungu: string; typeLabel: string; month: string;
  score: number; dayCount: number; rank: number; total: number; topPercent: number | null;
  standout: string; fish: string; legume: string; veg: number; lowProc: string;
  axes: { diversity: number; kdri: number; repeat: number; allergen: number; nova: number; season: number; cuisine: number } | null;
};
type SortKey = 'score' | 'month' | 'name' | 'sigungu' | 'days';

const navy = '#1a2b4a';
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 9px', fontSize: 11, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
const td: React.CSSProperties = { padding: '7px 9px', fontSize: 12.5, color: '#374151', borderBottom: '1px solid #F1F3F5', whiteSpace: 'nowrap' };
const scoreColor = (s: number) => s >= 95 ? '#16A085' : s >= 90 ? '#1a8f6f' : s >= 80 ? '#C45A00' : '#C62828';
const Ax = ({ v }: { v?: number }) => v == null ? <span style={{ color: '#D1D5DB' }}>—</span> : <span style={{ color: scoreColor(v), fontWeight: 700 }}>{v}</span>;

export default function InstitutionList({ rows, instCount, monthCount }: { rows: Row[]; instCount: number; monthCount: number }) {
  const months = useMemo(() => [...new Set(rows.map((r) => r.month))].sort().reverse(), [rows]);
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(() => {
    const cur = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);   // KST 현재 달 기본(없으면 최신)
    return months.includes(cur) ? cur : (months[0] || '');
  });
  const [sort, setSort] = useState<SortKey>('score');
  const [asc, setAsc] = useState(false);

  const view = useMemo(() => {
    const t = q.trim();
    let r = rows;
    if (month) r = r.filter((x) => x.month === month);
    if (t) r = r.filter((x) => x.name.includes(t) || x.sigungu.includes(t));
    r = [...r].sort((a, b) => {
      let d = 0;
      if (sort === 'score') d = a.score - b.score;
      else if (sort === 'days') d = a.dayCount - b.dayCount;
      else if (sort === 'month') d = a.month.localeCompare(b.month);
      else if (sort === 'name') d = a.name.localeCompare(b.name, 'ko');
      else if (sort === 'sigungu') d = a.sigungu.localeCompare(b.sigungu, 'ko');
      return asc ? d : -d;
    });
    return r;
  }, [rows, q, sort, asc, month]);

  function clickSort(k: SortKey) {
    if (sort === k) setAsc(!asc);
    else { setSort(k); setAsc(k === 'name' || k === 'sigungu'); }   // 점수·일수·월은 내림차순 기본, 이름·구는 오름차순
  }
  const caret = (k: SortKey) => sort === k ? (asc ? ' ▲' : ' ▼') : '';

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24, fontFamily: 'Pretendard' }}>
      <Link href="/admin" style={{ fontSize: 13, color: '#FF6B1A', fontWeight: 700, textDecoration: 'none' }}>← 콘솔</Link>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: navy, marginTop: 10 }}>🏫 기관 평가 기록</h1>
      <p style={{ marginTop: 4, color: '#6B7280', fontSize: 13 }}>
        평가 적재 <b>{instCount.toLocaleString()}개 기관 · {monthCount.toLocaleString()}개월</b> · 등수는 <b>같은 유형·전체 기간 누적</b> 코호트 기준. 헤더 클릭으로 정렬. · <b>점수=7축 가중 평균</b>(다양성24·KDRI22·저가공16·반복14·제철10·조리8·알레르겐6) · 7축은 모두 <b>높을수록 우수</b>(반복적음·저가공도 점수↑=좋음) · 상위%는 낮을수록 상위.
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)}
          style={{ border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '11px 10px', fontSize: 14, fontWeight: 700, color: navy, background: '#fff' }}>
          <option value="">전체 월</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="🔎 기관명·구 검색 (예: 햇살, 광진구)" autoCapitalize="none"
          style={{ flex: 1, boxSizing: 'border-box', border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '11px 13px', fontSize: 14 }}
        />
      </div>
      <div style={{ fontSize: 12, color: '#9CA3AF', margin: '8px 2px' }}>{view.length.toLocaleString()}건 표시{month ? ` · ${month} 등수순` : ''}</div>

      <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
          <thead>
            <tr style={{ background: navy }}>
              <th style={th} onClick={() => clickSort('score')}>등수{caret('score')}</th>
              <th style={th} onClick={() => clickSort('name')}>기관{caret('name')}</th>
              <th style={th} onClick={() => clickSort('sigungu')}>구{caret('sigungu')}</th>
              <th style={th}>유형</th>
              <th style={th} onClick={() => clickSort('month')}>월{caret('month')}</th>
              <th style={th} onClick={() => clickSort('score')}>점수{caret('score')}</th>
              <th style={th} onClick={() => clickSort('days')}>일수{caret('days')}</th>
              <th style={th}>상위%</th>
              <th style={th}>⭐ 대표강점</th>
              <th style={th}>다양성</th>
              <th style={th}>KDRI</th>
              <th style={th}>반복적음</th>
              <th style={th}>알레르겐</th>
              <th style={th}>저가공</th>
              <th style={th}>제철</th>
              <th style={th}>조리</th>
            </tr>
          </thead>
          <tbody>
            {view.map((x, i) => (
              <tr key={i} style={{ background: i % 2 ? '#FAFBFC' : '#fff' }}>
                <td style={{ ...td, fontWeight: 800, color: navy }}>{x.rank}<span style={{ color: '#9CA3AF', fontWeight: 600 }}>/{x.total}</span></td>
                <td style={{ ...td, fontWeight: 700 }}><Link href={`/admin/institutions/${x.institutionId}`} style={{ color: '#1d4ed8', textDecoration: 'none' }}>{x.name}</Link></td>
                <td style={td}>{x.sigungu || '—'}</td>
                <td style={td}>{x.typeLabel}</td>
                <td style={td}>{x.month}</td>
                <td style={{ ...td, fontWeight: 800, color: scoreColor(x.score) }}>{x.score}</td>
                <td style={td}>{x.dayCount}</td>
                <td style={td}>{x.topPercent != null ? `${x.topPercent}%` : '—'}</td>
                <td style={{ ...td, color: x.standout === '—' ? '#9CA3AF' : '#C45A00', fontWeight: x.standout === '—' ? 400 : 700 }}>{x.standout}</td>
                <td style={td}><Ax v={x.axes?.diversity} /></td>
                <td style={td}><Ax v={x.axes?.kdri} /></td>
                <td style={td}><Ax v={x.axes?.repeat} /></td>
                <td style={td}><Ax v={x.axes?.allergen} /></td>
                <td style={td}><Ax v={x.axes?.nova} /></td>
                <td style={td}><Ax v={x.axes?.season} /></td>
                <td style={td}><Ax v={x.axes?.cuisine} /></td>
              </tr>
            ))}
            {!view.length && (
              <tr><td colSpan={16} style={{ ...td, textAlign: 'center', color: '#9CA3AF', padding: 24 }}>검색 결과가 없어요.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
