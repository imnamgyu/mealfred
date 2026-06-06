/**
 * RecipeThread — 도감 상세 §6 '엄마 레시피'(식재료별). 레시피 카드 + 버튼 조립 빌더 진입.
 * community_recipes를 ingredient로 조회. 탭하면 /recipe/[id] 인포그래픽.
 */
'use client';
import { useState, useEffect, useCallback } from 'react';
import RecipeBuilder from './RecipeBuilder';
import { ingEmoji, type Recipe } from '@/lib/recipe';

export default function RecipeThread({ ingredient }: { ingredient: string }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [sort, setSort] = useState<'hot' | 'new'>('hot');
  const [build, setBuild] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/community/recipe?ing=${encodeURIComponent(ingredient)}&sort=${sort}&limit=20`)
      .then((r) => r.json()).then((j) => setRecipes(j.recipes || [])).catch(() => {});
  }, [ingredient, sort]);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="bg-white rounded-2xl p-4 mb-3 shadow-sm border" style={{ borderColor: '#FFE8D0' }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-extrabold" style={{ color: '#1a2b4a' }}>
          🍳 엄마 {ingredient} 레시피 {recipes.length > 0 && <span className="font-normal text-[11px]" style={{ color: '#9CA3AF' }}>· {recipes.length}개</span>}
        </h2>
        {recipes.length > 1 && (
          <div className="flex gap-1">
            {(['hot', 'new'] as const).map((s) => (
              <button key={s} onClick={() => setSort(s)} className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: sort === s ? '#1a2b4a' : '#FAFAF7', color: sort === s ? 'white' : '#9CA3AF', border: `1px solid ${sort === s ? '#1a2b4a' : '#E5E7EB'}` }}>{s === 'hot' ? '도움된 순' : '최신'}</button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] mb-3" style={{ color: '#8a7a6a' }}>버튼만 눌러 만들면 그림 설명서처럼 자동으로 그려져요. 따라 하고 ‘해봤어요’로 응답해 주세요.</p>

      {recipes.length === 0 ? (
        <div className="rounded-xl p-3.5 mb-2 text-center" style={{ background: '#FFF5EB', border: '1px solid #FFD0A0' }}>
          <p className="text-[12.5px] font-bold" style={{ color: '#C45A00' }}>아직 레시피가 없어요</p>
          <p className="text-[11.5px] mt-0.5" style={{ color: '#8a7a6a' }}>첫 레시피를 올리면 이 {ingredient}의 <b>1호 레시피 마스터</b>가 돼요!</p>
        </div>
      ) : (
        <div className="mb-1">
          {recipes.map((r) => (
            <a key={r.id} href={`/recipe/${r.id}`} className="flex gap-3 rounded-xl p-2.5 mb-2" style={{ background: '#fff', border: '1.5px solid #F0E6DC', textDecoration: 'none' }}>
              <div className="flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ width: 64, height: 64, borderRadius: 12, background: 'linear-gradient(135deg,#FFE8CC,#FFD1A8)', fontSize: 30 }}>
                {r.photo_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={r.photo_url} alt="" className="w-full h-full object-cover" />
                  : <span>{ingEmoji(r.ingredients?.[0] || ingredient)}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex gap-1 mb-0.5">
                  {r.is_official && <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full" style={{ background: '#EDE7F6', color: '#5E35B1' }}>🩺 코치 PICK</span>}
                </div>
                <div className="text-[14px] font-extrabold leading-tight" style={{ color: '#1a2b4a' }}>{r.dish}</div>
                <div className="text-[11px] mt-1" style={{ color: '#8a7a6a' }}>단계 {Array.isArray(r.steps) ? r.steps.length : 0}{r.difficulty ? ` · ${r.difficulty}` : ''}{r.time_min ? ` · ${r.time_min}분` : ''}</div>
                <div className="text-[11px] mt-1" style={{ color: '#C45A00', fontWeight: 700 }}>{r.author_nick || '엄마'} · ♥{r.like_count} · 🙋 {r.tried_count}</div>
              </div>
            </a>
          ))}
        </div>
      )}

      <button onClick={() => setBuild(true)} className="w-full rounded-xl py-2.5 text-[13px] font-extrabold mt-1" style={{ background: '#FF6B1A', color: 'white' }}>
        ✏️ 내 {ingredient} 레시피 올리기
      </button>

      {build && <RecipeBuilder ingredient={ingredient} onClose={() => setBuild(false)} onPosted={load} />}
    </section>
  );
}
