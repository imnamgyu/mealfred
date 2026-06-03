/**
 * components/LoginCta.tsx — 비로그인 상태에서 띄우는 '로그인 / 가입' 버튼 + 팝업(AuthModal) 한 묶음.
 * 홈 헤더 버튼과 동일한 모양(카카오 옐로). 기록·도감·내 정보 등 어느 탭에서나 재사용.
 */
'use client';
import { useState } from 'react';
import AuthModal from './AuthModal';

export default function LoginCta({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className || 'flex-shrink-0 text-[12px] font-extrabold px-3.5 py-1.5 rounded-full'}
        style={{ background: '#FEE500', color: '#1a2b4a' }}
      >
        로그인 / 가입
      </button>
      {open && <AuthModal open onClose={() => setOpen(false)} />}
    </>
  );
}
