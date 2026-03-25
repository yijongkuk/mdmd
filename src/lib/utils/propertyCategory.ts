/** 토지 카테고리 키워드 — 모듈러 건축 가능 부지 */
export const LAND_KEYWORDS = ['토지', '대지', '임야', '전', '답', '과수원', '목장', '잡종지', '나지'];

/** 건물 카테고리 키워드 — 부동산 건물만 (동산 제외) */
export const BUILDING_ONLY_KEYWORDS = [
  '아파트', '건물', '상가', '주택', '빌라', '오피스텔', '빌딩',
  '사무실', '공장', '창고', '종교시설',
];

/** 제외 키워드 — 비부동산 동산 (항상 제외) */
export const EXCLUDE_KEYWORDS = [
  '차량', '자동차', '기계', '선박', '항공', '유가증권', '동산', '회원권', '입주권',
];

/** 토지 카테고리 판별 */
export function isLandCategory(itemType: string, name: string): boolean {
  const combined = `${itemType} ${name}`;
  if (BUILDING_ONLY_KEYWORDS.some((kw) => combined.includes(kw))) return false;
  if (EXCLUDE_KEYWORDS.some((kw) => combined.includes(kw))) return false;
  if (LAND_KEYWORDS.some((kw) => combined.includes(kw))) return true;
  if (!itemType) return true;
  return false;
}

/** 건물 카테고리 판별 */
export function isBuildingCategory(itemType: string, name: string): boolean {
  const combined = `${itemType} ${name}`;
  if (EXCLUDE_KEYWORDS.some((kw) => combined.includes(kw))) return false;
  return BUILDING_ONLY_KEYWORDS.some((kw) => combined.includes(kw));
}

/** 비부동산 동산 판별 (항상 제외 대상) */
export function isExcludedCategory(itemType: string, name: string): boolean {
  const combined = `${itemType} ${name}`;
  return EXCLUDE_KEYWORDS.some((kw) => combined.includes(kw));
}
