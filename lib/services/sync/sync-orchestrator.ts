// 동기화 오케스트레이터 - 전체 프로세스 조율

import { JiraIssue } from '@/lib/types/jira';
import { SyncOptions, SyncSummary, SyncResult, SyncLog } from './types';
import { SyncLogger } from './logger';
import { IgniteSyncService } from './ignite-sync.service';
import { HMGSyncService } from './hmg-sync.service';
import { chunkArray } from './field-mapper';
import { initSprintCache, preloadSprintCache } from './sprint-mapper';
import { jira } from '@/lib/services/jira';
import { JIRA_USERS } from '@/lib/constants/jira';
import { ConfluenceEpicClient } from '@/lib/services/confluence/client';

/**
 * 동기화 오케스트레이터
 * 전체 동기화 프로세스를 관리하고 조율
 */
export class SyncOrchestrator {
  private logger: SyncLogger;
  private igniteSyncService: IgniteSyncService;
  private hmgSyncService: HMGSyncService;

  constructor(onLog?: (log: SyncLog) => void) {
    this.logger = new SyncLogger(onLog);
    this.igniteSyncService = new IgniteSyncService(this.logger);
    this.hmgSyncService = new HMGSyncService(this.logger);
  }

  /**
   * 동기화 실행
   */
  async execute(options: SyncOptions): Promise<SyncSummary> {
    const startTime = Date.now();
    const allResults: SyncResult[] = [];

    try {
      // 스프린트 캐시 초기화
      initSprintCache();

      this.logger.info('동기화 시작');

      // Confluence Epic 목록 프리로드 (캐시 워밍업)
      const preloadResult = await ConfluenceEpicClient.getAllowedEpics();
      if (preloadResult.success && preloadResult.data) {
        this.logger.info(
          `Confluence Epic 목록 로드 완료: ${preloadResult.data.length}개`
        );
      } else {
        this.logger.warning(
          `Confluence Epic 목록 로드 실패: ${preloadResult.error || '알 수 없는 오류'}`
        );
        this.logger.warning(
          '👉 AUTOWAY 동기화가 제한될 수 있습니다. Confluence 확인: https://ignitecorp.atlassian.net/wiki/spaces/IF/pages/2018738177'
        );
      }

      // 1. 대상 프로젝트 결정
      let targetProjects = options.targetProjects;

      // 에픽 지정 모드일 때는 에픽 정보를 기반으로 대상 프로젝트 결정
      if (options.epicId && !targetProjects) {
        targetProjects = await this.determineTargetProjectsForEpic(
          options.epicId
        );
        this.logger.info(
          `에픽 기반 대상 프로젝트 결정: ${targetProjects.join(', ')}`
        );
      }

      // 티켓 지정 모드일 때는 티켓 정보를 기반으로 대상 프로젝트 결정
      if (options.ticketId && !targetProjects) {
        targetProjects = await this.determineTargetProjectsForTicket(
          options.ticketId
        );
        if (targetProjects.length === 0) {
          this.logger.warning(
            '티켓 지정: 동기화 대상 프로젝트 없음 - 작업 종료'
          );
          return this.createSummary(allResults, startTime);
        }
        this.logger.info(
          `티켓 기반 대상 프로젝트 결정: ${targetProjects.join(', ')}`
        );
      }

      // 기본값: 전체 프로젝트
      if (!targetProjects) {
        targetProjects = ['KQ', 'HDD', 'HB', 'AUTOWAY'];
      }

      // 2. 스프린트 캐시 프리로드 (병렬)
      const igniteProjects = targetProjects.filter(
        (p) => p !== 'AUTOWAY'
      ) as Array<'KQ' | 'HDD' | 'HB'>;
      if (igniteProjects.length > 0) {
        this.logger.info('스프린트 정보 프리로드 중...');
        await preloadSprintCache(igniteProjects);
        this.logger.success('스프린트 정보 프리로드 완료');
      }

      // 3. FEHG 티켓 조회
      const fehgTickets = await this.fetchFehgTickets(options);

      if (fehgTickets.length === 0) {
        this.logger.warning('동기화 대상 티켓이 없습니다');
        return this.createSummary(allResults, startTime);
      }

      this.logger.success(
        `${fehgTickets.length}개의 FEHG 티켓 발견 - 동기화 시작`
      );

      // 4. 티켓별 대상 프로젝트 결정 (1회 순회)
      this.logger.info('티켓별 동기화 대상 분석 중...');
      const ticketsByProject = await this.classifyTicketsByTargetProject(
        fehgTickets,
        targetProjects
      );

      // 5. 프로젝트별 동기화 실행
      for (const targetProject of targetProjects) {
        const projectTickets = ticketsByProject.get(targetProject) || [];
        if (projectTickets.length === 0) {
          this.logger.info(`${targetProject}: 동기화 대상 티켓 없음 - 스킵`);
          continue;
        }

        const results = await this.syncToProject(
          projectTickets,
          targetProject,
          options.assigneeAccountId || '',
          options.chunkSize || 15
        );
        allResults.push(...results);
      }

      return this.createSummary(allResults, startTime);
    } catch (error) {
      this.logger.error(
        `동기화 중 치명적 오류: ${error instanceof Error ? error.message : String(error)}`
      );
      return this.createSummary(allResults, startTime);
    }
  }

