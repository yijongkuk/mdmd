export interface AuctionProperty {
  id: string;                  // 물건관리번호(cltrMngNo)
  pbctCdtnNo?: string;         // 공매조건번호 — 상세조회/상세페이지 링크에 필요
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
  isShare?: boolean;           // 지분물건(부분소유) 여부 — 온비드 alcYn 필드 기준
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
  regionKeyword?: string; // lctnSdnm(소재지 시도) 필터 (서울, 경기, 인천 등 약칭)
  /**
   * 수의계약가능여부. 이 서비스의 필수 파라미터이고 Y/N이 상호배타적이라
   * 지정하지 않으면 양쪽을 각각 조회해 합친다.
   * Y와 N의 물건 수가 크게 다르므로(예: 경기 Y 4,462 / N 19,239) 호출부가
   * 한쪽만 지정하면 빈 페이지 요청을 줄일 수 있다.
   */
  pvctTrgtYn?: 'Y' | 'N';
  /** 'land' | 'building' — 지정 시 용도중분류를 서버에서 필터링한다 */
  category?: string;
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
