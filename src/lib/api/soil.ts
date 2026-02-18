import { getCached, setCache, TTL } from './cache';
import type { SoilCharacteristics, SoilProfile, SoilInfo } from '@/types/soil';
import {
  SOIL_TEXTURE_LABELS,
  DRAINAGE_LABELS,
  SOIL_DEPTH_LABELS,
  PARENT_ROCK_LABELS,
  TERRAIN_LABELS,
  EROSION_LABELS,
  SLOPE_LABELS,
  GRAVEL_LABELS,
  STRUCTURE_LABELS,
} from '@/types/soil';

const SERVICE_KEY = process.env.SOIL_API_KEY ?? '';

/** XML 태그에서 값 추출 (빈 태그는 null) */
function xmlVal(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  const m = xml.match(re);
  if (!m) return null;
  const v = m[1].trim();
  return v === '' ? null : v;
}

// ── 토양특성 상세정보 V3 ──

export async function getSoilCharacteristics(pnu: string): Promise<SoilCharacteristics | null> {
  if (!SERVICE_KEY) return null;

  const url = new URL('https://apis.data.go.kr/1390802/SoilEnviron/SoilCharac/V3/getSoilCharacter');
  url.searchParams.set('serviceKey', SERVICE_KEY);
  url.searchParams.set('PNU_CD', pnu);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;

  const xml = await res.text();

  // 에러 응답 체크
  const resultCode = xmlVal(xml, 'Result_Code');
  if (resultCode !== '200') return null;

  // item 블록이 없으면 데이터 없음
  if (!xml.includes('<item>')) return null;

  const textureCode = xmlVal(xml, 'Surtture_Cd');
  const drainageCode = xmlVal(xml, 'Soildra_Cd');
  const depthCode = xmlVal(xml, 'Vldsoildep_Cd');
  const rockCode = xmlVal(xml, 'Matrix_Cd');
  const terrainCode = xmlVal(xml, 'Soil_Type_Geo_Cd');
  const erosionCode = xmlVal(xml, 'Erosion_Cd');
  const structureCode = xmlVal(xml, 'Soil_Structure_Cd');
  const surfaceGravelCode = xmlVal(xml, 'Sur_Ston_Cd');

  return {
    soilTextureCode: textureCode,
    soilTextureName: textureCode ? (SOIL_TEXTURE_LABELS[textureCode] ?? `코드 ${textureCode}`) : null,
    drainageCode,
    drainageName: drainageCode ? (DRAINAGE_LABELS[drainageCode] ?? `코드 ${drainageCode}`) : null,
    soilDepthCode: depthCode,
    soilDepthName: depthCode ? (SOIL_DEPTH_LABELS[depthCode] ?? `코드 ${depthCode}`) : null,
    parentRockCode: rockCode,
    parentRockName: rockCode ? (PARENT_ROCK_LABELS[rockCode] ?? `코드 ${rockCode}`) : null,
    terrainCode,
    terrainName: terrainCode ? (TERRAIN_LABELS[terrainCode] ?? `코드 ${terrainCode}`) : null,
    erosionCode,
    erosionName: erosionCode ? (EROSION_LABELS[erosionCode] ?? `코드 ${erosionCode}`) : null,
    structureCode,
    structureName: structureCode ? (STRUCTURE_LABELS[structureCode] ?? `코드 ${structureCode}`) : null,
    surfaceGravelCode,
    surfaceGravelName: surfaceGravelCode ? (GRAVEL_LABELS[surfaceGravelCode] ?? `코드 ${surfaceGravelCode}`) : null,
    paddyGrade: xmlVal(xml, 'Rfld_Grd_Cd'),
    fieldGrade: xmlVal(xml, 'Pfld_Grd_Cd'),
  };
}

// ── 토양 단면정보 V2 ──

