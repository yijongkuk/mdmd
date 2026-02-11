/** Speckle 메시 데이터 (Y-up 변환 완료, 원점 중심) */
export interface SpeckleMeshData {
  meshes: SpeckleMeshPart[];
  /** 전체 바운딩 박스 (원점 기준) */
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
  name: string;
  /** 총 삼각형 수 */
  totalTriangles: number;
}

export interface SpeckleMeshPart {
  /** 정점 배열 [x,y,z,...] — Y-up 좌표계 */
  vertices: number[];
  /** 삼각형 인덱스 배열 */
  indices: number[];
  /** 재질 색상 (hex) */
  color?: string;
}

/** Speckle 참조 정보 (ModuleDefinition에 저장) */
export interface SpeckleRef {
  streamId: string;
  objectId: string;
  commitId?: string;
  modelName?: string;
}

/** Speckle 프로젝트 (스트림) */
export interface SpeckleProject {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

/** Speckle 모델 (브랜치) */
export interface SpeckleModel {
  id: string;
  name: string;
  description: string;
  commitCount: number;
  latestCommit: {
    id: string;
    referencedObject: string;
    createdAt: string;
    message: string;
  } | null;
}

// ===== Export 관련 타입 =====

/** 내보내기용 모듈 데이터 (클라이언트 → 서버) */
export interface SpeckleExportModule {
  name: string;
  position: [number, number, number]; // Y-up world coords
  rotation: 0 | 90 | 180 | 270;
  dimensions: [number, number, number]; // width, height, depth
  color: string; // hex (#RRGGBB)
  /** Speckle 커스텀 모듈이면 메시 데이터 포함 */
  meshData?: SpeckleMeshData;
}

/** POST /api/speckle/export 요청 body */
export interface SpeckleExportRequest {
  branchName: string;
  message: string;
  modules: SpeckleExportModule[];
}

/** POST /api/speckle/export 응답 */
export interface SpeckleExportResponse {
  commitId: string;
  commitUrl: string;
}
