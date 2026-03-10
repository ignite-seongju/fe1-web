// 스프린트 매핑 로직 (캐싱 포함)

import { SprintInfo } from './types';
import { BOARD_IDS } from '@/lib/constants/jira';
import { JiraClient } from '@/lib/services/jira/client';

/**
 * 스프린트 캐시 클래스
 * 동기화 세션 동안 스프린트 목록을 캐싱하여 API 호출 최소화
 */
class SprintCache {
  private cache = new Map<number, SprintInfo[]>();
  private client = new JiraClient('ignite');

  async getSprintsForBoard(boardId: number): Promise<SprintInfo[]> {
    if (this.cache.has(boardId)) {
      return this.cache.get(boardId)!;
    }

    const sprints = await this.fetchSprints(boardId);
    this.cache.set(boardId, sprints);
    return sprints;
  }

  private async fetchSprints(boardId: number): Promise<SprintInfo[]> {
    try {
      const result = await this.client.get<{
        values: Array<{
          id: number;
          name: string;
          state: 'active' | 'future' | 'closed';
        }>;
      }>(`agile/1.0/board/${boardId}/sprint`, {
        state: 'active,future',
        maxResults: '50',
      });

      if (result.success && result.data?.values) {
        return result.data.values.map((sprint) => ({
          ...sprint,
          boardId,
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  clear() {
    this.cache.clear();
  }
}

// 싱글톤 인스턴스
const sprintCache = new SprintCache();

/**
 * FEHG 스프린트 이름에서 기간 추출
 * 예: "FEHG 2511" → "2511"
 */
function extractSprintPeriod(sprintName: string): string | null {
  const match = sprintName.match(/FEHG\s+(\d{4})/);
  return match ? match[1] : null;
}

/**
 * 기간을 전체 연월 형식으로 변환
 * 예: "2511" → "202511"
 */
function convertToFullYearMonth(period: string): string {
  if (period.length === 4) {
    return '20' + period;
  }
  return period;
}

/**
 * 대상 프로젝트의 스프린트 이름 생성
 * 예: "HB", "202511" → "HB 202511"
 */
function buildTargetSprintName(projectKey: string, yearMonth: string): string {
  return `${projectKey} ${yearMonth}`;
}

/**
 * FEHG 스프린트를 대상 프로젝트 스프린트로 매핑
 */
export async function mapSprintToTarget(
  fehgSprintName: string | null,
  targetProject: 'KQ' | 'HDD' | 'HB'
): Promise<number | null> {
  if (!fehgSprintName) return null;

  // 1. FEHG 스프린트 이름에서 기간 추출
  const period = extractSprintPeriod(fehgSprintName);
  if (!period) return null;

  // 2. 전체 연월로 변환
  const fullYearMonth = convertToFullYearMonth(period);

  // 3. 대상 프로젝트 스프린트 이름 생성
  const targetSprintName = buildTargetSprintName(targetProject, fullYearMonth);

  // 4. 대상 보드의 스프린트 조회 (캐시 사용)
  const boardId = BOARD_IDS[targetProject];
  const targetSprints = await sprintCache.getSprintsForBoard(boardId);

  // 5. 이름으로 매칭
  const matchedSprint = targetSprints.find(
    (sprint) => sprint.name === targetSprintName
  );

  return matchedSprint?.id || null;
}

/**
 * 캐시 초기화 (동기화 시작 시 호출)
 */
export function initSprintCache() {
  sprintCache.clear();
}

/**
 * 스프린트 캐시 프리로드 (선택적)
 */
export async function preloadSprintCache(
  projects: Array<'KQ' | 'HDD' | 'HB'>
): Promise<void> {
  await Promise.all(
    projects.map((project) =>
      sprintCache.getSprintsForBoard(BOARD_IDS[project])
    )
  );
}
