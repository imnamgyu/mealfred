/**
 * 메뉴명 → 식재료 매핑 (서버 래퍼)
 *
 * 순수 로직은 lib/menuMapCore.ts(클라이언트 안전). 여기선 public/ingredients-light.json을
 * fs로 읽어 풀 어휘를 주입한 서버용 매퍼를 만들고, 기존 API(canon·CANON_VOCAB·mapMenuLocal)를 노출.
 * route.ts와 scripts(audit·gen·pull)가 이 모듈을 쓴다.
 */
import fs from 'fs';
import path from 'path';
import { createMapper, EXTRA, MENU_MAP } from './menuMapCore.ts';

let POOL_NAMES: string[] = [];
try {
  const fp = path.join(process.cwd(), 'public', 'ingredients-light.json');
  POOL_NAMES = (JSON.parse(fs.readFileSync(fp, 'utf-8')).ingredients as { nm: string }[]).map((x) => x.nm);
} catch { POOL_NAMES = []; }

const mapper = createMapper(POOL_NAMES);

export const CANON_VOCAB = mapper.vocab;
export const canon = mapper.canon;
export const scanIngredients = mapper.scanIngredients;
export const mapMenuLocal = mapper.mapMenu;
export { EXTRA, MENU_MAP };
export type { MapResult } from './menuMapCore.ts';
