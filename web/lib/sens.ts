/**
 * 네이버 클라우드 SENS 알림톡 라이브러리 (M4)
 *
 * 카카오톡 알림톡 발송 — 자체 푸시 인프라 없이 SENS 사용
 * 비용: 건당 ₩8 (template 변수 채움 텍스트 메시지)
 *
 * 필요 환경변수:
 *   - NCP_ACCESS_KEY
 *   - NCP_SECRET_KEY
 *   - NCP_SENS_PROJECT_ID
 *   - NCP_KAKAO_PF_ID (카카오 비즈니스 채널 ID)
 *
 * 템플릿 사전 심사 필요 (4-7일):
 *   1. signup_welcome — 가입 환영 + 첫 끼니 기록 유도
 *   2. stage_change — 90일 챌린지 stage 전환 (1→2, 2→3, 3→4)
 *   3. challenge_complete — 90일 완주 보너스 +50,774 마일리지
 *   4. inactive_reminder — 3일 미입력 시 부드러운 리마인드
 */
import crypto from 'crypto';

const NCP_ACCESS_KEY = process.env.NCP_ACCESS_KEY;
const NCP_SECRET_KEY = process.env.NCP_SECRET_KEY;
const NCP_SENS_PROJECT_ID = process.env.NCP_SENS_PROJECT_ID;
const NCP_KAKAO_PF_ID = process.env.NCP_KAKAO_PF_ID;

export type AlimtalkTemplate =
  | 'signup_welcome'
  | 'stage_change'
  | 'challenge_complete'
  | 'inactive_reminder'
  | 'coach_letter_preview';

export type AlimtalkVars = Record<string, string | number>;

const TEMPLATES: Record<AlimtalkTemplate, (vars: AlimtalkVars) => string> = {
  signup_welcome: (v) =>
    `${v.parentName ?? '어머니'}님, 밀프레드에 오신 것을 환영해요! 🎉\n\n` +
    `오늘 ${v.childName ?? '우리 아이'} 첫 끼니부터 기록해보세요.\n` +
    `매일 기록 = +100 마일리지 (90일 챌린지 시작!)\n\n` +
    `▶ 첫 끼니 기록하러 가기`,

  stage_change: (v) =>
    `${v.childName ?? '우리 아이'} 식습관 챌린지 ${v.day}일째!\n\n` +
    `오늘부터 Stage ${v.stage}로 진입했어요.\n` +
    `한 끼 입력 = ${v.reward}원 마일리지 (이전: ${v.prevReward}원)\n\n` +
    `90일 완주까지 ${v.daysLeft}일 남았어요. 매일 한 끼라도 기록하세요 💪`,

  challenge_complete: (v) =>
    `🎉 ${v.parentName ?? '어머니'}님 90일 완주 축하해요!\n\n` +
    `${v.childName ?? '우리 아이'}의 식습관 변화 그래프가 정말 달라졌어요.\n` +
    `완주 보너스 +50,774 마일리지가 적립되었어요.\n` +
    `🎁 골고루 키트 1박스 무료로 받아보세요\n\n` +
    `▶ 키트 받기`,

  inactive_reminder: (v) =>
    `${v.parentName ?? '어머니'}님, ${v.daysSinceLast}일째 기록이 없어요 😊\n\n` +
    `${v.childName ?? '우리 아이'}의 식습관, 잠깐만 기록해도 다음 끼니에 도움돼요.\n` +
    `오늘 한 끼라도 기록하면 +100 마일리지!\n\n` +
    `▶ 빠른 기록 (30초)`,

  // 매일 아침 코칭 편지 2줄 미리보기 — preview = 편지 oneliner(한 줄 진단)
  coach_letter_preview: (v) =>
    `${v.childName ?? '우리 아이'} 오늘의 식습관 코칭이 도착했어요 💌\n\n` +
    `${v.preview ?? ''}\n\n` +
    `▶ 전체 편지 보기`,
};

function makeSignature(method: string, url: string, timestamp: string): string {
  const space = ' ';
  const newLine = '\n';
  const hmac = crypto.createHmac('sha256', NCP_SECRET_KEY!);
  hmac.update(method + space + url + newLine + timestamp + newLine + NCP_ACCESS_KEY!);
  return hmac.digest('base64');
}

/**
 * 알림톡 1건 발송
 *
 * @returns { ok, sens_message_id, cost_krw, error? }
 */
