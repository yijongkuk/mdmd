/** 토양특성 상세정보 V3 응답 항목 */
export interface SoilCharacteristics {
  /** 토성 (표토) 코드 */
  soilTextureCode: string | null;
  /** 토성 한글 */
  soilTextureName: string | null;
  /** 배수등급 코드 */
  drainageCode: string | null;
  /** 배수등급 한글 */
  drainageName: string | null;
  /** 유효토심 코드 */
  soilDepthCode: string | null;
  /** 유효토심 한글 */
  soilDepthName: string | null;
  /** 모암 코드 */
  parentRockCode: string | null;
  /** 모암 한글 */
  parentRockName: string | null;
  /** 분포지형 코드 */
  terrainCode: string | null;
  /** 분포지형 한글 */
  terrainName: string | null;
  /** 침식등급 코드 */
  erosionCode: string | null;
  /** 침식등급 한글 */
  erosionName: string | null;
  /** 토양구조 코드 */
  structureCode: string | null;
  /** 토양구조 한글 */
  structureName: string | null;
  /** 표토 자갈함량 코드 */
  surfaceGravelCode: string | null;
  /** 표토 자갈함량 한글 */
  surfaceGravelName: string | null;
  /** 논 적성등급 */
  paddyGrade: string | null;
  /** 밭 적성등급 */
  fieldGrade: string | null;
}

/** 토양 단면정보 (SoilCharacSctnn V2) */
export interface SoilProfile {
  /** 심토토성 코드 */
  deepSoilTextureCode: string | null;
  /** 심토토성 한글 */
  deepSoilTextureName: string | null;
  /** 심토 자갈함량 코드 */
  deepSoilGravelCode: string | null;
  /** 심토 자갈함량 한글 */
  deepSoilGravelName: string | null;
  /** 경사도 코드 */
  slopeCode: string | null;
  /** 경사도 한글 */
  slopeName: string | null;
}

/** 토양검정 화학성 V2 응답 항목 */
export interface SoilChemistry {
  pH: number | null;
  organicMatter: number | null;
  phosphorus: number | null;
  potassium: number | null;
  calcium: number | null;
  magnesium: number | null;
}

/** UI에서 사용하는 합산 타입 */
export interface SoilInfo {
  characteristics: SoilCharacteristics | null;
  profile: SoilProfile | null;
  chemistry: SoilChemistry | null;
  /** 토목 난이도: good / moderate / difficult */
  difficultyLevel: 'good' | 'moderate' | 'difficult' | null;
  difficultyLabel: string | null;
}

// ── V3 숫자 코드 → 한글 매핑 (한국 토양조사편람 기준) ──

/** 표토토성 (Surtture_Cd) */
export const SOIL_TEXTURE_LABELS: Record<string, string> = {
  '01': '사토',
  '02': '양질사토',
  '03': '사양토',
  '04': '양토',
  '05': '미사질양토',
  '06': '미사토',
  '07': '사질식양토',
  '08': '식양토',
  '09': '미사질식양토',
  '10': '사질식토',
  '11': '미사질식토',
  '12': '식토',
  '13': '역질사토',
  '14': '역질양토',
};

/** 배수등급 (Soildra_Cd) */
export const DRAINAGE_LABELS: Record<string, string> = {
  '01': '매우양호',
  '02': '양호',
  '03': '약간양호',
  '04': '약간불량',
  '05': '불량',
  '06': '매우불량',
  '07': '과습',
};

/** 유효토심 (Vldsoildep_Cd) */
export const SOIL_DEPTH_LABELS: Record<string, string> = {
  '01': '매우얕음 (20cm 미만)',
  '02': '얕음 (20~50cm)',
  '03': '보통 (50~100cm)',
  '04': '깊음 (100~150cm)',
  '05': '매우깊음 (150cm 이상)',
};

/** 모암/모재 (Matrix_Cd) */
export const PARENT_ROCK_LABELS: Record<string, string> = {
  '01': '화강암',
  '02': '편마암',
  '03': '편암',
  '04': '사암/역암',
  '05': '혈암/점판암',
  '06': '석회암',
  '07': '규암',
  '08': '반암/장석',
  '09': '현무암',
  '10': '반려암/섬록암',
  '11': '유문암',
  '12': '안산암',
  '13': '응회암',
  '14': '충적층',
  '15': '붕적층',
  '16': '선상지퇴적물',
  '17': '해성퇴적물',
  '18': '호성퇴적물',
  '19': '점토퇴적물',
  '20': '화산회',
};

/** 분포지형 (Soil_Type_Geo_Cd) */
export const TERRAIN_LABELS: Record<string, string> = {
  '01': '산악지',
  '02': '구릉지',
  '03': '곡간지',
  '04': '선상지',
  '05': '하성평탄지',
  '06': '해성평탄지',
  '07': '하해혼성평탄지',
};

/** 침식등급 (Erosion_Cd) */
export const EROSION_LABELS: Record<string, string> = {
  '01': '없음',
  '02': '약간',
  '03': '보통',
  '04': '심함',
};

/** 적성등급 공통 (논/밭/과수/초지/임지) */
export const GRADE_LABELS: Record<string, string> = {
  '01': '1등급',
  '02': '2등급',
  '03': '3등급',
  '04': '4등급',
  '05': '5등급',
  '06': '6등급',
};

/** 경사도 (Soilslope_Cd) */
export const SLOPE_LABELS: Record<string, string> = {
  '01': '거의 평탄 (0~2%)',
  '02': '완경사 (2~7%)',
  '03': '경사 (7~15%)',
  '04': '급경사 (15~30%)',
  '05': '험준 (30~60%)',
  '06': '절험 (60%+)',
};

/** 자갈함량 — 표토(Sur_Ston_Cd) / 심토(Deepsoil_Ston_Cd) 공통 */
export const GRAVEL_LABELS: Record<string, string> = {
  '01': '없음',
  '02': '약간 (~3%)',
  '03': '보통 (3~15%)',
  '04': '많음 (15~35%)',
  '05': '대단히 많음 (35~60%)',
  '06': '극히 많음 (60%+)',
};

/** 토양구조 (Soil_Structure_Cd) */
export const STRUCTURE_LABELS: Record<string, string> = {
  '01': '판상',
  '02': '각주상',
  '03': '원주상',
  '04': '아각괴상',
  '05': '입상',
  '06': '단립',
  '07': '괴상 (무구조)',
};
