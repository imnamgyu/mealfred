/**
 * /privacy — 개인정보처리방침
 *
 * 카카오 간편가입(닉네임) + 자녀의 건강·식이(민감정보) + 식사기록 + 커뮤니티 공개 콘텐츠를 다룬다.
 * 처리위탁: Supabase(호스팅·DB), Anthropic(코칭 생성), 네이버클라우드 SENS(알림톡), Vercel(배포).
 * ⚠️ 표준 템플릿 — 정식 운영 전 변호사 검토 권장.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '개인정보처리방침 — 밀프레드', robots: { index: false } };

const UPDATED = '2026-06-03';

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 22px 80px', fontFamily: "'Pretendard',-apple-system,BlinkMacSystemFont,sans-serif", color: '#1a2b4a', lineHeight: 1.75 }}>
      <a href="/" style={{ fontSize: 13, color: '#8a7a6a', textDecoration: 'none', fontWeight: 700 }}>← 밀프레드</a>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '14px 0 4px' }}>개인정보처리방침</h1>
      <p style={{ fontSize: 12.5, color: '#9a8a7a', marginBottom: 8 }}>시행일 {UPDATED} · 밀프레드(이하 &ldquo;회사&rdquo;)는 이용자의 개인정보를 중요하게 생각하며 관련 법령을 준수합니다.</p>
      <div style={{ background: '#FFF8E8', border: '1px solid #FFE0A0', borderRadius: 10, padding: '10px 13px', fontSize: 12, color: '#8a5a00', marginBottom: 22 }}>
        이 방침은 표준 템플릿 초안입니다. 정식 운영 전 법률 전문가의 검토를 권장합니다.
      </div>

      <Section n="1." t="수집하는 개인정보 항목">
        <ul style={ul}>
          <li><b>카카오 로그인</b>: 카카오 닉네임, 회원 식별자(고유 ID). (이메일·전화번호는 카카오에서 받지 않습니다)</li>
          <li><b>자녀 정보(보호자가 입력)</b>: 자녀 닉네임, 생년·월, 성별, 키·몸무게, <b>알레르기·만성질환 등 건강정보, 식사 기록(메뉴·식재료·거부 반응·메모)</b> — 일부는 「개인정보 보호법」상 <b>민감정보</b>에 해당합니다.</li>
          <li><b>선택</b>: 전화번호(알림톡 수신을 원할 때만).</li>
          <li><b>결제 정보(유료 결제 시)</b>: 카드·승인 정보 등 결제수단 정보는 전자결제대행(PG)사가 처리하며, 회사는 결제 식별값과 결제·환불 내역(금액·일시·상품)만 보관합니다.</li>
          <li><b>커뮤니티</b>: 회원이 등록하는 레시피·노하우·사진·댓글·좋아요 등(닉네임과 함께 다른 이용자에게 공개됨).</li>
          <li><b>자동 생성</b>: 서비스 이용 기록, 접속 로그, 기기·브라우저 정보, 쿠키.</li>
        </ul>
      </Section>

      <Section n="2." t="민감정보 처리에 대한 별도 동의">
        자녀의 건강(알레르기·만성질환 등)·식이 정보는 민감정보로, 회원의 <b>별도 동의</b>를 받아 처리합니다. 가입 시 약관·개인정보 동의에 이 항목이 포함되며, 동의하지 않으면 영양 분석·코칭 등 핵심 기능 제공이 제한될 수 있습니다. AI 편식 코칭 제공을 위해 이 정보의 일부(직접 식별정보 제외)가 <b>국외(미국)로 이전·처리</b>되며, 그 상세는 아래 <b>5항(개인정보 처리 위탁·국외 이전)</b>에서 확인할 수 있습니다.
      </Section>

      <Section n="3." t="개인정보의 수집·이용 목적">
        <ul style={ul}>
          <li>식단 영양 분석·신호등·BMI·성장 추적 등 맞춤 분석 제공</li>
          <li>편식 코칭(편지·질문) 생성 및 제공</li>
          <li>식재료 도감·커뮤니티(레시피·노하우 공유) 운영</li>
          <li>포인트 적립·사용, 구독·결제, 골고루 키트 주문·배송</li>
          <li>알림(웹푸시·알림톡), 고객 문의 응대, 부정이용 방지·서비스 개선</li>
        </ul>
      </Section>

      <Section n="4." t="보유 및 이용 기간">
        <ul style={ul}>
          <li>회원 탈퇴 시 또는 <b>30일 이상 미이용 시</b> 지체 없이 파기합니다(관련 법령상 보존 의무가 있는 정보는 해당 기간 보관).</li>
          <li>전자상거래법에 따라 일부 기록은 법정 기간 보존합니다 — <b>계약·청약철회 기록 5년 · 대금결제·재화공급 기록 5년 · 소비자 불만·분쟁 처리 기록 3년</b>.</li>
          <li>커뮤니티에 공개된 콘텐츠는 다른 이용자가 저장·인용했을 수 있어, 회원 삭제 후에도 일부가 남을 수 있습니다.</li>
        </ul>
      </Section>

      <Section n="5." t="개인정보 처리 위탁">
        회사는 안정적 서비스 제공을 위해 아래와 같이 처리를 위탁합니다. 위탁 시 관련 법령에 따라 안전조치를 합니다.
        <table style={table}>
          <thead><tr><th style={th}>수탁자</th><th style={th}>위탁 업무</th></tr></thead>
          <tbody>
            <tr><td style={td}>Supabase</td><td style={td}>데이터베이스·인증·저장 호스팅</td></tr>
            <tr><td style={td}>Vercel</td><td style={td}>애플리케이션 배포·운영</td></tr>
            <tr><td style={td}>Anthropic·DeepInfra(DeepSeek)</td><td style={td}>코칭 편지·질문 등 텍스트 생성 AI 처리(식단 분석값 전달·미국 이전)</td></tr>
            <tr><td style={td}>네이버클라우드(SENS)</td><td style={td}>알림톡 발송(선택 시)</td></tr>
            <tr><td style={td}>전자결제대행(PG)사</td><td style={td}>유료 결제·환불 처리(유료 서비스 도입 시)</td></tr>
          </tbody>
        </table>
        <div style={note}>
          <b>국외 이전 안내(개인정보 보호법 제28조의8)</b> — 코칭 AI 처리를 위해 개인정보를 국외로 이전합니다.<br />
          · 이전받는 자 / 국가: Anthropic(미국)·DeepInfra(미국, DeepSeek 추론 제공) / 미국<br />
          · 이전 항목: 자녀 연령대·식단(메뉴·식재료·거부 반응·메모)·건강 분석값 — <b>이름·연락처 등 직접 식별정보는 전달하지 않음</b><br />
          · 이전 목적: AI 편식 코칭 편지·질문 생성 / 이전 일시·방법: 코칭 생성 시 HTTPS 암호화 전송<br />
          · 보유·이용 기간: 추론 처리 목적 달성 즉시 파기(제공자 약관에 따라 보관·모델 학습에 사용하지 않음) / 거부 방법: 동의 철회 또는 고객센터 요청(거부 시 코칭 기능 제한)
        </div>
      </Section>

      <Section n="6." t="개인정보의 제3자 제공">
        회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만 법령에 근거가 있거나 이용자의 동의가 있는 경우, 골고루 키트 배송을 위한 배송정보 제공 등 서비스 이행에 필요한 최소한의 경우에 한해 제공할 수 있습니다.
      </Section>

      <Section n="7." t="이용자·법정대리인의 권리">
        이용자는 언제든 자신(및 입력한 자녀)의 개인정보 <b>열람·정정·삭제·처리정지·동의 철회</b>를 요청할 수 있습니다. 서비스 내 설정 또는 아래 연락처로 요청하면 지체 없이 조치합니다. 동의 철회·탈퇴 시 핵심 기능 이용이 제한될 수 있습니다.
      </Section>

      <Section n="8." t="안전성 확보 조치">
        접근 권한 관리, 전송구간 암호화(HTTPS), 행 수준 보안(RLS)을 통한 데이터 접근 통제, 접속기록 관리 등 합리적인 기술적·관리적 보호조치를 시행합니다.
      </Section>

      <Section n="9." t="만 14세 미만 아동 정보">
        서비스 회원은 만 14세 이상의 보호자입니다. 입력되는 자녀 정보는 <b>보호자가 자녀를 위해 직접 입력·관리</b>하는 정보이며, 회사는 아동에게 직접 회원가입을 받지 않습니다.
      </Section>

      <Section n="10." t="쿠키 및 로컬 저장소">
        로그인 유지·기능 제공을 위해 쿠키 및 브라우저 로컬 저장소(localStorage)를 사용합니다. 브라우저 설정으로 거부할 수 있으나 일부 기능이 제한될 수 있습니다.
      </Section>

      <Section n="11." t="개인정보 보호책임자 및 문의">
        개인정보 관련 문의·열람·정정·삭제 요청: <a href="mailto:continueing@naver.com" style={link}>continueing@naver.com</a>. 그 밖의 신고·상담은 개인정보침해신고센터(privacy.kr·118), 대검찰청·경찰청 사이버수사국 등에 문의할 수 있습니다.
      </Section>

      <Section n="12." t="고지의 의무">
        이 방침의 변경 시 시행 7일 전(중대한 변경은 30일 전)부터 서비스 화면에 공지합니다.
      </Section>

      <p style={{ fontSize: 12, color: '#9a8a7a', marginTop: 30 }}>시행일 {UPDATED} · <a href="/terms" style={link}>이용약관 →</a></p>
    </main>
  );
}

const ul: React.CSSProperties = { margin: '6px 0 0', paddingLeft: 18, fontSize: 14.5, color: '#3a4555' };
const note: React.CSSProperties = { marginTop: 10, background: '#FFF8E8', border: '1px solid #FFE0A0', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: '#8a5a00' };
const link: React.CSSProperties = { color: '#C45A00', fontWeight: 700 };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', margin: '10px 0', fontSize: 13 };
const th: React.CSSProperties = { background: '#1a2b4a', color: 'white', padding: '8px 9px', textAlign: 'left', fontWeight: 700 };
const td: React.CSSProperties = { padding: '8px 9px', border: '1px solid #F0E8E0', color: '#3a4555' };

function Section({ n, t, children }: { n: string; t: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1a2b4a', marginBottom: 4 }}>{n} {t}</h2>
      <div style={{ fontSize: 14.5, color: '#3a4555' }}>{children}</div>
    </section>
  );
}
