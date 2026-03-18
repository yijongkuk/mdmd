export interface AuctionProperty {
  id: string;
  name: string;
  address: string;
  disposalMethod: string;
  minBidPrice: number;
  appraisalValue: number;
  bidStartDate: string;
  bidEndDate: string;
  itemType: string;
  status: string;
  onbidUrl: string;
  imageUrls?: string[];        // 온비드 물건 사진 URL
  pnu?: string;                // 필지고유번호
  area?: number;               // ㎡
  officialLandPrice?: number;  // 총 공시지가 (개별공시지가 × 면적)
  lat?: number;
  lng?: number;
  source?: 'onbid' | 'closed_school';
  // 폐교 전용 필드
  closedYear?: number;
  buildingArea?: number;
  unusedReason?: string;
  schoolLevel?: string;
  sido?: string;
}

export interface AuctionSearchParams {
  page?: number;
  size?: number;
  disposalMethodCode?: string;
  regionKeyword?: string; // CLTR_NM 필터 (서울, 경기, 인천 등)
}

export interface AuctionListResponse {
  properties: AuctionProperty[];
  totalCount: number;
  page: number;
  pageSize: number;
  apiError?: string;
}

export type PropertyCategory = 'land' | 'building' | 'all';

export interface AuctionFilters {
  priceRange: [number, number];       // 감정가액
  bidPriceRange: [number, number];    // 최저입찰가
  areaRange: [number, number];   // ㎡
  disposalMethods: string[];
  landTypes: string[];
  region: 'all' | 'metro';
  searchQuery: string;
  dataSources: string[];
  category: PropertyCategory;
  excludeLowUnitPrice: boolean;  // 단가 1만원/m² 미만 제외
  excludeDifficultSoil: boolean; // 기초공사 어려움 제외
  excludeShareProperties: boolean; // 지분 물건 제외
}