export async function sendAlimtalk(opts: {
  phone: string;                    // 010-1234-5678 또는 01012345678
  template: AlimtalkTemplate;
  vars: AlimtalkVars;
  templateCode: string;             // SENS 콘솔에 등록된 templateCode
}): Promise<{
  ok: boolean;
  sens_message_id?: string;
  cost_krw: number;
  error?: string;
}> {
  if (!NCP_ACCESS_KEY || !NCP_SECRET_KEY || !NCP_SENS_PROJECT_ID || !NCP_KAKAO_PF_ID) {
    return { ok: false, cost_krw: 0, error: 'SENS env vars missing' };
  }

  const intlPhone = '82' + opts.phone.replace(/[^0-9]/g, '').replace(/^0/, '');
  const timestamp = Date.now().toString();
  const urlPath = `/alimtalk/v2/services/${NCP_SENS_PROJECT_ID}/messages`;
  const signature = makeSignature('POST', urlPath, timestamp);
  const content = TEMPLATES[opts.template](opts.vars);

  try {
    const res = await fetch(`https://sens.apigw.ntruss.com${urlPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-iam-access-key': NCP_ACCESS_KEY,
        'x-ncp-apigw-signature-v2': signature,
      },
      body: JSON.stringify({
        plusFriendId: NCP_KAKAO_PF_ID,
        templateCode: opts.templateCode,
        messages: [{ to: intlPhone, content }],
      }),
    });
    const data = await res.json();
    if (res.ok) {
      return {
        ok: true,
        sens_message_id: data.messages?.[0]?.messageId,
        cost_krw: 8,
      };
    }
    return { ok: false, cost_krw: 0, error: `SENS ${res.status}: ${JSON.stringify(data).slice(0, 300)}` };
  } catch (e: any) {
    return { ok: false, cost_krw: 0, error: String(e).slice(0, 500) };
  }
}

/**
 * 발송 + Supabase kakao_messages 테이블에 로그
 */
export async function sendAlimtalkLogged(opts: {
  supabase: any;
  userId?: string;
  phone: string;
  template: AlimtalkTemplate;
  templateCode: string;
  vars: AlimtalkVars;
}) {
  const result = await sendAlimtalk(opts);
  // kakao_messages 테이블에 로그 (M3 schema에 정의됨)
  if (opts.supabase) {
    await opts.supabase.from('kakao_messages').insert({
      user_id: opts.userId ?? null,
      template_id: opts.template,
      payload: { vars: opts.vars, phone: opts.phone.slice(-4) },  // 끝 4자리만 (PII)
      status: result.ok ? 'sent' : 'failed',
      sens_message_id: result.sens_message_id,
      sent_at: new Date().toISOString(),
      cost_krw: result.cost_krw,
    }).select();
  }
  return result;
}

/** SENS 설정이 다 있는지(키 4종). 없으면 발송 시도조차 안 함 — cron이 헛돌지 않게. */
export function alimtalkReady(): boolean {
  return !!(NCP_ACCESS_KEY && NCP_SECRET_KEY && NCP_SENS_PROJECT_ID && NCP_KAKAO_PF_ID);
}

/**
 * 매일 코칭 편지 2줄 미리보기 알림톡 발송.
 * 부모 전화번호·동의는 auth.users(카카오 OAuth는 user_metadata.phone/alimtalk_consent)에서.
 * env(키 4종)·전화번호·동의·템플릿 승인 전까지 자동 무동작(skipped). admin = service_role 클라이언트.
 */
export async function sendCoachLetterPreview(opts: {
  admin: { auth: { admin: { getUserById: (id: string) => Promise<{ data?: { user?: { phone?: string | null; user_metadata?: Record<string, unknown> | null } | null } | null }> } }; from: (t: string) => unknown };
  parentId: string;
  childName: string;
  preview: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; cost_krw?: number }> {
  if (!alimtalkReady()) return { ok: false, skipped: true, error: 'env' };
  let phone: string | undefined;
  let consent = false;
  try {
    const { data } = await opts.admin.auth.admin.getUserById(opts.parentId);
    const u = data?.user;
    phone = (u?.phone || (u?.user_metadata as Record<string, unknown> | null)?.phone) as string | undefined;
    consent = ((u?.user_metadata as Record<string, unknown> | null)?.alimtalk_consent) === true;
  } catch {
    return { ok: false, skipped: true, error: 'user_lookup' };
  }
  if (!phone || !consent) return { ok: false, skipped: true, error: 'no_phone_or_consent' };
  return sendAlimtalkLogged({
    supabase: opts.admin,
    userId: opts.parentId,
    phone,
    template: 'coach_letter_preview',
    templateCode: 'mealfred_coach_preview_v1',   // ⚠ SENS 콘솔 등록·심사 필요(4~7일)
    vars: { childName: opts.childName, preview: opts.preview.slice(0, 90) },
  });
}
