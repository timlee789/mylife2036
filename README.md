# Projects 2036

Tim의 네 프로젝트를 2036년까지 한곳에서 보는 프로젝트 관리 사이트.

- 「규영, 책에게 묻다」 (YouTube)
- 「팀의 인생 2막 · Tim's Second Act」 (YouTube)
- The Collegiate Grill SNS·콘텐츠
- My Life 2036 (10년 Life Planner)

My Life 2036 앱(이 Mac의 로컬 앱)과는 **완전히 분리**되어 있다. 이 사이트에는 매출 자료나 개인 기록을 넣지 않는다.

## 화면

이 사이트는 **일의 흐름만** 계획하고 관리한다. 에피소드·사진·대본·링크 같은 자료는 Obsidian의 각 프로젝트 홈에 둔다.

- **일의 흐름 (첫 화면)**: 프로젝트 카드(지금 단계, 다음 할 일 하나, 이어지는 단계, 가까운 이정표), **흐름 타임라인**, 다가오는 이정표.
- **흐름 타임라인**: 프로젝트마다 한 줄. 단계는 몇 달짜리 막대(진행 중·예정·마침·쉬는 중), 이정표는 ◆(달성 ✓), 세로줄은 오늘. '12개월'(지난달부터 1년, ‹ › 6개월씩)과 '2026–2036'(10년) 보기.
- **프로젝트 하나** (`/?p=<id>`): 소개, 2036년의 모습, 지금 상태, 다음 할 일, 그 프로젝트의 타임라인, 단계(이름·시작 월·끝 월·상태·끝나면 무엇이 되는지), 이정표(달성·날짜 옮기기·내려놓기), Obsidian 프로젝트 홈 링크.
- 점수·연속 기록·빨간 경고는 없다. 지난 이정표는 날짜를 다시 정하거나 내려놓는다.
- 메뉴의 **백업 받기**: 모든 데이터를 JSON 파일로 내려받는다(지운 단계, 첫 버전의 작업 항목 포함).

## 구조

| 무엇 | 위치 |
|---|---|
| 화면 | `app/page.tsx` → `components/Projects.tsx` (타임라인 포함; 단어: `projectWords.ts`, 첫 데이터: `projectStarter.ts`) |
| 규칙 | `lib/projects.ts` (프로젝트, 단계 `project_phases`, 이정표; 모든 검증). `project_items`·`project_log`는 첫 버전의 테이블로, 화면에 쓰지 않고 백업에만 남는다 |
| DB | `lib/db.ts`: `DATABASE_URL`이 있으면 Neon Postgres, 없으면 `./.pglite` 폴더의 로컬 Postgres(PGlite). 스키마 `lib/schema.ts`는 서버 시작 때 자동 적용(모두 `IF NOT EXISTS`) |
| 로그인 | `lib/auth.ts`: 비밀번호 하나(`SITE_PASSWORD`), 30일 서명 쿠키(`SESSION_SECRET`) |
| API | `app/api/…`: 로그인 필수, 쓰기 요청은 `X-PM-Request: 1` 헤더 필수 |
| 테스트 | `tests/projects.test.ts` (메모리 PGlite) |

## 로컬에서 실행

```bash
npm install
cp .env.example .env.local   # SITE_PASSWORD, SESSION_SECRET(openssl rand -hex 32) 채우기
npm run dev                  # http://localhost:3000
npm test
```

## Vercel 배포

1. GitHub 저장소를 Vercel 프로젝트로 가져온다.
2. Vercel → Storage → **Neon** Postgres를 만들어 이 프로젝트에 연결한다(`DATABASE_URL`이 자동으로 들어감).
3. Environment Variables에 `SITE_PASSWORD`, `SESSION_SECRET`를 넣는다(Production).
4. 배포. 첫 요청 때 테이블이 만들어진다.

비밀 값(.env.local, 비밀번호, 키)은 절대 커밋하지 않는다.