export async function getSoilProfile(pnu: string): Promise<SoilProfile | null> {
  if (!SERVICE_KEY) return null;

  const url = new URL('https://apis.data.go.kr/1390802/SoilEnviron/SoilCharacSctnn/V2/getSoilCharacterSctnn');
  url.searchParams.set('serviceKey', SERVICE_KEY);
  url.searchParams.set('PNU_CD', pnu);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;

  const xml = await res.text();
  const resultCode = xmlVal(xml, 'Result_Code');
  if (resultCode !== '200') return null;
  if (!xml.includes('<item>')) return null;

  const deepTextureCode = xmlVal(xml, 'Deepsoil_Qlt_Cd');
  const deepGravelCode = xmlVal(xml, 'Deepsoil_Ston_Cd');
  const slopeCode = xmlVal(xml, 'Soilslope_Cd');

  return {
    deepSoilTextureCode: deepTextureCode,
    deepSoilTextureName: deepTextureCode ? (SOIL_TEXTURE_LABELS[deepTextureCode] ?? `코드 ${deepTextureCode}`) : null,
    deepSoilGravelCode: deepGravelCode,
    deepSoilGravelName: deepGravelCode ? (GRAVEL_LABELS[deepGravelCode] ?? `코드 ${deepGravelCode}`) : null,
    slopeCode,
    slopeName: slopeCode ? (SLOPE_LABELS[slopeCode] ?? `코드 ${slopeCode}`) : null,
  };
}

// ── 토목 난이도 판정 ──

function assessDifficulty(
  chars: SoilCharacteristics,
  profile: SoilProfile | null,
): { level: 'good' | 'moderate' | 'difficult'; label: string } {
  let score = 0; // higher = worse

  // 배수: 불량(05)/매우불량(06)/과습(07) → +2, 약간불량(04) → +1
  if (['05', '06', '07'].includes(chars.drainageCode ?? '')) score += 2;
  else if (chars.drainageCode === '04') score += 1;

  // 지형: 산악지(01)/구릉지(02) → +2, 곡간지(03) → +1
  if (['01', '02'].includes(chars.terrainCode ?? '')) score += 2;
  else if (chars.terrainCode === '03') score += 1;

  // 유효토심: 매우얕음(01) → +2, 얕음(02) → +1 (암반 근접)
  if (chars.soilDepthCode === '01') score += 2;
  else if (chars.soilDepthCode === '02') score += 1;

  // 침식: 심함(04) → +1
  if (chars.erosionCode === '04') score += 1;

  // 토성: 식토(12)/미사질식토(11)/사질식토(10) → +1 (연약지반)
  if (['10', '11', '12'].includes(chars.soilTextureCode ?? '')) score += 1;

  // 경사도 (단면정보): 경사(03) +1, 급경사(04) +2, 험준(05)/절험(06) +3
  if (profile?.slopeCode) {
    const s = profile.slopeCode;
    if (s === '03') score += 1;
    else if (s === '04') score += 2;
    else if (s === '05' || s === '06') score += 3;
  }

  // 심토 자갈함량: 많음(04+) → 굴착 난이도 +1
  if (profile?.deepSoilGravelCode) {
    const g = Number(profile.deepSoilGravelCode);
    if (g >= 4) score += 1;
  }

  if (score >= 4) return { level: 'difficult', label: '어려움' };
  if (score >= 2) return { level: 'moderate', label: '보통' };
  return { level: 'good', label: '양호' };
}

// ── 합산 호출 (캐싱 포함) ──

export async function getSoilInfo(pnu: string): Promise<SoilInfo> {
  const cacheKey = `soil:${pnu}`;
  const cached = getCached<SoilInfo>(cacheKey);
  if (cached) return cached;

  const [characteristics, profile] = await Promise.all([
    getSoilCharacteristics(pnu).catch(() => null),
    getSoilProfile(pnu).catch(() => null),
  ]);

  const difficulty = characteristics ? assessDifficulty(characteristics, profile) : null;

  const result: SoilInfo = {
    characteristics,
    profile,
    chemistry: null,
    difficultyLevel: difficulty?.level ?? null,
    difficultyLabel: difficulty?.label ?? null,
  };

  setCache(cacheKey, result, TTL.SOIL);
  return result;
}
