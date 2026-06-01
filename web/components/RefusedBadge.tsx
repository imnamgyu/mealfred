/**
 * 도감 상세 — 이 식재료를 우리 아이가 거부했는지 판정 + 친해지기 안내
 * (로그인: meal_logs.refused / 비로그인: localStorage)
 */
'use client';
import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { loadCareLogs } from '@/lib/careCache';   // 비로그인 fallback은 guest 네임스페이스(계정 격리)

export default function RefusedBadge({ ingredient }: { ingredient: string }) {
  const [refused, setRefused] = useState(false);
  const supabase = createSupabaseBrowser();

  useEffect(() => {
    (async () => {
      const matches = (text: string) => text.includes(ingredient);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: child } = await supabase.from('children').select('id').eq('parent_id', user.id).limit(1).maybeSingle();
        if (child) {
          const { data: rows } = await supabase.from('meal_logs').select('refused').eq('child_id', child.id).not('refused', 'is', null);
          if ((rows || []).some((r: { refused: string | null }) => r.refused && matches(r.refused))) setRefused(true);
        }
      } else {
        try {
          const logs = loadCareLogs<Record<string, Record<string, { refused?: string }>>>(null);
          for (const day of Object.values(logs)) {
            for (const entry of Object.values(day as Record<string, { refused?: string }>)) {
              if (entry.refused && matches(entry.refused)) { setRefused(true); return; }
            }
          }
        } catch {}
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredient]);

  if (!refused) return null;
  return (
    <div className="rounded-xl p-3 mb-4" style={{ background: '#FFF5F5', border: '1.5px solid #FFCDD2' }}>
      <div className="text-xs font-extrabold" style={{ color: '#C62828' }}>🌱 우리 아이가 아직 거부하는 식재료예요</div>
      <div className="text-[11.5px] mt-1" style={{ color: '#5a4a3a', lineHeight: 1.6 }}>
        강요는 거부를 강화해요. 아래 레시피는 <strong>부드러운 요리부터</strong> 순서대로예요. 죽·국으로 먼저 친해지고, 한 입씩 천천히 — <strong>소량 반복 노출 30번</strong>이 핵심입니다.
      </div>
    </div>
  );
}
