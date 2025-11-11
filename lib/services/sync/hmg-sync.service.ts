// HMG Jira 프로젝트 동기화 (FEHG → AUTOWAY)

import { JiraIssue, JiraIssueCreatePayload } from '@/lib/types/jira';
import { SyncResult } from './types';
import { SyncLogger } from './logger';
import {
  mapFieldsForAutoway,
  extractAutowayKey,
  isValidAutowayLink,
  mapStatusTransition,
} from './field-mapper';
import { jira } from '@/lib/services/jira';
import { IGNITE_CUSTOM_FIELDS, JIRA_ENDPOINTS } from '@/lib/constants/jira';

/**
 * HMG 프로젝트 동기화 서비스
 * FEHG → AUTOWAY 동기화 담당
 */
export class HMGSyncService {
  constructor(private logger: SyncLogger) {}

  /**
   * FEHG 티켓을 AUTOWAY로 동기화
   */
  async syncTicket(
    fehgTicket: JiraIssue,
    assigneeAccountId: string
  ): Promise<SyncResult | null> {
    try {
      const customFields = fehgTicket.fields;
      const rawLink = customFields[IGNITE_CUSTOM_FIELDS.HMG_JIRA_LINK];
      const hmgLinkField =
        typeof rawLink === 'string'
          ? rawLink.trim()
          : Array.isArray(rawLink)
            ? rawLink[0]
              ? String(rawLink[0]).trim()
              : ''
            : rawLink && typeof rawLink === 'object' && 'value' in rawLink
              ? String((rawLink as { value?: unknown }).value ?? '').trim()
              : '';

      if (hmgLinkField) {
        this.logger.info(
          `${fehgTicket.key}: customfield_10306 감지됨 → ${hmgLinkField}`
        );
      } else {
        this.logger.info(
          `${fehgTicket.key}: customfield_10306 비어 있음 → 신규 생성`
        );
      }

      // customfield_10306 확인 및 분기
      // 참고: 구 HMG URL은 사전 마이그레이션으로 모두 신 URL로 변환됨
      if (!hmgLinkField || !isValidAutowayLink(hmgLinkField)) {
        // 신규 생성 플로우: customfield_10306이 비어있거나 AUTOWAY 키가 없음
        return await this.createAndLinkAutowayTicket(
          fehgTicket,
          assigneeAccountId
        );
      }

      // 기존 티켓 업데이트 플로우: customfield_10306에서 AUTOWAY 키 추출
      const autowayKey = extractAutowayKey(hmgLinkField);
      if (!autowayKey) {
        this.logger.warning(
          `${fehgTicket.key}: AUTOWAY 키 추출 실패 (${hmgLinkField}) - 신규 생성`
        );
        return await this.createAndLinkAutowayTicket(
          fehgTicket,
          assigneeAccountId
        );
      }

      return await this.updateAutowayTicket(
        fehgTicket,
        autowayKey,
        assigneeAccountId
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `${fehgTicket.key}: AUTOWAY 동기화 실패 - ${errorMessage}`
      );
      return null;
    }
  }

