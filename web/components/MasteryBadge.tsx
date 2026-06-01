/**
 * 도감 상세 — 우리 아이 '수용 마스터' 판정.
 * 설계: 한 식재료가 서로 다른 음식(dish) 2가지 이상에서 비거부로 등장 = 진짜 수용(일반화).
 *       1가지 형태에서만이면 '푸드브릿지'(다른 음식으로도 만나보기) 안내.
 * 방법: meal_logs의 menus를 mapMenuLocal로 재분해 → 이 식재료가 등장한 distinct dish 집합.
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { createMapper } from '@/lib/menuMapCore';

type Row = { menus: string[] | null; ingredients: string[] | null; refused: string | null; ate_well: boolean | null };

export default function MasteryBadge({ ingredient }: { ingredient: string }) {
  const [dishes, setDishes] = useState<string[] | null>(null);
  const supabase = createSupabaseBrowser();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: child } = await supabase.from('children').select('id').eq('parent_id', user.id).limit(1).maybeSingle();
      if (!child) return;
      const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);
      const cutoff = new Date(Date.now() - 120 * 86400e3).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);
      const [{ data: rows }, pool] = await Promise.all([
        supabase.from('meal_logs').select('menus,ingredients,refused,ate_well').eq('child_id', child.id).gte('log_date', cutoff).lte('log_date', today),
        fetch('/ingredients-light.json').then((r) => r.json()).then((d) => (d.ingredients || []) as { nm: string }[]).catch(() => []),
      ]);
      const mapper = createMapper((pool as { nm: string }[]).map((x) => x.nm));
      const dishSet = new Set<string>();
      for (const r of (rows || []) as Row[]) {
        if (r.ate_well === false) continue;                       // 거부/안 먹은 끼니 제외
        if (r.refused && r.refused.includes(ingredient)) continue; // 이 식재료를 거부한 끼니 제외
        // 이 끼니의 메뉴 중 이 식재료를 포함하는 dish를 distinct로 수집
        for (const menu of r.menus || []) {
          const dec = mapper.mapMenu(menu);
          if (dec && dec.ingredients.includes(ingredient)) dishSet.add(menu.replace(/\s/g, ''));
        }
        // 메뉴 없이 식재료만 수기 입력된 경우 1개 dish로
        if (!(r.menus || []).length && (r.ingredients || []).includes(ingredient)) dishSet.add('직접 입력');
      }
      setDishes([...dishSet]);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredient]);

  if (!dishes || dishes.length === 0) return null;

  if (dishes.length >= 2) {
    return (
      <div className="rounded-xl p-3 mb-4" style={{ background: '#F0FAF6', border: '1.5px solid #A5D6C6' }}>
        <div className="text-xs font-extrabold" style={{ color: '#1B5E20' }}>✓ 우리 아이 수용 마스터 — {dishes.length}가지 음식에서 잘 먹어요</div>
        <div className="text-[11.5px] mt-1" style={{ color: '#3a5a4a', lineHeight: 1.6 }}>
          <strong>{dishes.slice(0, 4).join(' · ')}</strong> 등 서로 다른 형태로 받아들였어요. 한 음식만이 아니라 여러 형태로 먹는다는 건 <strong>진짜로 친해진 식재료</strong>라는 신호예요. 🎉
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl p-3 mb-4" style={{ background: '#FFF7EE', border: '1.5px solid #FFE0A0' }}>
      <div className="text-xs font-extrabold" style={{ color: '#C45A00' }}>🌉 한 가지 음식에서만 잘 먹어요 — 푸드브릿지 기회</div>
      <div className="text-[11.5px] mt-1" style={{ color: '#5a4a3a', lineHeight: 1.6 }}>
        지금은 <strong>{dishes[0]}</strong>에서만 받아들였어요. 같은 식재료를 <strong>다른 음식(다른 형태·질감)</strong>으로도 만나면 진짜 ‘수용 마스터’가 돼요. 아래 레시피·맞춤 안내를 참고해 한 칸만 옮겨보세요.
      </div>
    </div>
  );
}
