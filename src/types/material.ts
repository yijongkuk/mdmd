export type MaterialType = 'WOOD' | 'CONCRETE' | 'WHITE_PLASTER' | 'BRICK' | 'GLASS';

export const MATERIAL_TYPES: MaterialType[] = ['WOOD', 'CONCRETE', 'WHITE_PLASTER', 'BRICK', 'GLASS'];

export interface Material {
  id: string;
  name: string;
  nameKo: string;
  textureUrl?: string;
  color: string;
  roughness: number;
  metalness: number;
  priceMultiplier: number;
}

export const MATERIAL_LABELS: Record<MaterialType, string> = {
  WOOD: '목재',
  CONCRETE: '콘크리트',
  WHITE_PLASTER: '백색석고',
  BRICK: '벽돌',
  GLASS: '유리',
};
