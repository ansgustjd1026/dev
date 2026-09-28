# Shorts Auto Site

AI 대본, TTS 음성, 자막 싱크, 배경 영상 합성을 이용해 쇼츠 초안을 만드는 Next.js App Router 기반 웹앱입니다.

## 문서와 폴더 안내

- 프로젝트 구조: [docs/PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)
- Render 배포: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)
- Apps in Toss 출시 준비: [toss-app/LAUNCH_READINESS.md](./toss-app/LAUNCH_READINESS.md)

## 주요 기능

- 로그인/회원가입/Supabase Auth
- 프로젝트 대시보드
- AI 대본 생성
- 대본 기반 자막 강조 포인트 분석
- 사용자가 수정 가능한 자막 강조 효과
- TTS 음성 생성
- 음성 기반 자막 싱크 분석
- 배경 영상 업로드/선택
- 원본 영상 업로드
- FFmpeg 기반 쇼츠 영상 합성
- Credit 사용량 확인
- 관리자 계정 관리

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 환경변수

루트에 `.env.local` 파일을 만들고 아래 값을 설정합니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENAI_API_KEY=

# 관리자 기능에 필요
ADMIN_EMAILS=admin@example.com
SUPABASE_SERVICE_ROLE_KEY=

# 선택 사항: ffmpeg가 PATH에 없을 때만 지정
# Windows 예시: C:\ffmpeg\bin\ffmpeg.exe
FFMPEG_PATH=
```

주의:

- `.env.local`은 GitHub에 올리면 안 됩니다.
- 현재 `.gitignore`에서 `.env*`를 제외하고 있습니다.

## Supabase 설정

Supabase SQL Editor에서 `supabase/` 폴더의 SQL을 적용합니다.

권장 순서:

1. `credit_usage_events.sql`
2. `credit_usage_rpc.sql`
3. `credit_usage_unify_script_action.sql`
4. `credit_usage_remove_ai_video_action.sql`
5. `add_caption_emphasis_to_projects.sql`
6. `source_videos_and_projects.sql`
7. `admin_user_plans.sql`
8. `user_profiles_username_auth.sql`

Storage bucket은 최소 아래 이름을 사용합니다.

- `background-videos`
- `tts-audio`
- `final-videos`
- `source-videos`

현재 앱은 각 파일 URL과 path를 프로젝트에 저장합니다.

## 관리자 기능

1. Supabase Auth에서 관리자용 계정을 하나 만듭니다.
2. `.env.local` 또는 배포 환경변수에 `ADMIN_EMAILS`를 설정합니다.
   - 여러 명이면 쉼표로 구분합니다.
3. `SUPABASE_SERVICE_ROLE_KEY`를 서버 환경변수로 설정합니다.
   - 이 값은 절대 브라우저/클라이언트에 노출하면 안 됩니다.
4. Supabase SQL Editor에서 `supabase/admin_user_plans.sql`을 실행합니다.

관리자는 `/admin`에서 사용자 계정 삭제와 플랜 변경을 할 수 있습니다.

## FFmpeg

최종 영상 합성은 FFmpeg가 필요합니다.

- 로컬에서 `ffmpeg` 명령이 동작하면 `FFMPEG_PATH`는 비워도 됩니다.
- Windows에서 PATH 설정이 어렵다면 `.env.local`에 직접 지정합니다.

```dotenv
FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
```

## 검증 명령

작업 후 아래 명령을 실행합니다.

```bash
npm run lint
npm run build
```

## Git/GitHub

현재 저장소는 GitHub `main` 브랜치와 연결되어 있습니다.

자주 쓰는 명령:

```bash
git status
git add .
git commit -m "작업 내용"
git push
```

## 배포 전 확인

- 배포 환경에 `NEXT_PUBLIC_SUPABASE_URL` 설정
- 배포 환경에 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정
- 배포 환경에 `OPENAI_API_KEY` 설정
- 배포 환경에서 FFmpeg 사용 가능 여부 확인
- Supabase SQL 적용 여부 확인
- Storage bucket 정책 확인

## 주의할 파일

GitHub에 올리면 안 되는 항목:

- `.env.local`
- `.env`
- `.next/`
- `node_modules/`
- `supabase/.temp/`
- 로그 파일
