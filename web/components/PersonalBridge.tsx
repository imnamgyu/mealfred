/**
 * 도감 상세 — 우리 아이 개인화 푸드 브릿지(푸드체이닝).
 * 핵심: 이 식재료와 '궁합 네트워크로 실제 연결된' 앵커(아이가 잘 먹는 음식)에서만 다리를 놓는다.
 *   - bridge(닮음/사촌): "잘 먹는 OO랑 닮았어요" → 받아들이기 쉬움
 *   - pair(궁합/곁들임): "잘 먹는 OO랑 잘 어울려요(같이 쓰는 레시피 N개)" → 섞기·곁들이기
 * 예전엔 좋아하는 '메뉴'에 무조건 섞으라 해서 '김치볶음밥+생선' 같은 엉뚱추천이 났다.
 * 이제 연결 안 된 조합은 절대 추천하지 않는다(neighbors는 빌드타임 그래프에서 prop으로 받음).
 * 로그인 시에만 개인화. 비로그인은 가입 유도.
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

type Neighbor = { nm: string; kind: 'pair' | 'bridge'; strength: number; basis: string; count?: number };
type Anchor = Neighbor & { freq: number };
type State = { loggedIn: boolean; childName: string; anchors: Anchor[]; alreadyAte: boolean; neighbors: Neighbor[] };

export default function PersonalBridge({ ingredient, neighbors }: { ingredient: string; neighbors: Neighbor[] }) {
  const [s, setS] = useState<State | null>(null);
  const supabase = createSupabaseBrowser();

  useEffect(() => {
    (async () => {
      // Phase B 폴백 — 빌드타임 정적 이웃이 비면 LLM 폴백(/api/affinity)으로 채운다(궁합은 비개인화라 로그인 무관)
      let eff: Neighbor[] = neighbors;
      if (eff.length === 0) {
        eff = await fetch(`/api/affinity?food=${encodeURIComponent(ingredient)}`)
          .then((r) => r.json()).then((d) => (d.neighbors || []) as Neighbor[]).catch(() => []);
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setS({ loggedIn: false, childName: '', anchors: [], alreadyAte: false, neighbors: eff }); return; }
      const sel = localStorage.getItem('mf_child');
      let q = supabase.from('children').select('id,nickname').eq('parent_id', user.id);
      if (sel) q = q.eq('id', sel);
      const { data: child } = await q.limit(1).maybeSingle();
      if (!child) { setS({ loggedIn: false, childName: '', anchors: [], alreadyAte: false, neighbors: eff }); return; }
      const { data: rows } = await supabase.from('meal_logs').select('ingredients,ate_well').eq('child_id', child.id).limit(500);
      // 아이가 잘 먹는(거부 아닌) 식재료 빈도
      const likedFreq: Record<string, number> = {};
      let alreadyAte = false;
      for (const r of (rows || []) as { ingredients: string[] | null; ate_well: boolean | null }[]) {
        const ings = r.ingredients || [];
        if (ings.some((i) => i === ingredient || i.includes(ingredient) || ingredient.includes(i))) alreadyAte = true;
        if (r.ate_well === false) continue;
        ings.forEach((i) => { const t = (i || '').trim(); if (t) likedFreq[t] = (likedFreq[t] || 0) + 1; });
      }
      // 이 식재료와 그래프로 연결된 이웃 중, 아이가 실제로 잘 먹는 것만 = 앵커 (정적+폴백 합친 eff 사용)
      const anchors: Anchor[] = eff
        .filter((n) => n.nm !== ingredient && (likedFreq[n.nm] || 0) > 0)
        .map((n) => ({ ...n, freq: likedFreq[n.nm] }))
        // 아이가 많이 먹는 앵커 먼저 → 같은 빈도면 닮음(bridge) 먼저 → strength
        .sort((a, b) => (b.freq - a.freq) || (a.kind === b.kind ? b.strength - a.strength : (a.kind === 'bridge' ? -1 : 1)))
        .slice(0, 3);
      setS({ loggedIn: true, childName: child.nickname || '우리 아이', anchors, alreadyAte, neighbors: eff });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredient, neighbors]);   // neighbors는 SSG prop(페이지당 고정)이지만, 바뀌면 앵커 재계산되게

  if (!s) return null;

  // 비로그인 — 가입 유도
  if (!s.loggedIn) {
    return (
      <section className="rounded-2xl p-4 mb-3" style={{ background: '#F0FAF6', border: '1.5px solid #A5D6C6' }}>
        <h2 className="text-sm font-extrabold mb-1" style={{ color: '#1B5E20' }}>🧩 우리 아이 맞춤 푸드 브릿지</h2>
        <p className="text-[11.5px] mb-2.5" style={{ color: '#3a5a4a', lineHeight: 1.6 }}>아이가 <strong>잘 먹는 음식</strong>과 {ingredient}을(를) 어떻게 이으면 좋은지 맞춤으로 알려드려요. 끼니를 기록하면 그 아이가 좋아하는 음식 기준으로 추천돼요.</p>
        <a href="/care" className="inline-block rounded-xl px-3.5 py-2 text-[12px] font-extrabold text-white" style={{ background: 'linear-gradient(135deg,#FF6B1A,#C45A00)' }}>식사 기록하고 맞춤 추천 받기 →</a>
      </section>
    );
  }

  const { childName, anchors, alreadyAte } = s;

  // 연결된 앵커가 없으면 — 일반 궁합(이웃)만 살짝 안내(절대 엉뚱하게 잇지 않음)
  if (anchors.length === 0) {
    const generic = s.neighbors.slice(0, 3).map((n) => n.nm);
    return (
      <section className="rounded-2xl p-4 mb-3" style={{ background: '#F0FAF6', border: '1.5px solid #A5D6C6' }}>
        <h2 className="text-sm font-extrabold mb-1" style={{ color: '#1B5E20' }}>🧩 {childName} 맞춤 푸드 브릿지</h2>
        {generic.length > 0 ? (
          <p className="text-[11.5px]" style={{ color: '#3a5a4a', lineHeight: 1.7 }}>
            {ingredient}은(는) 보통 <strong>{generic.join(' · ')}</strong>와(과) 잘 어울려요. {childName}가 이 중 하나를 잘 먹게 되면 거기서 다리를 놓아드릴게요 — <strong>끼니를 더 기록</strong>하면 맞춤으로 알려드려요.
          </p>
        ) : (
          <p className="text-[11.5px]" style={{ color: '#3a5a4a', lineHeight: 1.7 }}>끼니를 더 기록하면 {childName}가 잘 먹는 음식에 맞춰 <strong>{ingredient}</strong> 시작법을 추천해드려요.</p>
        )}
      </section>
    );
  }

  const top = anchors[0];
  const why = top.kind === 'bridge'
    ? `${childName}가 잘 먹는 ${top.nm}와(과) 맛·식감이 닮은 사촌이에요`
    : `${childName}가 잘 먹는 ${top.nm}와(과) ${top.basis}`;

  return (
    <section className="rounded-2xl p-4 mb-3" style={{ background: '#F0FAF6', border: '1.5px solid #A5D6C6' }}>
      <h2 className="text-sm font-extrabold mb-1" style={{ color: '#1B5E20' }}>🧩 {childName} 맞춤 — 여기서 다리를 놓으세요</h2>
      <p className="text-[11.5px] mb-2" style={{ color: '#3a5a4a', lineHeight: 1.6 }}>
        <strong>{ingredient}</strong>은(는) {why}. {anchors.slice(0, 3).map((a) => a.nm).join(' · ')} 중에서 시작하면 부담이 적어요.
      </p>
      {alreadyAte ? (
        <p className="text-[11.5px]" style={{ color: '#3a5a4a', lineHeight: 1.7 }}>
          {childName}는 <strong>{ingredient}</strong>을(를) 이미 먹어봤어요! <strong>{top.nm}</strong> 말고도 <strong>다른 음식</strong>에서 만나면 진짜로 친해져요(맛 학습 일반화).
        </p>
      ) : (
        <div className="text-[11.5px]" style={{ color: '#3a5a4a', lineHeight: 1.7 }}>
          <strong style={{ color: '#1B5E20' }}>새 요리는 안 하셔도 돼요.</strong> 잘 먹는 <strong>{top.nm}</strong>에서 시작하는 3가지 — 부담 낮은 순서예요:
          <div className="mt-2 space-y-1.5">
            <div className="flex gap-2"><span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 h-fit" style={{ background: '#E8F5E9', color: '#1B5E20' }}>{top.kind === 'bridge' ? '나란히' : '숨기기'}</span><span>{top.kind === 'bridge' ? <>{top.nm} 옆에 {ingredient}을(를) <strong>같이 한 접시</strong>에 — 닮아서 거부감이 적어요</> : <>{top.nm}에 {ingredient}을(를) 아주 잘게 다져 <strong>소량 섞기</strong></>}</span></div>
            <div className="flex gap-2"><span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 h-fit" style={{ background: '#FFF0E0', color: '#C45A00' }}>곁들이기</span><span>{top.nm} <strong>옆에 한 입 분량</strong>만 따로 — 안 먹어도 OK</span></div>
            <div className="flex gap-2"><span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 h-fit" style={{ background: '#F4F4F5', color: '#6B7280' }}>만나기</span><span>먹기 싫어하면 <strong>만지고 냄새만 맡아도</strong> '한 번의 노출'</span></div>
          </div>
        </div>
      )}
      <p className="text-[10px] mt-2.5" style={{ color: '#6a8a7a' }}>💡 강요 말고 좋아하는 음식 옆에 두기부터. 골고루 키트 식재료도 이렇게 활용하세요.</p>
    </section>
  );
}
