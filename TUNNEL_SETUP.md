# 터널링을 통한 원격 배포 가이드

팀원들이 별도 설정 없이 URL로 접속할 수 있도록 터널링 서비스를 사용합니다.

---

## 추천: Cloudflare Tunnel (무료, 안정적) ⭐

### 장점

- ✅ **완전 무료**
- ✅ **팀원 VPN 불필요** (Mac만 VPN 연결하면 됨)
- ✅ **안정적** (ngrok보다 안정적)
- ✅ **Custom 도메인** 가능
- ✅ **영구적인 URL**

### 1. Cloudflare Tunnel 설치

```bash
# Mac에서 실행
brew install cloudflare/cloudflare/cloudflared
```

### 2. Cloudflare 로그인

```bash
cloudflared tunnel login
```

브라우저가 열리면 Cloudflare 계정으로 로그인 (무료 계정 생성 가능)

### 3. 터널 생성

```bash
cloudflared tunnel create fe1-jira
```

터널 ID가 생성됩니다 (예: `abc123-def456-ghi789`)

### 4. 설정 파일 생성

`~/.cloudflared/config.yml` 파일 생성:

```yaml
tunnel: abc123-def456-ghi789
credentials-file: /Users/ssj/.cloudflared/abc123-def456-ghi789.json

ingress:
  - hostname: fe1-jira.your-domain.com
    service: http://localhost:3000
  - service: http_status:404
```

**도메인이 없다면:** Cloudflare에서 제공하는 무료 도메인 사용

```yaml
ingress:
  - hostname: fe1-jira-abc123.trycloudflare.com
    service: http://localhost:3000
  - service: http_status:404
```

### 5. 라우트 설정

```bash
cloudflared tunnel route dns fe1-jira fe1-jira.your-domain.com
```

### 6. 서버 실행

**터미널 1 (Next.js):**

```bash
cd /Users/ssj/Desktop/ignite/fe1-web
npm run build
npm run start
```

**터미널 2 (Cloudflare Tunnel):**

```bash
cloudflared tunnel run fe1-jira
```

### 7. 팀원 접속

```
https://fe1-jira.your-domain.com
또는
https://fe1-jira-abc123.trycloudflare.com
```

### 8. 백그라운드 실행 (Mac 재부팅 시 자동 시작)

```bash
# Cloudflare Tunnel 서비스로 등록
sudo cloudflared service install

# 시작
sudo launchctl start com.cloudflare.cloudflared
```

---

## 대안 1: ngrok (간단하지만 유료 추천)

### 무료 버전 제약

- 세션마다 URL이 바뀜
- 동시 접속 제한

### 유료 버전 ($8/월)

- 고정 URL
- 더 많은 동시 접속

### 설치 및 실행

```bash
# 설치
brew install ngrok

# 계정 연결 (ngrok.com에서 가입)
ngrok config add-authtoken <your-token>

# 실행
npm run build
npm run start

# 터널 시작
ngrok http 3000
```

팀원 접속:

```
https://abc123.ngrok.io
```

---

## 대안 2: Tailscale Funnel (무료, 간단)

### 설치

```bash
brew install tailscale
sudo tailscale up
```

### 실행

```bash
# Next.js 서버
npm run start

# Funnel 활성화
tailscale funnel 3000
```

팀원 접속:

```
https://your-machine.tailnet-abc.ts.net
```

---

## 비교

| 서비스                | 무료       | 안정성 | 고정 URL | 설정 난이도 | 추천도 |
| --------------------- | ---------- | ------ | -------- | ----------- | ------ |
| **Cloudflare Tunnel** | ✅         | ⭐⭐⭐ | ✅       | 중          | ⭐⭐⭐ |
| **Tailscale Funnel**  | ✅         | ⭐⭐⭐ | ✅       | 쉬움        | ⭐⭐⭐ |
| **ngrok (무료)**      | ✅         | ⭐⭐   | ❌       | 쉬움        | ⭐     |
| **ngrok (유료)**      | ❌ ($8/월) | ⭐⭐⭐ | ✅       | 쉬움        | ⭐⭐   |

---

## 최종 추천: Cloudflare Tunnel 🏆

**선택 이유:**

1. ✅ **완전 무료**
2. ✅ **고정 URL** - 팀원들이 북마크 가능
3. ✅ **안정적** - 24/7 운영 가능
4. ✅ **팀원 VPN 불필요** (Mac만 VPN 연결)
5. ✅ **자동 HTTPS**

**동작 방식:**

```
팀원 브라우저
  ↓ (https://fe1-jira.your-domain.com)
Cloudflare CDN
  ↓ (터널)
Mac (VPN 연결됨)
  ↓ (Next.js API Routes)
Ignite/HMG Jira
```

---

## Quick Start (Cloudflare Tunnel)

```bash
# 1. 설치
brew install cloudflare/cloudflare/cloudflared

# 2. 로그인
cloudflared tunnel login

# 3. 터널 생성
cloudflared tunnel create fe1-jira

# 4. 빠른 테스트 (임시 URL)
npm run start
cloudflared tunnel --url http://localhost:3000

# 5. 팀원에게 생성된 URL 공유
```

---

## 주의사항

### Mac 설정

- ✅ Mac이 계속 켜져 있어야 함
- ✅ Mac이 VPN에 연결되어 있어야 함
- ✅ 절전 모드 비활성화 권장

### 보안

- ✅ `.env.local` 파일은 서버에만 존재 (클라이언트 노출 안 됨)
- ✅ API 토큰은 Next.js API Routes에서만 사용
- ✅ HTTPS 자동 적용

### 성능

- 팀원 수가 많지 않으면 Mac 한 대로 충분
- 동시 접속자 10명 이하 권장
