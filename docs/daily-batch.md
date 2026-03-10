# Daily 배치

## 개요
- 전체 담당자(8명) 대상으로 전체 프로젝트(KQ, HDD, HB, AUTOWAY) 티켓 동기화
- 매일 한국시간 오전 9시 자동 실행 (GitHub Actions cron)
- 수동 실행도 가능 (workflow_dispatch)

## 동작 방식
1. 담당자 8명을 순차 순회
2. 각 담당자의 FEHG 티켓을 조회 (`due >= 2026-01-01`)
3. 연결된 KQ/HDD/HB 티켓 필드 동기화 + AUTOWAY 생성/업데이트
4. 상태(status) 동기화 포함

## 기술 구현
- `scripts/daily-sync.ts` — 배치 스크립트
- `.github/workflows/daily-sync.yml` — GitHub Actions 워크플로우
- `BATCH_MODE=true` 환경변수로 JiraClient가 Jira API 직접 호출 모드 전환

## GitHub Actions 설정

### 필요한 Secrets (Repository Settings → Secrets)
| Secret 이름 | 설명 |
|---|---|
| `IGNITE_JIRA_EMAIL` | Ignite Jira 계정 이메일 |
| `IGNITE_JIRA_API_TOKEN` | Ignite Jira API 토큰 |
| `HMG_JIRA_EMAIL` | HMG Jira 계정 이메일 |
| `HMG_JIRA_API_TOKEN` | HMG Jira API 토큰 |

### 수동 실행
GitHub → Actions → Daily Jira Sync → Run workflow

### 로컬 테스트
```bash
BATCH_MODE=true \
IGNITE_JIRA_EMAIL=xxx \
IGNITE_JIRA_API_TOKEN=xxx \
HMG_JIRA_EMAIL=xxx \
HMG_JIRA_API_TOKEN=xxx \
npx tsx scripts/daily-sync.ts
```

## 참고사항
- AUTOWAY 동기화는 Confluence 에픽 허용 목록에 의존
- HDD 프로젝트는 상태 동기화 제외 (권한 제한)
- 실행 시간: 약 5~15분 (담당자별 티켓 수에 따라 변동)
