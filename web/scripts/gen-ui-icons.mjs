/**
 * gen-ui-icons.mjs — 앱 UI 아이콘 생성 (OpenAI gpt-image-1, gen-icons.mjs와 같은 파이프라인).
 *
 * 이모지 금지 규칙(이사님): 사용자 대면 UI의 시각 요소는 이 파이프라인으로 생성한 아이콘을 쓴다.
 * 탭바 5종(두톤 미니멀) + 키트 일러스트(골고루·집중) + 포인트 코인 → public/icons/ui/<name>.png
 * 생성 후 sips로 용도별 다운사이즈(탭 96px·일러 512px·코인 192px). 이미 있으면 스킵.
 *
 * 실행: node scripts/gen-ui-icons.mjs   (OPENAI_API_KEY는 .env.local에서 자동 로드)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const KEY = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
if (!KEY) { console.error('❌ OPENAI_API_KEY 없음'); process.exit(1); }

const OUT = 'public/icons/ui';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const TAB = (subject) => `Minimal flat-vector app tab-bar icon for "Mealfred", a warm toddler-nutrition app. Subject: ${subject}. Style: simple rounded geometric shapes, two-tone palette — warm orange (#FF6B1A) with deep navy (#1a2b4a) accents and soft cream highlights. CRITICAL: fully transparent background, NO frame, NO card, NO circle background, NO panel, NO text. Bold simple silhouette that stays legible at 22x22 px. Centered with generous padding.`;
const ART = (subject) => `${subject}, as a friendly app illustration for "Mealfred", a toddler nutrition app. Rounded flat-vector illustration with fresh natural colors, soft highlights and a subtle soft drop shadow. Cute but not babyish, clean, wholesome, parent-friendly. CRITICAL: fully transparent background — the subject floats freely with absolutely NO card, NO frame, NO rounded square, NO panel and NO background color behind it. Centered with padding, smooth gradients, no harsh outlines, no text. 1:1 square, crisp at small sizes.`;

const ICONS = [
  { name: 'tab-coach', px: 96, prompt: TAB('a warm sealed letter envelope with a tiny heart on the flap') },
  { name: 'tab-care', px: 96, prompt: TAB('a pencil writing a checkmark on a small meal note') },
  { name: 'tab-foods', px: 96, prompt: TAB('a small stack of ingredient picture cards with a carrot on the front card') },
  { name: 'tab-kit', px: 96, prompt: TAB('a gift delivery box with a ribbon and a fresh green leaf peeking out of the top') },
  { name: 'tab-me', px: 96, prompt: TAB('a friendly rounded person silhouette, head and shoulders') },
  { name: 'kit-gollo', px: 512, prompt: ART('An open cardboard weekly meal-kit delivery box filled with a colorful variety of fresh vegetables — carrot, broccoli, tomato, paprika and leafy greens — neatly packed and slightly overflowing') },
  { name: 'kit-focus', px: 512, prompt: ART('A single fresh carrot standing upright at the center of soft concentric rings like a gentle target, symbolizing focused practice on one ingredient') },
  { name: 'point-coin', px: 192, prompt: ART('A shiny warm golden coin with a soft star sparkle, plain face with no letters and no numbers') },
];

let cost = 0;
for (const ic of ICONS) {
  const path = `${OUT}/${ic.name}.png`;
  if (existsSync(path)) { console.log(`  ↷ ${ic.name} 있음, 스킵`); continue; }
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: ic.prompt, size: '1024x1024', quality: 'medium', background: 'transparent', n: 1 }),
  });
  const data = await res.json();
  if (!res.ok || !data.data?.[0]?.b64_json) { console.log(`  ✗ ${ic.name} — ${data.error?.message || res.status}`); continue; }
  writeFileSync(path, Buffer.from(data.data[0].b64_json, 'base64'));
  execSync(`sips -Z ${ic.px} "${path}" >/dev/null 2>&1`);
  cost += 0.042;
  console.log(`  ✓ ${ic.name} (${ic.px}px)`);
}
console.log(`완료 · 비용 ≈ $${cost.toFixed(2)}`);
