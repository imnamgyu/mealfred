-- 주간 코칭 커리큘럼 — coaching-weekly-plan §14 확장.
-- 주간 종합이 '음식 타깃'뿐 아니라 이번 주 ① 부모 행동변화 목표 ② 가르치는 메시징 아크 ③ 확인 방법까지 설계.
-- 일간 편지가 이 닻을 참조해 같은 행동을 '왜→강화' 톤으로 며칠에 걸쳐 가르친다.
-- ⚠️ 'check'는 SQL 예약어라 컬럼명 check_method 사용. RLS는 기존대로 부모 select 정책 없음(§13 미션 비노출 유지).
-- 실행: Supabase 대시보드 SQL Editor에서 1회.

alter table public.weekly_plans
  add column if not exists behavior_goal text,    -- 이번 주 가르칠 '부모 행동 1개'(관측가능·아주 작게·권유형). 부모 비노출.
  add column if not exists teaching_arc  jsonb,    -- {stages:["why","reinforce"], implIntention:"저녁 6시, TV 끄고"} — 가르치는 단계·구체 트리거(Gollwitzer)
  add column if not exists check_method  jsonb;    -- {method:"observe", signal:"envBadPct", baseline:0.93, targetDir:"down"} or {method:"ask", topic} — 됐는지 확인(자동 관측 우선·죄책감 0)
