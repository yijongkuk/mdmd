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
}

export interface AuctionFilters {
  priceRange: [number, number];
  areaRange: [number, number];   // ㎡
  disposalMethods: string[];
  landTypes: string[];
  region: 'all' | 'metro';
  searchQuery: string;
  dataSources: string[];
}
