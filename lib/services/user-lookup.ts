/**
 * DB에서 사용자 정보를 조회하는 헬퍼
 * JIRA_USERS 상수를 대체합니다.
 */

import { supabaseServer } from '@/lib/supabase-server';

export interface DbUser {
  name: string;
  igniteAccountId: string;
  hmgAccountId: string;
  hmgUserId: string;
}

/**
 * 특정 팀에 소속된 사용자 목록 조회
 */
export async function getTeamUsers(teamId: string): Promise<DbUser[]> {
  const { data } = await supabaseServer
    .from('users')
    .select('name, ignite_account_id, hmg_account_id, hmg_user_id')
    .eq('team_id', teamId)
    .order('name');

  if (!data) return [];

  return data.map((u) => ({
    name: u.name,
    igniteAccountId: u.ignite_account_id || '',
    hmgAccountId: u.hmg_account_id || '',
    hmgUserId: u.hmg_user_id || '',
  }));
}

/**
 * 전체 사용자 목록 조회 (배치용)
 */
export async function getAllUsers(): Promise<DbUser[]> {
  const { data } = await supabaseServer
    .from('users')
    .select('name, ignite_account_id, hmg_account_id, hmg_user_id')
    .order('name');

  if (!data) return [];

  return data.map((u) => ({
    name: u.name,
    igniteAccountId: u.ignite_account_id || '',
    hmgAccountId: u.hmg_account_id || '',
    hmgUserId: u.hmg_user_id || '',
  }));
}

/**
 * Ignite accountId로 사용자 찾기
 */
export function findUserByIgniteAccountId(
  users: DbUser[],
  accountId: string
): DbUser | undefined {
  return users.find((u) => u.igniteAccountId === accountId);
}

/**
 * 이름으로 사용자 찾기
 */
export function findUserByName(
  users: DbUser[],
  name: string
): DbUser | undefined {
  return users.find((u) => u.name === name);
}
