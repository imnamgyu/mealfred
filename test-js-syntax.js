#!/usr/bin/env node
/**
 * 배포 전 JS 구문 검증 스크립트
 * - HTML 파일 내 인라인 <script> 블록을 추출하여 파싱 테스트
 * - 작은따옴표/큰따옴표 충돌, 미닫힌 괄호 등 감지
 *
 * 사용법: node test-js-syntax.js
 */

const fs = require('fs');
const path = require('path');

const DEPLOY_DIR = __dirname;
const HTML_FILES = fs.readdirSync(DEPLOY_DIR)
  .filter(f => f.endsWith('.html'))
  .map(f => path.join(DEPLOY_DIR, f));

let totalErrors = 0;
let totalChecked = 0;

for (const file of HTML_FILES) {
  const content = fs.readFileSync(file, 'utf-8');
  const basename = path.basename(file);

  // 인라인 스크립트 블록 추출 (<script src="...">는 제외)
  const scriptRegex = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let scriptIndex = 0;

  while ((match = scriptRegex.exec(content)) !== null) {
    scriptIndex++;
    const scriptContent = match[1].trim();
    if (!scriptContent) continue;

    totalChecked++;

    // 1. JS 구문 파싱 테스트
    try {
      new Function(scriptContent);
    } catch (e) {
      totalErrors++;
      const lineNum = content.substring(0, match.index).split('\n').length;
      console.error(`❌ ${basename} — script #${scriptIndex} (line ~${lineNum})`);
      console.error(`   Parse error: ${e.message}`);

      // 에러 위치 찾기
      const lines = scriptContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        try {
          new Function(lines.slice(0, i + 1).join('\n'));
        } catch (e2) {
          if (e2.message !== 'Unexpected end of input') {
            try {
              new Function(lines.slice(0, i).join('\n'));
              console.error(`   → Line ${i + 1}: ${lines[i].substring(0, 100)}`);
              break;
            } catch (_) {}
          }
        }
      }
      console.error('');
    }

    // 2. HTML 속성 따옴표 충돌 감지 (실제 버그 패턴)
    // 'text<img src='/path' alt='x'>text' — src=' 등이 JS 문자열을 끊음
    const lines = scriptContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 작은따옴표 문자열 안에 src=' / alt=' / style=' / href=' 패턴
      if (/'\s*<[^>]+(src|alt|style|href|class|onclick)='/.test(line)) {
        totalErrors++;
        console.error(`❌ ${basename} — script #${scriptIndex}, line ${i + 1}`);
        console.error(`   HTML attribute uses single quotes inside single-quoted JS string`);
        console.error(`   → ${line.substring(0, 120)}`);
        console.error('');
      }
    }
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`검증 완료: ${HTML_FILES.length}개 파일, ${totalChecked}개 스크립트 블록`);

if (totalErrors === 0) {
  console.log(`✅ 모든 JS 구문 정상`);
  process.exit(0);
} else {
  console.log(`❌ ${totalErrors}개 에러 발견 — 배포 중단!`);
  process.exit(1);
}
