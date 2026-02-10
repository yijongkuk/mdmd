/**
 * Speckle API 유틸리티
 * - GraphQL로 프로젝트/모델 메타데이터 조회
 * - ObjectLoader로 메시 데이터 스트리밍
 */

const SPECKLE_SERVER = process.env.SPECKLE_SERVER_URL ?? 'https://app.speckle.systems';
const SPECKLE_TOKEN = process.env.SPECKLE_TOKEN ?? '';

/** GraphQL 쿼리 실행 */
async function gql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SPECKLE_SERVER}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SPECKLE_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Speckle GraphQL error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Speckle GraphQL: ${json.errors[0]?.message ?? 'Unknown error'}`);
  }

  return json.data as T;
}

/** 서버 정보 (연결 테스트용 — 인증 불필요) */
export async function getServerInfo() {
  const data = await gql<{ serverInfo: { name: string; version: string } }>(`
    query { serverInfo { name version } }
  `);
  return data.serverInfo;
}

/** 사용자의 스트림(프로젝트) 목록 — streams:read 스코프만 필요 */
export async function getProjects() {
  const data = await gql<{
    streams: {
      items: Array<{
        id: string;
        name: string;
        description: string;
        updatedAt: string;
      }>;
    };
  }>(`
    query {
      streams(limit: 20) {
        items {
          id
          name
          description
          updatedAt
        }
      }
    }
  `);
  return data.streams.items;
}

/** 스트림의 브랜치(모델) 목록 — Speckle v2 API */
export async function getModels(streamId: string) {
  const data = await gql<{
    stream: {
      branches: {
        items: Array<{
          id: string;
          name: string;
          description: string;
          commits: {
            totalCount: number;
            items: Array<{
              id: string;
              referencedObject: string;
              createdAt: string;
              message: string;
            }>;
          };
        }>;
      };
    };
  }>(`
    query($streamId: String!) {
      stream(id: $streamId) {
        branches(limit: 50) {
          items {
            id
            name
            description
            commits(limit: 1) {
              totalCount
              items {
                id
                referencedObject
                createdAt
                message
              }
            }
          }
        }
      }
    }
  `, { streamId });
  return data.stream.branches.items;
}

// ===== 쓰기 함수 (Export용) =====

/** 오브젝트 일괄 업로드 — REST POST /objects/{streamId} */
export async function uploadObjects(streamId: string, objects: Record<string, unknown>[]) {
  const batch = JSON.stringify(objects);
  const blob = new Blob([batch], { type: 'application/json' });

  const formData = new FormData();
  formData.append('batch-1', blob, 'batch-1');

  const res = await fetch(`${SPECKLE_SERVER}/objects/${streamId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SPECKLE_TOKEN}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Speckle upload error: ${res.status} ${text}`);
  }
}

/** 브랜치 생성 (이미 존재하면 무시) */
export async function createBranch(streamId: string, name: string, description = '') {
  try {
    await gql(`
      mutation($branch: BranchCreateInput!) {
        branchCreate(branch: $branch)
      }
    `, { branch: { streamId, name, description } });
  } catch (err: unknown) {
    // "already exists" 에러는 무시
    if (err instanceof Error && err.message.includes('already exists')) return;
    throw err;
  }
}

/** 커밋 생성 → commitId 반환 */
export async function createCommit(
  streamId: string,
  branchName: string,
  objectId: string,
  message: string,
  totalChildrenCount: number,
): Promise<string> {
  const data = await gql<{ commitCreate: string }>(`
    mutation($commit: CommitCreateInput!) {
      commitCreate(commit: $commit)
    }
  `, {
    commit: {
      streamId,
      branchName,
      objectId,
      message,
      totalChildrenCount,
    },
  });
  return data.commitCreate;
}

export { SPECKLE_SERVER, SPECKLE_TOKEN };