  /**
   * FEHG 티켓 조회
   */
  private async fetchFehgTickets(options: SyncOptions): Promise<JiraIssue[]> {
    // 에픽 단위 동기화 모드 (담당자 무관)
    if (options.epicId && options.syncAllInEpic) {
      this.logger.info(
        `FEHG-${options.epicId} 에픽 하위 전체 티켓 조회 중 (담당자 무관)...`
      );
      const jql = `"Epic Link" = FEHG-${options.epicId} ORDER BY updated DESC`;
      const result = await jira.ignite.searchAllIssues(jql);
      if (result.success && result.data) {
        this.logger.info(`에픽 하위 전체 티켓: ${result.data.issues.length}개`);
        return result.data.issues;
      }
      return [];
    }

    // 에픽 지정 모드 (특정 담당자)
    if (options.epicId) {
      this.logger.info(`FEHG-${options.epicId} 에픽 하위 티켓 조회 중...`);
      const jql = `"Epic Link" = FEHG-${options.epicId} AND assignee = "${options.assigneeAccountId}" ORDER BY updated DESC`;
      const result = await jira.ignite.searchAllIssues(jql);
      if (result.success && result.data) {
        this.logger.info(
          `에픽 하위 티켓: ${result.data.issues.length}개 (전체: ${result.data.total}개)`
        );
        return result.data.issues;
      }
      return [];
    }

    // 티켓 지정 모드
    if (options.ticketId) {
      this.logger.info(`FEHG-${options.ticketId} 티켓 조회 중...`);
      const result = await jira.ignite.getIssue(`FEHG-${options.ticketId}`);
      return result.success && result.data ? [result.data] : [];
    }

    // 일반 모드: 담당자의 모든 티켓 (완료 포함, 페이지네이션 자동 처리)
    this.logger.info('담당자의 모든 티켓 조회 중...');
    const user = Object.values(JIRA_USERS).find(
      (u) => u.igniteAccountId === options.assigneeAccountId
    );
    const jql = `project = FEHG AND assignee = "${options.assigneeAccountId}" ORDER BY updated DESC`;

    this.logger.info(`담당자: ${user?.name || '알 수 없음'}`);

    const result = await jira.ignite.searchAllIssues(jql);
    if (result.success && result.data) {
      this.logger.info(
        `티켓 조회 완료: ${result.data.issues.length}개 (Jira 전체: ${result.data.total}개)`
      );
      return result.data.issues;
    }
    return [];
  }

