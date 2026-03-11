import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export async function GET() {
  const { data, error } = await supabaseServer
    .from('users')
    .select('*, teams:team_id(id, name, source_project:source_project_id(name))')
    .order('name');

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const users = data.map((u: Record<string, unknown>) => {
    const team = u.teams as { id: string; name: string; source_project: { name: string } | null } | null;
    return {
      id: u.id,
      name: u.name,
      teamId: u.team_id,
      teamName: team?.name ?? null,
      sourceProject: team?.source_project?.name ?? null,
      igniteAccountId: u.ignite_account_id,
      igniteJiraEmail: u.ignite_jira_email,
      igniteJiraApiToken: u.ignite_jira_api_token,
      hmgAccountId: u.hmg_account_id,
      hmgJiraEmail: u.hmg_jira_email,
      hmgJiraApiToken: u.hmg_jira_api_token,
      hmgUserId: u.hmg_user_id,
    };
  });

  return NextResponse.json({ success: true, data: users });
}
