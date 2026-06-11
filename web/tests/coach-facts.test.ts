/**
 * 사실 컴파일러 회귀 테스트 — 2026-06-11 사고·적대감사에서 발견된 케이스 전부 박제.
 * 규칙: 엣지케이스가 발견되면 여기에 케이스를 추가한다(복리 자산). 배포 전 vitest 통과 필수(prebuild).
 */
import { describe, it, expect } from 'vitest';
import { compileFacts, recurrenceLabel, type FactRow } from '../lib/coachFacts';

const row = (over: Partial<FactRow>): FactRow => ({
  log_date: '2026-06-10', slot: 'dinner', menus: ['밥'], refused: null, note: null,
  environment: null, place: 'home', ate_well: true, ...over,
});
const TODAY = '2026-06-11';
const forbidOf = (fc: { forbidParts: string[] }) => fc.forbidParts.length ? new RegExp(fc.forbidParts.join('|')) : null;

describe('시계열 라벨', () => {
  it('단발 1회 / 간헐 2~3회 / 반복 4회+', () => {
    expect(recurrenceLabel(1)).toContain('단발');
    expect(recurrenceLabel(2)).toContain('간헐');
    expect(recurrenceLabel(3)).toContain('간헐');
    expect(recurrenceLabel(4)).toContain('반복');
  });
});

describe('점심 추세 분기 (이사님 시나리오: 4일 기록 후 끊김)', () => {
  const lunches = ['2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08'].map((d) => row({ log_date: d, slot: 'lunch', place: 'daycare' }));
  const dinners = ['2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10'].map((d) => row({ log_date: d, slot: 'dinner' }));

  it('어제까지 이어지면 결식 아님 카드', () => {
    const recent = [...lunches, row({ log_date: '2026-06-10', slot: 'lunch', place: 'daycare' }), ...dinners];
    const fc = compileFacts({ rows: recent, today: TODAY });
    expect(fc.cards.find((c) => c.startsWith('점심'))).toContain('결식 아님');
  });

  it('끊긴 지 3일+ 이면 추세 카드("최근 비어 있음") — 결식 아님 단정 금지', () => {
    const fc = compileFacts({ rows: [...lunches, ...dinners], today: TODAY });
    const card = fc.cards.find((c) => c.startsWith('점심'))!;
    expect(card).toContain('최근 비어 있음');
    expect(card).not.toContain('결식 아님');
  });

  it("'점심을 거른다' 단정은 항상 금지(기록 부재≠결식)", () => {
    const fc = compileFacts({ rows: [...lunches, ...dinners], today: TODAY });
    const re = forbidOf(fc)!;
    expect(re.test('점심을 거르는 리듬이 보여요')).toBe(true);
    expect(re.test('점심을 건너뛴 뒤 저녁에 몰아서')).toBe(true);
    expect(re.test('점심을 안 먹는 패턴')).toBe(true);
  });

  it('M7: 예방·권유 표현은 막지 않는다(과차단 수정)', () => {
    const fc = compileFacts({ rows: [...lunches, ...dinners], today: TODAY });
    const re = forbidOf(fc)!;
    expect(re.test('점심 30분 전 간식을 안 먹게 해주세요')).toBe(false);
    expect(re.test('점심 전에 간식을 멈춰주세요')).toBe(false);
  });

  it('최근 2일 메모가 직접 지지하면 단정 허용(forbid 해제)', () => {
    const withMemo = [...lunches, ...dinners, row({ log_date: '2026-06-10', note: '요즘 점심을 안 먹어요' })];
    const fc = compileFacts({ rows: withMemo, today: TODAY });
    expect(fc.forbidParts.some((p) => p.includes('점심'))).toBe(false);
  });
});

describe('M5: 집/기관 분리 — 급식 메뉴를 집 칭찬 근거로 세탁 금지(P10)', () => {
  it('기관 메뉴는 별도 카드로, 라벨에 "집 칭찬 근거 아님" 명시', () => {
    const rows = [
      row({ log_date: '2026-06-08', slot: 'lunch', place: 'daycare', menus: ['배추김치'] }),
      row({ log_date: '2026-06-09', slot: 'lunch', place: 'daycare', menus: ['배추김치'] }),
      row({ log_date: '2026-06-10', slot: 'lunch', place: 'daycare', menus: ['배추김치'] }),
      row({ log_date: '2026-06-10', slot: 'dinner', place: 'home', menus: ['짜파게티'] }),
    ];
    const fc = compileFacts({ rows, today: TODAY });
    const home = fc.cards.find((c) => c.startsWith('집에서 자주'))!;
    const dc = fc.cards.find((c) => c.startsWith('기관 급식'))!;
    expect(home).toContain('짜파게티');
    expect(home).not.toContain('배추김치');
    expect(dc).toContain('배추김치');
    expect(dc).toContain('집 칭찬 근거 아님');
  });
});

