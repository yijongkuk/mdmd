/**
 * 일조권 사선제한 (건축법 시행령 제86조)
 * 정북방향 인접대지경계선으로부터의 높이 제한
 */

/** 일조권 사선제한 적용 대상 용도지역 (주거지역) */
export const SOLAR_ACCESS_ZONES = new Set([
  'ZONE_R1_EXCLUSIVE',
  'ZONE_R2_EXCLUSIVE',
  'ZONE_R1_GENERAL',
  'ZONE_R2_GENERAL',
  'ZONE_R3_GENERAL',
]);

/**
 * 정북일조사선 최대 높이 (건축선 기준)
 * - 9m까지: 건축선(setback) 그대로 수직 가능
 * - 9m 초과: 건축선에서 남쪽으로 거리 d만큼 떨어진 지점에서 h = 9 + 2d
 *   (2:1 경사 — 거리 1m당 높이 2m 증가)
 *
 * @param d 건축선(setback 경계) 북쪽 변에서 남쪽으로의 거리 (m)
 */
export function solarMaxHeight(d: number): number {
  if (d <= 0) return 9;
  return 9 + 2 * d;
}