  /**
   * AUTOWAY 티켓 신규 생성 및 FEHG에 링크
   */
  private async createAndLinkAutowayTicket(
    fehgTicket: JiraIssue,
    assigneeAccountId: string
  ): Promise<SyncResult> {
    try {
      this.logger.info(`${fehgTicket.key}: AUTOWAY 티켓 생성 시작...`);

      // 1. 필드 매핑
      const mappedFields = mapFieldsForAutoway(fehgTicket, assigneeAccountId);

      // 2. AUTOWAY 티켓 생성
      const createPayload: JiraIssueCreatePayload = {
        fields: {
          project: { key: 'AUTOWAY' },
          issuetype: { name: '작업' },
          summary: fehgTicket.fields.summary,
          // 추후 적용: customfield_10002: autowayEpicKey (Epic Link)
          ...mappedFields,
        },
      };

      const createResult = await jira.hmg.createIssue(createPayload);

      if (!createResult.success || !createResult.data) {
        // Jira API 에러 상세 로그
        const errorDetails = (
          createResult as { details?: unknown; error?: string }
        ).details;
        if (errorDetails) {
          this.logger.error(
            `${fehgTicket.key}: Jira API 에러 상세 → ${JSON.stringify(errorDetails)}`
          );
        }
        throw new Error(createResult.error || 'AUTOWAY 티켓 생성 실패');
      }

      const autowayKey = createResult.data.key;
      this.logger.success(`${autowayKey}: AUTOWAY 티켓 생성 완료`);

      // 3. FEHG 티켓의 customfield_10306에 URL 저장
      const autowayUrl = `${JIRA_ENDPOINTS.HMG}/browse/${autowayKey}`;
      const linkResult = await jira.ignite.updateIssueFields(fehgTicket.key, {
        [IGNITE_CUSTOM_FIELDS.HMG_JIRA_LINK]: autowayUrl,
      });

      if (!linkResult.success) {
        this.logger.warning(
          `${fehgTicket.key}: AUTOWAY 링크 저장 실패 (티켓은 생성됨)`
        );
      } else {
        this.logger.success(`${fehgTicket.key}: AUTOWAY 링크 저장 완료`);
      }

      // 4. 생성된 AUTOWAY 티켓 업데이트 (상태 동기화)
      await this.syncAutowayStatus(fehgTicket, autowayKey);

      return {
        fehgKey: fehgTicket.key,
        targetKey: autowayKey,
        targetProject: 'AUTOWAY',
        success: true,
        message: '신규 생성 및 동기화 완료',
        isNewlyCreated: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `${fehgTicket.key}: AUTOWAY 생성 실패 - ${errorMessage}`
      );

      return {
        fehgKey: fehgTicket.key,
        targetKey: '',
        targetProject: 'AUTOWAY',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 기존 AUTOWAY 티켓 업데이트
   */
  private async updateAutowayTicket(
    fehgTicket: JiraIssue,
    autowayKey: string,
    assigneeAccountId: string
  ): Promise<SyncResult> {
    try {
      this.logger.info(`${autowayKey}: 업데이트 시작...`);

      // 1. 필드 매핑
      const mappedFields = mapFieldsForAutoway(fehgTicket, assigneeAccountId);

      // 2. 필드 매핑 로그
      this.logger.info(
        `${autowayKey}: 업데이트 필드 → ${JSON.stringify(Object.keys(mappedFields))}`
      );

      // 3. 필드 업데이트
      const updateResult = await jira.hmg.updateIssue(autowayKey, {
        fields: mappedFields,
      });

      if (!updateResult.success) {
        // Jira API 에러 상세 로그
        const errorDetails = (
          updateResult as { details?: unknown; error?: string }
        ).details;
        if (errorDetails) {
          this.logger.error(
            `${autowayKey}: Jira API 에러 상세 → ${JSON.stringify(errorDetails)}`
          );
        }
        throw new Error(updateResult.error || '필드 업데이트 실패');
      }

      this.logger.success(`${autowayKey}: 필드 업데이트 완료`);

      // 3. 상태 동기화
      await this.syncAutowayStatus(fehgTicket, autowayKey);

      return {
        fehgKey: fehgTicket.key,
        targetKey: autowayKey,
        targetProject: 'AUTOWAY',
        success: true,
        message: '동기화 완료',
        isNewlyCreated: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`${autowayKey}: 업데이트 실패 - ${errorMessage}`);

      return {
        fehgKey: fehgTicket.key,
        targetKey: autowayKey,
        targetProject: 'AUTOWAY',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * AUTOWAY 티켓 상태 동기화
   */
  private async syncAutowayStatus(
    fehgTicket: JiraIssue,
    autowayKey: string
  ): Promise<void> {
    const fehgStatusId = fehgTicket.fields.status?.id;
    if (!fehgStatusId) return;

    const transitionId = mapStatusTransition(fehgStatusId, 'AUTOWAY');
    if (!transitionId) return;

    try {
      await jira.hmg.updateIssueStatus(autowayKey, transitionId);
      this.logger.success(`${autowayKey}: 상태 동기화 완료`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warning(
        `${autowayKey}: 상태 동기화 실패 (필드는 업데이트됨) - ${errorMessage}`
      );
    }
  }
}
