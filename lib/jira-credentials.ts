import { supabaseServer } from '@/lib/supabase-server';

interface JiraCredentials {
  email: string;
  apiToken: string;
}

/**
 * 사용자 ID로 Jira 인증 정보를 조회합니다.
 * DB에 값이 없으면 env 변수를 fallback으로 사용합니다.
 */
export async function resolveJiraCredentials(
  instance: 'ignite' | 'hmg',
  userId: string | null
): Promise<JiraCredentials | null> {
  // 사용자 ID가 있으면 DB에서 조회
  if (userId) {
    const { data } = await supabaseServer
      .from('users')
      .select('ignite_jira_email, ignite_jira_api_token, hmg_jira_email, hmg_jira_api_token')
      .eq('id', userId)
      .single();

    if (data) {
      const email =
        instance === 'ignite' ? data.ignite_jira_email : data.hmg_jira_email;
      const apiToken =
        instance === 'ignite'
          ? data.ignite_jira_api_token
          : data.hmg_jira_api_token;

      if (email && apiToken) {
        return { email, apiToken };
      }
    }
  }

  // Fallback: env 변수
  const email =
    instance === 'ignite'
      ? process.env.IGNITE_JIRA_EMAIL
      : process.env.HMG_JIRA_EMAIL;
  const apiToken =
    instance === 'ignite'
      ? process.env.IGNITE_JIRA_API_TOKEN
      : process.env.HMG_JIRA_API_TOKEN;

  if (email && apiToken) {
    return { email, apiToken };
  }

  return null;
}