  /**
   * 티켓별 대상 프로젝트 분류 (1회 순회로 효율화)
   */
  private async classifyTicketsByTargetProject(
    fehgTickets: JiraIssue[],
    targetProjects: Array<'KQ' | 'HDD' | 'HB' | 'AUTOWAY'>
  ): Promise<Map<'KQ' | 'HDD' | 'HB' | 'AUTOWAY', JiraIssue[]>> {
    const classification = new Map<
      'KQ' | 'HDD' | 'HB' | 'AUTOWAY',
      JiraIssue[]
    >();

    // 초기화
    targetProjects.forEach((project) => classification.set(project, []));

    // 1회 순회로 각 티켓의 대상 프로젝트 결정
    for (const ticket of fehgTickets) {
      const targets: Array<'KQ' | 'HDD' | 'HB' | 'AUTOWAY'> = [];

      // 1. 연결된 티켓 확인 (issuelinks - KQ/HB/HDD)
      if (ticket.fields.issuelinks) {
        for (const link of ticket.fields.issuelinks) {
          if (link.type.name === 'Blocks' && link.outwardIssue) {
            const key = link.outwardIssue.key;
            if (key.startsWith('KQ-') && targetProjects.includes('KQ')) {
              targets.push('KQ');
            } else if (key.startsWith('HB-') && targetProjects.includes('HB')) {
              targets.push('HB');
            } else if (
              key.startsWith('HDD-') &&
              targetProjects.includes('HDD')
            ) {
              targets.push('HDD');
            }
          }
        }
      }

      // 2. AUTOWAY 확인 (customfield_10306 또는 허용된 에픽)
      if (targetProjects.includes('AUTOWAY')) {
        const hmgLink = ticket.fields['customfield_10306'] as
          | string
          | undefined;
        const hasAutowayLink = hmgLink && /AUTOWAY-\d+/.test(hmgLink);

        const parentKey = ticket.fields.parent?.key;
        const match = parentKey?.match(/FEHG-(\d+)/);
        const epicNumber = match ? parseInt(match[1], 10) : null;

        // Confluence에서 허용된 에픽 목록 조회
        let isAllowedEpic = false;
        if (epicNumber) {
          const allowedEpicsResult =
            await ConfluenceEpicClient.getAllowedEpics();
          if (allowedEpicsResult.success && allowedEpicsResult.data) {
            isAllowedEpic = allowedEpicsResult.data.some(
              (epic) => epic.id === epicNumber
            );
          } else {
            // Confluence 조회 실패 시 경고 로그
            this.logger.warning(
              `AUTOWAY 에픽 목록 조회 실패: ${allowedEpicsResult.error || '알 수 없는 오류'} - Confluence를 확인하세요: https://ignitecorp.atlassian.net/wiki/spaces/IF/pages/2018738177`
            );
          }
        }

        if (hasAutowayLink || isAllowedEpic) {
          targets.push('AUTOWAY');
        }
      }

      // 3. 각 대상 프로젝트에 티켓 추가
      targets.forEach((target) => {
        classification.get(target)?.push(ticket);
      });
    }

    // 분류 결과 로그
    targetProjects.forEach((project) => {
      const count = classification.get(project)?.length || 0;
      if (count > 0) {
        this.logger.info(`${project}: ${count}개 티켓 동기화 대상`);
      }
    });

    return classification;
  }

  /**
   * 특정 프로젝트로 동기화 (청킹 적용)
   * 이미 분류된 티켓만 받음 - 필터링 불필요
   */
  private async syncToProject(
    fehgTickets: JiraIssue[],
    targetProject: 'KQ' | 'HDD' | 'HB' | 'AUTOWAY',
    assigneeAccountId: string,
    chunkSize: number
  ): Promise<SyncResult[]> {
    this.logger.info(`━━━ ${targetProject} 동기화 시작 ━━━`);

    const allResults: SyncResult[] = [];
    const chunks = chunkArray(fehgTickets, chunkSize);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      this.logger.info(
        `${targetProject}: ${i + 1}/${chunks.length} 청크 처리 중 (${chunk.length}개 티켓)`
      );

      // 청크 단위 병렬 처리
      const chunkResults = await Promise.allSettled(
        chunk.map((ticket) =>
          targetProject === 'AUTOWAY'
            ? this.hmgSyncService.syncTicket(ticket, assigneeAccountId)
            : this.igniteSyncService.syncTicket(ticket, targetProject)
        )
      );

      // 결과 수집
      for (const result of chunkResults) {
        if (result.status === 'fulfilled' && result.value) {
          if (Array.isArray(result.value)) {
            allResults.push(...result.value);
          } else {
            allResults.push(result.value);
          }
        }
      }
    }

    const successCount = allResults.filter((r) => r.success).length;
    const failCount = allResults.filter((r) => !r.success).length;

