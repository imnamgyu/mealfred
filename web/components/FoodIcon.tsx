'use client';
/**
 * FoodIcon — 도감/홈 식재료 비주얼. 생성된 아이콘(/icons/<nm>.png)이 있으면 그걸, 없으면 이모지, 그것도 없으면 카테고리 약자.
 *
 * 아이콘 존재 여부는 빌드 타임 매니페스트(lib/icons-manifest.json)로 판단 → 아직 생성 안 된 동안엔
 * 404 요청·깨진 이미지 깜빡임 없이 이모지로 떨어진다. gen-icons.mjs가 생성 후 매니페스트를 갱신한다.
 */
import { useState } from 'react';
import manifest from '@/lib/icons-manifest.json';

const ICONS = new Set((manifest as { icons: string[] }).icons);

export default function FoodIcon({ nm, em, cat, px }: { nm?: string; em?: string; cat?: string; px: number }) {
  const [bad, setBad] = useState(false);
  if (nm && ICONS.has(nm) && !bad) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/icons/${encodeURIComponent(nm)}.png`} alt={nm} width={px} height={px}
        onError={() => setBad(true)} style={{ width: px, height: px, objectFit: 'contain' }} />
    );
  }
  if (em) return <span style={{ fontSize: Math.round(px * 0.82), lineHeight: 1 }}>{em}</span>;
  return <span style={{ fontSize: Math.max(10, Math.round(px * 0.26)), fontWeight: 700, color: '#9CA3AF' }}>{(cat || '').replace('_', '·').split('·')[0]}</span>;
}