describe('M6: 거부 횟수 = 거부한 날 수(행 단위 부풀림 금지)', () => {
  it('하루 2슬롯 거부 = 단발 1회(간헐 아님)', () => {
    const rows = [
      row({ log_date: '2026-06-10', slot: 'lunch', refused: '당근' }),
      row({ log_date: '2026-06-10', slot: 'dinner', refused: '당근' }),
      row({ log_date: '2026-06-09', slot: 'dinner' }),
      row({ log_date: '2026-06-08', slot: 'dinner' }),
    ];
    const fc = compileFacts({ rows, today: TODAY });
    const card = fc.cards.find((c) => c.startsWith('거부: 당근'))!;
    expect(card).toContain('단발 1회');
  });
  it('거부 카드는 날 수 내림차순 정렬', () => {
    const rows = [
      row({ log_date: '2026-06-08', refused: '오이' }), row({ log_date: '2026-06-09', refused: '오이' }),
      row({ log_date: '2026-06-10', refused: '당근' }),
      row({ log_date: '2026-06-07', slot: 'dinner' }),
    ];
    const fc = compileFacts({ rows, today: TODAY });
    const refCards = fc.cards.filter((c) => c.startsWith('거부:'));
    expect(refCards[0]).toContain('오이');
  });
});

describe('단발 이벤트 단어(뷔페 사고 박제)', () => {
  it('3일+ 지난 단발 뷔페 메모 → 편지 언급 금지(detForbid)', () => {
    const rows = [
      row({ log_date: '2026-06-06', note: '점심안먹고 저녁 뷔페먹엇어요' }),
      row({ log_date: '2026-06-09' }), row({ log_date: '2026-06-10' }), row({ log_date: '2026-06-08' }),
    ];
    const fc = compileFacts({ rows, today: TODAY });
    const re = forbidOf(fc)!;
    expect(re.test('저녁 뷔페에서 여러 음식을 시도하는 패턴')).toBe(true);
  });
  it('최근 2일 메모에 있으면 언급 허용', () => {
    const rows = [
      row({ log_date: '2026-06-10', note: '어제 뷔페 다녀왔어요' }),
      row({ log_date: '2026-06-09' }), row({ log_date: '2026-06-08' }),
    ];
    const fc = compileFacts({ rows, today: TODAY });
    expect(fc.forbidParts.some((p) => p.includes('뷔페'))).toBe(false);
  });
  it('메모 카드는 날짜 라벨+하루 관찰 표시, 부모의 반복 표현은 별도 라벨', () => {
    const rows = [
      row({ log_date: '2026-06-10', note: '아침은 항상 3-4숟갈만 먹음' }),
      row({ log_date: '2026-06-09', note: '오늘은 잘 먹었어요' }),
    ];
    const fc = compileFacts({ rows, today: TODAY });
    expect(fc.noteCards.find((n) => n.includes('항상'))).toContain('부모 표현상 반복');
    expect(fc.noteCards.every((n) => n.includes('하루 관찰'))).toBe(true);
  });
});

describe('환경·어제 사실 카드', () => {
  it('어제 끼니별 환경 사실 생성(reinforce 인용 근거)', () => {
    const rows = [
      row({ log_date: '2026-06-10', slot: 'breakfast', environment: 'table' }),
      row({ log_date: '2026-06-10', slot: 'dinner', environment: 'screen' }),
      row({ log_date: '2026-06-09', slot: 'dinner', environment: 'screen' }),
      row({ log_date: '2026-06-08', slot: 'dinner', environment: 'screen' }),
    ];
    const fc = compileFacts({ rows, today: TODAY });
    const y = fc.cards.find((c) => c.startsWith('어제 끼니 환경'))!;
    expect(y).toContain('아침(식탁·화면 없음)');
    expect(y).toContain('저녁(화면 보며)');
  });
});
