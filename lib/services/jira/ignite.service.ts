import { BaseJiraService } from './base.service';

/**
 * Ignite Jira Service
 * 이그나이트 Jira 전용 메서드를 제공합니다.
 */
export class IgniteJiraService extends BaseJiraService {
  constructor() {
    super('ignite');
  }

  /**
   * FEHG 프로젝트 이슈 조회
   * (작업자들이 직접 관리하는 프로젝트)
   */
  async getFEHGIssues() {
    return this.getProjectIssues('FEHG');
  }

  /**
   * FEHG 프로젝트의 완료되지 않은 에픽 조회
   */
  async getFEHGIncompleteEpics() {
    const jql = `project = FEHG AND issuetype = 에픽 AND status != Done AND status != 완료 ORDER BY created DESC`;
    return this.searchIssues(jql);
  }

  /**
   * FEHG를 제외한 모든 프로젝트 조회
   */
  async getNonFEHGProjects() {
    const result = await this.getProjects();
    if (result.success && result.data) {
      return {
        success: true,
        data: result.data.filter((project) => project.key !== 'FEHG'),
      };
    }
    return result;
  }

  /**
   * 특정 프로젝트의 완료되지 않은 이슈 조회
   */
  async getProjectIncompleteIssues(projectKey: string) {
    return this.getIncompleteIssues(projectKey);
  }

  /**
   * 이슈 필드 업데이트
   */
  async updateIssueFields(issueKey: string, fields: Record<string, unknown>) {
    return this.client.put(`issue/${issueKey}`, { fields });
  }

  // 추가적인 이그나이트 전용 메서드들을 여기에 정의할 수 있습니다.
}
