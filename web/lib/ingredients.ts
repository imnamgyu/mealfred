/**
 * 식재료 데이터 액세스 레이어 (M2)
 *
 * - 현재: 정적 JSON 로드 (data_ingredient_pool_enriched.json + data_recipes_by_ingredient.json)
 * - M2 완료 시: Supabase ingredients 테이블 조회로 전환
 */
import fs from 'fs';
import path from 'path';

export type IngredientNutri = {
  energy_kcal?: number; protein_g?: number; fat_g?: number; carb_g?: number;
  fiber_g?: number; calcium_mg?: number; iron_mg?: number; zinc_mg?: number;
  vitA_ug?: number; vitD_ug?: number; vitC_mg?: number; vitB12_ug?: number;
  [k: string]: number | undefined;
};

export type Ingredient = {
  nm: string;
  em?: string;
  cat: string;
  grade?: string;
  grade_label?: string;
  elem_count?: number;
  infant_count?: number;
  nutri?: IngredientNutri;
  nong_name?: string;
  v4_grade?: 'S' | 'A' | 'B' | 'C' | 'D';
  v4_score?: number;
  v4_freq_total?: number;
  v4_reason?: string;
  v4_safety?: string;
  warning?: string;
  mercury?: { level: string; guide: string };
};

export type RecipeRecord = {
  name: string; age: string; method: string; allergens: string;
};

let _pool: Ingredient[] | null = null;
let _recipes: Record<string, { total_count: number; methods: Record<string,number>; top_recipes: RecipeRecord[] }> | null = null;

/** 정적 JSON 로드 (Server Component·Route Handler 전용) */
export function loadPool(): Ingredient[] {
  if (_pool) return _pool;
  // 정적 사이트 루트 (../) 의 JSON 파일 참조
  const fp = path.join(process.cwd(), '..', 'data_ingredient_pool_enriched.json');
  const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  _pool = data.pool as Ingredient[];
  return _pool;
}

export function loadRecipes() {
  if (_recipes) return _recipes;
  const fp = path.join(process.cwd(), '..', 'data_recipes_by_ingredient.json');
  const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  _recipes = data.by_ingredient;
  return _recipes!;
}

export type FreqRecipe = { name: string; freq: number; u: number; e: number; h: number; share: number };
let _freqRecipes: Record<string, FreqRecipe[]> | null = null;
/** 급식 빈도 기반 '또래가 잘 먹는 음식' — scripts/build-foods-recipes.py 생성.
 *  식재료가 메인인 레시피를 distinct 식단표 월 수 빈도순으로, 유아/초등/중고 등장과 함께. */
export function loadFreqRecipes(): Record<string, FreqRecipe[]> {
  if (_freqRecipes) return _freqRecipes;
  const fp = path.join(process.cwd(), 'public', 'ingredient-recipes.json');
  try { _freqRecipes = JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { _freqRecipes = {}; }
  return _freqRecipes!;
}

export function findIngredient(slug: string): Ingredient | null {
  return loadPool().find((p) => p.nm === decodeURIComponent(slug)) ?? null;
}

// 매운 판정은 client-safe lib/spicy.ts로 분리(ingredients.ts는 fs 사용 → 클라 번들 불가). 기존 import 경로 호환 위해 re-export.
export { isSpicyDish, isSpicyIngredient } from './spicy';

export function listByGrade(grade: '필수' | '권장' | '향신료'): Ingredient[] {
  return loadPool().filter((p) => p.grade_label === grade);
}

/** KDRI 만 1-2세 RNI/AI */
export const KDRI_1_2Y: Record<string, number> = {
  energy_kcal: 900, protein_g: 15, fat_g: 30, carb_g: 130, fiber_g: 15,
  calcium_mg: 500, iron_mg: 6, magnesium_mg: 70, phosphorus_mg: 460,
  potassium_mg: 1900, sodium_mg: 810, zinc_mg: 3, selenium_ug: 25,
  vitA_ug: 250, vitD_ug: 5, vitC_mg: 35, vitB12_ug: 0.9,
};

export const NUTRI_LABELS: Record<string, [string, string]> = {
  energy_kcal: ['에너지', 'kcal'], protein_g: ['단백질', 'g'],
  calcium_mg: ['칼슘', 'mg'], iron_mg: ['철', 'mg'],
  zinc_mg: ['아연', 'mg'], magnesium_mg: ['마그네슘', 'mg'],
  potassium_mg: ['칼륨', 'mg'],
  vitA_ug: ['비타민 A', 'μg'], vitD_ug: ['비타민 D', 'μg'],
  vitC_mg: ['비타민 C', 'mg'], vitB12_ug: ['비타민 B12', 'μg'],
  fiber_g: ['식이섬유', 'g'], selenium_ug: ['셀레늄', 'μg'],
  phosphorus_mg: ['인', 'mg'], fat_g: ['지방', 'g'],
};

export function nutriToStars(value: number, rni: number) {
  const pct = (value / rni) * 100;
  if (pct >= 30) return { s: 3, pct: Math.round(pct), label: '한 끼로 충분' };
  if (pct >= 15) return { s: 2, pct: Math.round(pct), label: '보통 보충' };
  if (pct >= 5)  return { s: 1, pct: Math.round(pct), label: '소량 함유' };
  return null;
}
