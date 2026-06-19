/**
 * /admin 데이터 계층 — 무거운 service_role 읽기를 캐시(Vercel Data Cache)에 박아둔다.
 *
 * 왜: admin 페이지는 force-dynamic(쿠키 인증)이라 '그릴 때마다' Supabase를 통째로 다시 읽어 느렸다.
 *   service_role 쿼리(createSupabaseAdmin — 쿠키 비연결)는 '요청 무관' → unstable_cache로 박아두고,
 *   새벽 코칭 크론이 편지를 쓴 직후 revalidateTag('admin','max')로 갱신한다(= 편지 쓰면 어드민 캐시 갱신).
 *
 * 규칙(Next16 캐시 경계 제약): 캐시 함수 안에서 cookies()/headers() 금지.
 *   → 인증(getUser=쿠키)은 캐시 밖. getAdminUser는 React cache()로 '한 요청 내' 중복만 제거(영속 X).
 *   → '오늘'에 의존하는 계산·필터는 캐시 밖(페이지 본문)에서. SQL에 .lte(today)를 넣지 않아 캐시키가
 *      날짜로 오염되지 않게 한다(전체를 담고 페이지에서 '오늘까지' 필터).
 *
 * 무효화: 'admin'(블랭킷, 모든 admin 읽기) + 'admin-child:<id>'(자녀별 스레드). 새 태그/형태는
 *   revalidateTag(tag, 'max') 2-인자 필수(Next16, 단일 인자는 deprecated).
 */
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createSupabaseAdmin, createSupabaseServerAnon } from '@/lib/supabase/server';

// ── 인증 dedupe: layout + page 가 각자 getUser()를 호출해 한 요청에 왕복 2회였다 → 1회로.
//    (쿠키를 읽으므로 unstable_cache가 아니라 React cache — 요청 범위 메모이즈, 영속/공유 안 함.)
export const getAdminUser = cache(async () => {
  const anon = await createSupabaseServerAnon();
  const { data: { user } } = await anon.auth.getUser();
  return user;
});

export type OverviewChild = {
  id: string; nickname: string; age_band: string; sex: string | null;
  daycare: boolean | null; parent_id: string; created_at: string | null;
};
export type AdminOverview = {
  children: OverviewChild[];
  meals: { child_id: string; log_date: string }[];
  letters: { child_id: string; letter_date: string }[];
};

// ── 홈 대시보드 원천: 자녀 로스터 + 끼니/편지 집계용 행. 날짜 필터·카운트는 페이지에서(캐시키 정결).
export const getAdminOverview = unstable_cache(
  async (): Promise<AdminOverview> => {
    const db = createSupabaseAdmin();
    const { data: children } = await db.from('children')
      .select('id,nickname,age_band,sex,daycare,parent_id,created_at')
      .order('id', { ascending: true });
    const ids = (children || []).map((c) => c.id);
    let meals: { child_id: string; log_date: string }[] = [];
    let letters: { child_id: string; letter_date: string }[] = [];
    if (ids.length) {
      const [m, l] = await Promise.all([
        db.from('meal_logs').select('child_id,log_date').in('child_id', ids),
        db.from('coach_letters').select('child_id,letter_date').in('child_id', ids),
      ]);
      meals = (m.data || []) as { child_id: string; log_date: string }[];
      letters = (l.data || []) as { child_id: string; letter_date: string }[];
    }
    return { children: (children || []) as OverviewChild[], meals, letters };
  },
  ['admin-overview'],                 // keyParts — 날짜·자녀 무관(전역 1엔트리)
  { tags: ['admin'], revalidate: 60 },
);

// ── 자녀 스레드 원천: 한 자녀의 9개 테이블을 한 번에. childId가 cache key 판별자(keyParts).
//    .lte(today) 미적용(전체를 담음) — 페이지가 '오늘까지' 필터. 반환 필드명은 페이지 변수명과 일치(최소 변경).
export function getChildThread(childId: string) {
  return unstable_cache(
    async () => {
      const db = createSupabaseAdmin();
      const [child, meals, letters, questions, ps, wk, prog, fb] = await Promise.all([
        db.from('children').select('nickname,age_band,sex,daycare').eq('id', childId).maybeSingle(),
        db.from('meal_logs').select('log_date,menus,ingredients,refused,note,texture,place,meal_time,created_at').eq('child_id', childId),
        db.from('coach_letters').select('letter_date,letter,oneliner,context,source_hash').eq('child_id', childId),
        db.from('daily_questions').select('q_date,question,topic,chips,answer,answered_at,context').eq('child_id', childId),
        db.from('period_summaries').select('period_type,period_key,metrics,updated_at').eq('child_id', childId).order('period_key', { ascending: false }).limit(200),
        db.from('weekly_plans').select('week_key,status,mission_target,target_pool,secondary_axis,goals,behavior_goal,teaching_arc,check_method,budget,ledger,impression,arc_week,plan_detail').eq('child_id', childId).order('week_key', { ascending: false }).limit(6),
        db.from('curriculum_progress').select('unit_id,status,step,evidence,last_signal_at,relapse_count,stop_reason,updated_at').eq('child_id', childId),
        db.from('letter_feedback').select('rating').eq('child_id', childId),
      ]);
      // 페이지가 자체 타입(Meal/Letter/Question/PS …)으로 캐스팅하므로 supabase 원형(any) 유지 — 캐스트 호환.
      return {
        child: child.data,
        meals: meals.data ?? [],
        letters: letters.data ?? [],
        questions: questions.data ?? [],
        psData: ps.data ?? [],
        wkPlansRaw: wk.data ?? [],
        progRaw: prog.data ?? [],
        fbRaw: fb.data ?? [],
      };
    },
    ['admin-thread', childId],        // keyParts: childId가 판별자
    { tags: ['admin', `admin-child:${childId}`], revalidate: 60 },
  )();
}
