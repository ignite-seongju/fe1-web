# FE1 Jira 통합 관리 설정 가이드

## 환경 변수 설정

프로젝트 루트에 `.env.local` 파일을 생성하고 아래 내용을 추가하세요.

### .env.local

```bash
# Ignite Jira 설정
IGNITE_JIRA_EMAIL=your-email@ignitecorp.com
IGNITE_JIRA_API_TOKEN=your_ignite_api_token_here

# HMG Jira 설정
HMG_JIRA_EMAIL=your-email@hyundai-partners.com
HMG_JIRA_API_TOKEN=your_hmg_api_token_here
```

## Jira API Token 발급 방법

### 1. Atlassian 계정 설정 페이지 접속

- https://id.atlassian.com/manage-profile/security/api-tokens

### 2. API Token 생성

1. "Create API token" 버튼 클릭
2. 토큰 이름 입력 (예: "FE1 Web Tool")
3. "Create" 클릭
4. 생성된 토큰을 복사하여 `.env.local`에 붙여넣기

### 3. 각 Jira 인스턴스별로 발급

- **Ignite Jira**: 이그나이트 계정으로 로그인하여 발급
- **HMG Jira**: HMG 계정으로 로그인하여 발급 (VPN 필요)

## 실행 방법

### 1. Node.js 버전 설정

```bash
nvm use
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 개발 서버 실행

```bash
npm run dev
```

### 4. 브라우저에서 접속

```
http://localhost:3000
```

## 주의사항

⚠️ **HMG Jira는 VPN 환경에서만 동작합니다!**

- HMG Jira API를 사용하려면 반드시 VPN에 연결된 상태여야 합니다.
- 로컬 개발 서버(`localhost:3000`)에서 실행해야 합니다.
- Vercel 등 외부 서버에 배포하면 HMG Jira API는 작동하지 않습니다.

## API 사용 예시

```typescript
import { jira } from '@/lib/services/jira';

// Ignite Jira 프로젝트 조회
const projects = await jira.ignite.getProjects();

// HMG Jira 이슈 검색
const issues = await jira.hmg.searchIssues('project = ABC');

// 이슈 상태 변경
await jira.ignite.updateIssueStatus('FEHG-123', 'transition-id');
```

## 문제 해결

### API Token 오류

- `.env.local` 파일이 프로젝트 루트에 있는지 확인
- 개발 서버를 재시작해보세요 (`npm run dev`)
- API Token이 만료되었는지 확인

### HMG Jira 연결 오류

- VPN에 연결되어 있는지 확인
- HMG Jira 이메일과 API Token이 정확한지 확인
- 브라우저 콘솔에서 에러 메시지 확인
