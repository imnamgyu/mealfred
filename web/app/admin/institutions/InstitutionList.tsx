'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';

type Row = {
  name: string; sigungu: string; typeLabel: string; month: string;
  score: number; dayCount: number; rank: number; total: number; topPercent: number | null;
  standout: string; fish: string; legume: string; veg: number; lowProc: string;
};
type SortKey = 'score' | 'month' | 'name' | 'sigungu' | 'days';

const navy = '#1a2b4a';
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 9px', fontSize: 11, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
const td: React.CSSProperties = { padding: '7px 9px', fontSize: 12.5, color: '#374151', borderBottom: '1px solid #F1F3F5', whiteSpace: 'nowrap' };
const scoreColor = (s: number) => s >= 95 ? '#16A085' : s >= 90 ? '#1a8f6f' : s >= 80 ? '#C45A00' : '#C62828';

export default function InstitutionList({ rows, instCount, monthCount }: { rows: Row[]; instCount: number; monthCount: number }) {
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');
  const [sort, setSort] = useState<SortKey>('score');
  const [asc, setAsc] = useState(false);
  const months = useMemo(() => [...new Set(rows.map((r) => r.month))].sort().reverse(), [rows]);

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
        평가 적재 <b>{instCount.toLocaleString()}개 기관 · {monthCount.toLocaleString()}개월</b> · 등수는 <b>같은 유형·같은 월</b> 코호트 기준. 헤더 클릭으로 정렬.
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
              <th style={th}>🐟생선</th>
              <th style={th}>🫘콩</th>
              <th style={th}>🥬채소</th>
              <th style={th}>저가공</th>
            </tr>
          </thead>
          <tbody>
            {view.map((x, i) => (
              <tr key={i} style={{ background: i % 2 ? '#FAFBFC' : '#fff' }}>
                <td style={{ ...td, fontWeight: 800, color: navy }}>{x.rank}<span style={{ color: '#9CA3AF', fontWeight: 600 }}>/{x.total}</span></td>
                <td style={{ ...td, fontWeight: 700, color: '#111827' }}>{x.name}</td>
                <td style={td}>{x.sigungu || '—'}</td>
                <td style={td}>{x.typeLabel}</td>
                <td style={td}>{x.month}</td>
                <td style={{ ...td, fontWeight: 800, color: scoreColor(x.score) }}>{x.score}</td>
                <td style={td}>{x.dayCount}</td>
                <td style={td}>{x.topPercent != null ? `${x.topPercent}%` : '—'}</td>
                <td style={{ ...td, color: x.standout === '—' ? '#9CA3AF' : '#C45A00', fontWeight: x.standout === '—' ? 400 : 700 }}>{x.standout}</td>
                <td style={td}>{x.fish}</td>
                <td style={td}>{x.legume}</td>
                <td style={td}>{x.veg}</td>
                <td style={td}>{x.lowProc}</td>
              </tr>
            ))}
            {!view.length && (
              <tr><td colSpan={13} style={{ ...td, textAlign: 'center', color: '#9CA3AF', padding: 24 }}>검색 결과가 없어요.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
