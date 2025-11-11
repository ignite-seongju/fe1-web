import { JiraApiResponse, JiraRequestOptions } from '@/lib/types/jira';

/**
 * Jira API 클라이언트
 * Next.js API Routes를 통해 Jira API를 호출합니다.
 */
export class JiraClient {
  constructor(private instance: 'ignite' | 'hmg') {}

  /**
   * API 요청 메서드
   */
  async request<T>(
    path: string,
    options: JiraRequestOptions & { body?: unknown } = {}
  ): Promise<JiraApiResponse<T>> {
    try {
      const { method = 'GET', body, params } = options;

      // 쿼리 파라미터 구성
      const queryString = params
        ? '?' +
          new URLSearchParams(
            Object.entries(params).reduce(
              (acc, [key, value]) => {
                acc[key] = String(value);
                return acc;
              },
              {} as Record<string, string>
            )
          ).toString()
        : '';

      // Next.js API Route를 통해 프록시 호출
      const url = `/api/jira/${this.instance}/${path}${queryString}`;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '요청 처리 중 오류가 발생했습니다.');
      }

      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      console.error(`Jira ${this.instance} API Error:`, error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : '알 수 없는 오류가 발생했습니다.',
      };
    }
  }

  /**
   * GET 요청
   */
  async get<T>(path: string, params?: Record<string, string | number>) {
    return this.request<T>(path, { method: 'GET', params });
  }

  /**
   * POST 요청
   */
  async post<T, D = Record<string, unknown> | unknown[]>(
    path: string,
    body: D
  ) {
    return this.request<T>(path, { method: 'POST', body });
  }

  /**
   * PUT 요청
   */
  async put<T, D = Record<string, unknown> | unknown[]>(path: string, body: D) {
    return this.request<T>(path, { method: 'PUT', body });
  }

  /**
   * DELETE 요청
   */
  async delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}
