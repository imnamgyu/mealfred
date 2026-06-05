/**
 * /recipe/[id] — 엄마 레시피 상세(이케아식 인포그래픽). 앱 안에서 보기 + 좋아요/해봤어요.
 * 공개 레시피는 RLS(public)로 비로그인도 열람. 하단탭은 도감 흐름 유지.
 */
import { createSupabaseServer, createSupabaseServerAnon } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import RecipeInfographic from '@/components/RecipeInfographic';
import RecipeReactions from '@/components/RecipeReactions';
import { RECIPE_LIST_COLS, type RecipeStep } from '@/lib/recipe';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const anon = await createSupabaseServerAnon();
  const { data } = await anon.from('community_recipes').select('dish,tip').eq('id', id).eq('status', 'public').maybeSingle();
  return data ? { title: `${data.dish} — 밀프레드 레시피`, description: data.tip || undefined } : { title: '밀프레드 레시피' };
}

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const anon = await createSupabaseServerAnon();
  const { data: r } = await anon.from('community_recipes').select(`${RECIPE_LIST_COLS},parent_id`).eq('id', id).eq('status', 'public').maybeSingle();
  if (!r) notFound();

  // 내 반응
  let likedByMe = false, triedByMe = false;
  const server = await createSupabaseServer();
  const { data: { user } } = await server.auth.getUser();
  if (user) {
    const { data: reacts } = await server.from('recipe_reactions').select('kind').eq('recipe_id', id).eq('user_id', user.id);
    likedByMe = (reacts || []).some((x) => x.kind === 'like');
    triedByMe = (reacts || []).some((x) => x.kind === 'tried');
  }

  const backIng = (r.ingredients || [])[0];
  const steps = (Array.isArray(r.steps) ? r.steps : []) as RecipeStep[];

  return (
    <main className="max-w-md mx-auto w-full min-h-screen flex flex-col overflow-x-hidden" style={{ background: '#FFFDFB' }}>
      <header className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 z-10" style={{ background: 'rgba(255,253,251,0.94)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #F4ECE2' }}>
        <Link href={backIng ? `/foods/${encodeURIComponent(backIng)}` : '/tips'} style={{ fontSize: 14, fontWeight: 700, color: '#9a8a7a', textDecoration: 'none' }}>← {backIng || '뒤로'}</Link>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#C45A00' }}>🍳 엄마 레시피</span>
      </header>

      <div className="flex-1 px-5 pt-3 pb-10">
        <RecipeInfographic
          dish={r.dish} tip={r.tip} photoUrl={r.photo_url} ingredients={r.ingredients} steps={steps}
          author={r.author_nick ? `${r.author_nick}` : (r.is_official ? '🩺 밀프레드 코치' : '엄마')}
          badge={r.is_official ? '🩺 코치 PICK' : null}
        />
        {user && user.id !== (r as { parent_id?: string }).parent_id ? (
          <RecipeReactions recipeId={id} like={r.like_count} tried={r.tried_count} likedByMe={likedByMe} triedByMe={triedByMe} />
        ) : (
          <div className="flex gap-4 mt-5 text-[13px] font-bold" style={{ color: '#8a7a6a' }}>
            <span>♥ {r.like_count}</span><span>🙋 {r.tried_count}명 해봤어요</span>
          </div>
        )}
      </div>

      <BottomNav active="/tips" />
    </main>
  );
}