    this.logger.success(
      `${targetProject}: 완료 (성공: ${successCount}, 실패: ${failCount})`
    );

    return allResults;
  }

  /**
   * 동기화 결과 요약 생성
   */
  private createSummary(results: SyncResult[], startTime: number): SyncSummary {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const successResults = results.filter((r) => r.success);
    const failedResults = results.filter((r) => !r.success);
    const createdResults = successResults.filter((r) => r.isNewlyCreated);
    const updatedResults = successResults.filter((r) => !r.isNewlyCreated);

    this.logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━`);
    this.logger.success(
      `동기화 완료 (${duration}초 소요) - 총 ${results.length}개 처리`
    );
    this.logger.info(`  • 필드 동기화: ${updatedResults.length}개`);
    this.logger.info(`  • 신규 생성: ${createdResults.length}개`);
    this.logger.info(`  • 동기화 실패: ${failedResults.length}개`);

    if (failedResults.length > 0) {
      this.logger.warning(
        `실패한 티켓: ${failedResults.map((r) => `${r.fehgKey}→${r.targetKey || '생성실패'}`).join(', ')}`
      );
    }

    return {
      totalProcessed: results.length,
      totalSuccess: successResults.length,
      totalFailed: failedResults.length,
      totalUpdated: updatedResults.length,
      totalCreated: createdResults.length,
      results,
      failedResults,
    };
  }

  /**
   * 티켓 정보 기반으로 대상 프로젝트 결정
   */
  private async determineTargetProjectsForTicket(
    ticketId: string
  ): Promise<Array<'KQ' | 'HDD' | 'HB' | 'AUTOWAY'>> {
    try {
      // 티켓 조회
      this.logger.info(`FEHG-${ticketId}: 티켓 정보 조회 중...`);
      const ticketResult = await jira.ignite.getIssue(`FEHG-${ticketId}`);

      if (!ticketResult.success || !ticketResult.data) {
        this.logger.error(`FEHG-${ticketId}: 티켓 조회 실패 - 동기화 중단`);
        return [];
      }

      const ticket = ticketResult.data;

      // 1. 연결된 티켓 확인 (issuelinks)
      const linkedProjects: Array<'KQ' | 'HDD' | 'HB'> = [];
      if (ticket.fields.issuelinks) {
        for (const link of ticket.fields.issuelinks) {
          if (link.type.name === 'Blocks' && link.outwardIssue) {
            const outwardKey = link.outwardIssue.key;
            if (outwardKey.startsWith('KQ-')) linkedProjects.push('KQ');
            else if (outwardKey.startsWith('HB-')) linkedProjects.push('HB');
            else if (outwardKey.startsWith('HDD-')) linkedProjects.push('HDD');
          }
        }
      }

      if (linkedProjects.length > 0) {
        this.logger.info(
          `FEHG-${ticketId}: 연결된 티켓 발견 → ${linkedProjects.join(', ')} 동기화`
        );
        return linkedProjects;
      }

      // 2. customfield_10306 확인
      const hmgLink = ticket.fields['customfield_10306'] as string | undefined;
      if (hmgLink && /AUTOWAY-\d+/.test(hmgLink)) {
        this.logger.info(
          `FEHG-${ticketId}: customfield_10306 있음 → AUTOWAY 동기화`
        );
        return ['AUTOWAY'];
      }

      // 3. 상위 에픽 확인 (Confluence에서 허용 목록 조회)
      const parentKey = ticket.fields.parent?.key;
      if (parentKey) {
        const match = parentKey.match(/FEHG-(\d+)/);
        if (match) {
          const epicNumber = parseInt(match[1], 10);

          // Confluence에서 허용된 에픽 목록 조회
          const allowedEpicsResult =
            await ConfluenceEpicClient.getAllowedEpics();

          if (!allowedEpicsResult.success || !allowedEpicsResult.data) {
            this.logger.error(
              `AUTOWAY 에픽 목록 조회 실패: ${allowedEpicsResult.error || '알 수 없는 오류'}`
            );
            this.logger.error(
              '👉 Confluence 페이지 확인: https://ignitecorp.atlassian.net/wiki/spaces/IF/pages/2018738177'
            );
            // 조회 실패 시 해당 티켓은 AUTOWAY 대상에서 제외
          } else {
            const isAllowedEpic = allowedEpicsResult.data.some(
              (epic) => epic.id === epicNumber
            );

            if (isAllowedEpic) {
              this.logger.info(
                `FEHG-${ticketId}: 허용된 에픽(${parentKey}) → AUTOWAY 동기화`
              );
              return ['AUTOWAY'];
            }
          }
        }
      }

      // 4. 어디에도 해당하지 않음
      this.logger.warning(
        `FEHG-${ticketId}: 동기화 대상 아님 (연결 티켓 없음, customfield_10306 없음, 허용되지 않은 에픽)`
      );
      return [];
    } catch (error) {
      this.logger.error(
        `티켓 정보 조회 실패: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  /**
   * 에픽 정보 기반으로 대상 프로젝트 결정
   */
  private async determineTargetProjectsForEpic(
    epicId: string
  ): Promise<Array<'KQ' | 'HDD' | 'HB' | 'AUTOWAY'>> {
    try {
      // 1. 에픽 ID 숫자 추출
      const epicNumber = parseInt(epicId, 10);

      // 2. AUTOWAY 허용 목록 확인 (Confluence에서 조회)
      const allowedEpicsResult = await ConfluenceEpicClient.getAllowedEpics();

      if (!allowedEpicsResult.success || !allowedEpicsResult.data) {
        this.logger.error(
          `AUTOWAY 에픽 목록 조회 실패: ${allowedEpicsResult.error || '알 수 없는 오류'}`
        );
        this.logger.error(
          '👉 Confluence 페이지 확인: https://ignitecorp.atlassian.net/wiki/spaces/IF/pages/2018738177'
        );
        this.logger.warning(
          `FEHG-${epicId}: AUTOWAY 대상 여부 확인 불가 - 기본 프로젝트(KQ, HB, HDD)로 동기화`
        );
        // Confluence 조회 실패 시 AUTOWAY 제외하고 기본 프로젝트로 진행
      } else {
        const isAllowedEpic = allowedEpicsResult.data.some(
          (epic) => epic.id === epicNumber
        );

        if (isAllowedEpic) {
          this.logger.info(
            `FEHG-${epicId}: AUTOWAY 허용 에픽 → AUTOWAY만 동기화`
          );
          return ['AUTOWAY'];
        }
      }

      // 3. 에픽 정보 조회하여 summary 확인
      this.logger.info(`FEHG-${epicId}: 에픽 정보 조회 중...`);
      const epicResult = await jira.ignite.getIssue(`FEHG-${epicId}`);

      if (!epicResult.success || !epicResult.data) {
        this.logger.warning(
          `FEHG-${epicId}: 에픽 조회 실패 - 기본 프로젝트(KQ, HB, HDD)로 동기화`
        );
        return ['KQ', 'HB', 'HDD'];
      }

      const epicSummary = epicResult.data.fields.summary;
      this.logger.info(`FEHG-${epicId}: "${epicSummary}"`);

      // 4. Summary에서 프로젝트 prefix 확인
      if (epicSummary.includes('[KQ]')) {
        this.logger.info('에픽 summary에 [KQ] 발견 → KQ만 동기화');
        return ['KQ'];
      }
      if (epicSummary.includes('[HB]')) {
        this.logger.info('에픽 summary에 [HB] 발견 → HB만 동기화');
        return ['HB'];
      }
      if (epicSummary.includes('[HDD]')) {
        this.logger.info('에픽 summary에 [HDD] 발견 → HDD만 동기화');
        return ['HDD'];
      }

      // 5. prefix 없으면 모든 Ignite 프로젝트로 동기화
      this.logger.info(
        '에픽 summary에 프로젝트 prefix 없음 → KQ, HB, HDD 전체 동기화'
      );
      return ['KQ', 'HB', 'HDD'];
    } catch (error) {
      this.logger.error(
        `에픽 정보 조회 실패: ${error instanceof Error ? error.message : String(error)} - 기본 프로젝트로 동기화`
      );
      return ['KQ', 'HB', 'HDD'];
    }
  }

  /**
   * 로그 가져오기
   */
  getLogs(): SyncLog[] {
    return this.logger.getLogs();
  }
}
