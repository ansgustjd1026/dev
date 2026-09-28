# Shate Apps in Toss

Before submitting a version, follow [LAUNCH_READINESS.md](./LAUNCH_READINESS.md). Toss Login and Apps in Toss in-app purchase are implemented, but require the Console values, mTLS credentials, Supabase SQL, and live-device validation listed there.

Shate의 Apps in Toss WebView 앱입니다. 토스 로그인, 프로젝트 조회, 자동 영상 제작, 크레딧 확인, 제작 설정, YouTube 연결·게시, 알림, 인앱 구독 결제가 번들 안에서 동작합니다. 데이터와 영상 처리 인프라는 기존 Render 및 Supabase를 공유합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

기본 주소는 `http://localhost:5173`입니다. 개발 모드에서는 자동으로 `http://localhost:3000`의 Shate API를 사용합니다. 다른 Shate 서버를 열려면 `.env.local`에 아래 값을 설정합니다.

```env
VITE_SHATE_WEB_URL=https://shate-37cj.onrender.com
```

## 토스 번들 생성

```bash
npm run ait:build
```

생성된 `shate.ait` 파일을 Apps in Toss 콘솔의 앱 버전에 업로드합니다.

## 로컬 화면 확인

토스 런타임 없이 디자인을 확인할 때만 아래 개발 전용 주소를 사용합니다.

- `?preview=dashboard`
- `?preview=create`
- `?preview=progress`
- `?preview=credits`
- `?preview=settings`

실제 로그인, 결제, 자동 제작 검증은 Apps in Toss 샌드박스 또는 실제 토스 앱에서 진행해야 합니다.

## 콘솔 값

- appName: `shate`
- 표시 이름: `Shate`
- 카테고리: `생활 > 콘텐츠 > 영상`
- 앱 유형: 비게임
- 앱 아이콘: `../public/shate-toss-icon-light.png`
- 다크 모드 아이콘: `../public/shate-toss-icon-dark.png`

Apps in Toss 콘솔에서 만든 appName이 `shate`와 다르면 `apps-in-toss.config.ts`의 `appName`을 콘솔 값과 정확히 맞춰야 합니다.
