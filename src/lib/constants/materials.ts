import { Material } from '@/types/material';

export const MATERIALS: Material[] = [
  {
    id: 'wood',
    name: 'WOOD',
    nameKo: '목재',
    color: '#C4A882',
    roughness: 0.8,
    metalness: 0.0,
    priceMultiplier: 1.0,
  },
  {
    id: 'concrete',
    name: 'CONCRETE',
    nameKo: '콘크리트',
    color: '#B0B0B0',
    roughness: 0.9,
    metalness: 0.0,
    priceMultiplier: 0.8,
  },
  {
    id: 'white-plaster',
    name: 'WHITE_PLASTER',
    nameKo: '백색석고',
    color: '#F5F5F0',
    roughness: 0.7,
    metalness: 0.0,
    priceMultiplier: 0.7,
  },
  {
    id: 'brick',
    name: 'BRICK',
    nameKo: '벽돌',
    color: '#C45A3C',
    roughness: 0.85,
    metalness: 0.0,
    priceMultiplier: 0.9,
  },
  {
    id: 'glass',
    name: 'GLASS',
    nameKo: '유리',
    color: '#D4E8F0',
    roughness: 0.1,
    metalness: 0.3,
    priceMultiplier: 1.5,
  },
];

export function getMaterialById(id: string): Material | undefined {
  return MATERIALS.find((m) => m.id === id);
}

export const DEFAULT_MATERIAL_ID = 'wood';
