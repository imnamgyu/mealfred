/**
 * 표 하단 범례 컷 — 식단표 맨 아래 블록(알레르기 19종·제철음식·푸드브릿지 특집)이
 * 마지막 날짜열로 흡수돼 '가짜 진수성찬'이 되던 사고(2026-06-25 동래래미안 06-30 42토큰) 회귀방지.
 */
import { describe, it, expect } from 'vitest';
import { gridToItems, type GridCell } from '../lib/gridDateMapCore';

describe('gridToItems 하단범례 컷', () => {
  const cells: GridCell[] = [
    { r: 0, col: 0, cs: 1, txt: '구분' }, { r: 0, col: 1, cs: 1, txt: '월' }, { r: 0, col: 2, cs: 1, txt: '화' },
    { r: 1, col: 1, cs: 1, txt: '29(월)' }, { r: 1, col: 2, cs: 1, txt: '30(화)' },
    { r: 2, col: 0, cs: 1, txt: '점심' },
    { r: 2, col: 1, cs: 1, txt: '쌀밥 된장국 소불고기' },
    { r: 2, col: 2, cs: 1, txt: '잡곡밥 다시마챗국 쇠불고기 시금치나물 깍두기' },
    // ── 표 하단 범례 블록(전부 col2 = 마지막 날짜열로 흡수되던 자리) ──
    { r: 3, col: 0, cs: 1, txt: '알레르기' }, { r: 3, col: 2, cs: 1, txt: '난류 우유 메밀 땅콩 대두 고등어 새우 돼지고기' },
    { r: 4, col: 2, cs: 1, txt: '제철음식 [채소]감자 호박 완두콩 [해산물]다슬기 소라' },
    { r: 5, col: 2, cs: 1, txt: '월의푸드브릿지: 감자 단계 :감자죽 :감자조림' },
  ];
  const r = gridToItems(cells, '2026-06');
  const menus = r.items.map((i) => i.menu);

  it('진짜 메뉴는 보존', () => {
    expect(menus).toContain('쇠불고기');
    expect(menus).toContain('시금치나물');
    expect(menus).toContain('소불고기');
  });
  it('알레르기 범례 토큰은 제외', () => {
    for (const a of ['난류', '우유', '메밀', '땅콩', '대두']) expect(menus).not.toContain(a);
  });
  it('제철음식·푸드브릿지 사이드바 토큰은 제외', () => {
    for (const x of ['감자', '호박', '완두콩', '다슬기', '소라', '푸드브릿지']) expect(menus).not.toContain(x);
  });
  it('30(화) 칸이 가짜 진수성찬이 아니다(토큰 폭증 없음)', () => {
    const d30 = r.items.filter((i) => i.date === '30').map((i) => i.menu);
    expect(d30.length).toBeLessThanOrEqual(5); // 잡곡밥·다시마챗국·쇠불고기·시금치나물·깍두기
    expect(r.warns).toContain('하단범례 컷');
  });
});
