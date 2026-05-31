/**
 * 도감 상세 — 우리 아이 개인화 푸드 브릿지(푸드체이닝).
 * 아이가 '잘 먹는 음식'(거부 아닌 끼니 메뉴)에 이 식재료를 섞어 새 노출을 만드는 법을 제안.
 * (coach.ts §4 푸드체이닝: ① 좋아하는 음식에 도전 식재료 소량 섞기, ② 음식 이름만 — 골고루 키트 활용)
 * 로그인 시에만 개인화. 비로그인은 가입 유도.
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

type State = { loggedIn: boolean; childName: string; favFoods: string[]; alreadyAte: boolean };

export default function PersonalBridge({ ingredient }: { ingredient: string }) {
  const [s, setS] = useState<State | null>(null);
  const supabase = createSupabaseBrowser();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setS({ loggedIn: false, childName: '', favFoods: [], alreadyAte: false }); return; }
      const { data: child } = await supabase.from('children').select('id,nickname').eq('parent_id', user.id).limit(1).maybeSingle();
      if (!child) { setS({ loggedIn: false, childName: '', favFoods: [], alreadyAte: false }); return; }
      const { data: rows } = await supabase.from('meal_logs').select('menus,ingredients,ate_well').eq('child_id', child.id).limit(400);
      const favMenu: Record<string, number> = {};
      let alreadyAte = false;
      for (const r of (rows || []) as { menus: string[] | null; ingredients: string[] | null; ate_well: boolean | null }[]) {
        if (r.ate_well !== false) (r.menus || []).forEach((mn) => { const t = (mn || '').trim(); if (t) favMenu[t] = (favMenu[t] || 0) + 1; });
        if ((r.ingredients || []).some((i) => i.includes(ingredient) || ingredient.includes(i))) alreadyAte = true;
      }
      // 좋아하는 음식 top — 이 식재료가 이름에 든 메뉴는 제외(브릿지 출발점은 익숙한 다른 음식)
      const favFoods = Object.entries(favMenu).sort((a, b) => b[1] - a[1]).map(([m]) => m).filter((m) => !m.includes(ingredient)).slice(0, 3);
      setS({ loggedIn: true, childName: child.nickname || '우리 아이', favFoods, alreadyAte });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredient]);

  if (!s) return null;

  // 비로그인 — 가입 유도
  if (!s.loggedIn) {
    return (
      <section className="rounded-2xl p-4 mb-3" style={{ background: '#F0FAF6', border: '1.5px solid #A5D6C6' }}>
        <h2 className="text-sm font-extrabold mb-1" style={{ color: '#1B5E20' }}>🧩 우리 아이 맞춤 친해지기</h2>
        <p className="text-[11.5px] mb-2.5" style={{ color: '#3a5a4a', lineHeight: 1.6 }}>아이가 <strong>잘 먹는 음식</strong>에 {ingredient}을(를) 어떻게 섞으면 좋은지 맞춤으로 알려드려요. 끼니를 기록하면 그 아이가 좋아하는 음식 기준으로 추천돼요.</p>
        <a href="/care" className="inline-block rounded-xl px-3.5 py-2 text-[12px] font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>식사 기록하고 맞춤 추천 받기 →</a>
      </section>
    );
  }

  const { childName, favFoods, alreadyAte } = s;
  return (
    <section className="rounded-2xl p-4 mb-3" style={{ background: '#F0FAF6', border: '1.5px solid #A5D6C6' }}>
      <h2 className="text-sm font-extrabold mb-1" style={{ color: '#1B5E20' }}>🧩 {childName} 맞춤 — 이렇게 섞어보세요</h2>
      {favFoods.length > 0 ? (
        alreadyAte ? (
          <p className="text-[11.5px]" style={{ color: '#3a5a4a', lineHeight: 1.7 }}>
            {childName}는 <strong>{ingredient}</strong>을(를) 이미 먹어봤어요! 잘 먹는 <strong>{favFoods.slice(0, 2).join('·')}</strong>에 더 자주 넣어 익숙하게 해주세요. 같은 식재료라도 <strong>다른 음식</strong>에서 만나면 새 노출이 됩니다(맛 학습 일반화).
          </p>
        ) : (
          <div className="text-[11.5px]" style={{ color: '#3a5a4a', lineHeight: 1.7 }}>
            <strong style={{ color: '#1B5E20' }}>새 요리는 안 하셔도 돼요.</strong> {childName}가 잘 먹는 <strong>{favFoods.slice(0, 2).join('·')}</strong>에 <strong>{ingredient}</strong>을(를) 더하는 3가지 — 부담 낮은 순서예요(푸드 브릿지):
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-2"><span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 h-fit" style={{ background: '#E8F5E9', color: '#1B5E20' }}>숨기기</span><span>{favFoods[0]}에 아주 잘게 다져 <strong>소량 섞기</strong> — 익숙한 맛 속에 자연스럽게</span></div>
              <div className="flex gap-2"><span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 h-fit" style={{ background: '#FFF0E0', color: '#C45A00' }}>곁들이기</span><span>좋아하는 음식 <strong>옆에 한 입 분량</strong>만 따로 — 안 먹어도 OK</span></div>
              <div className="flex gap-2"><span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 h-fit" style={{ background: '#F4F4F5', color: '#6B7280' }}>만나기</span><span>먹기 싫어하면 <strong>만지고 냄새만 맡아도</strong> '한 번의 노출'</span></div>
            </div>
          </div>
        )
      ) : (
        <p className="text-[11.5px]" style={{ color: '#3a5a4a', lineHeight: 1.7 }}>
          끼니를 더 기록하면 {childName}가 잘 먹는 음식에 맞춰 <strong>{ingredient}</strong> 섞는 법을 추천해드려요. 골고루 키트 식재료도 이렇게 활용하면 좋아요.
        </p>
      )}
      <p className="text-[10px] mt-2.5" style={{ color: '#6a8a7a' }}>💡 골고루 키트로 받은 식재료는 이 방식으로 — 강요 말고 좋아하는 음식 옆에 두기부터.</p>
    </section>
  );
}
