# Projects 2036

Tim의 네 프로젝트를 2036년까지 한곳에서 보는 프로젝트 관리 사이트.

- 「규영, 책에게 묻다」 (YouTube)
- 「팀의 인생 2막 · Tim's Second Act」 (YouTube)
- The Collegiate Grill SNS·콘텐츠
- My Life 2036 (10년 Life Planner)

My Life 2036 앱(이 Mac의 로컬 앱)과는 **완전히 분리**되어 있다. 이 사이트에는 매출 자료나 개인 기록을 넣지 않는다.

## 구조: Top 프로젝트 → 프로젝트 → 단계

이 사이트는 **일의 흐름만** 계획하고 관리한다. 원고·사진·대본 같은 자료는 Obsidian에 둔다.

- **Top 프로젝트**: 10년 동안 이어 가는 큰 일 (예: 「규영, 책에게 묻다」). 소개, 2036년의 모습, 지금 상태, 다음 할 일, **진행 절차**(모든 프로젝트가 따르는 단계와 기본 기간), 이정표.
- **프로젝트**: Top 프로젝트 아래 하나의 일 (예: 「죽음의 수용소에서」). 만들 때 진행 절차의 단계가 시작일부터 차례로 일정이 잡혀 들어간다. 절차를 나중에 고쳐도 이미 만든 프로젝트는 바뀌지 않는다.
- **단계**: 할 일 · 진행 중 · 완료 · 건너뜀. 진행률은 건너뛴 단계를 빼고 센다.
- **상태 규칙**: 단계가 있는 프로젝트는 단계에서 상태가 정해진다. 하나라도 시작하면 '진행 중', 모두 끝나면 '마침'. 남은 단계가 있으면 '마침'으로 바꿀 수 없고, 마친 프로젝트는 단계를 다시 열어야 돌아온다. '쉬는 중'은 언제든 고를 수 있고, 쉬는 동안 단계를 모두 끝냈다면 재개할 때 '마침'이 된다. 단계가 없는 프로젝트는 상태를 손으로 고른다.
- **일정**: 목표일(정한 날)과 끝 예정(남은 할 일·진행 중 단계의 마지막 날)을 따로 보여 준다. 단계의 끝 날짜를 옮길 때 뒤의 끝나지 않은 단계도 같이 밀 수 있고, 프로젝트 시작일을 옮길 때 끝나지 않은 단계와 목표일도 같이 옮길 수 있다. 모든 날짜(직접 입력, 절차로 계산, 밀어서 생긴 날짜)는 2026-01-01 ~ 2036-12-31 안이어야 한다.
- **저장**: 화면의 한 동작은 데이터베이스 트랜잭션 하나다(예: 단계와 뒤 단계 밀기는 모두 저장되거나 하나도 저장되지 않음). 같은 프로젝트에 대한 변경은 프로젝트 행을 잠가 차례로 처리한다.

## 화면

- **일의 흐름 (첫 화면)**: Top 프로젝트 카드(진행 중인 프로젝트와 진행률, 지금 단계, 다음 할 일, 이어질 프로젝트, 가까운 이정표), 전체 타임라인(Top 프로젝트마다 한 줄, 프로젝트가 막대; 12개월 / 2026–2036), 다가오는 이정표.
- **Top 프로젝트** (`/?p=<id>`): 소개, 프로젝트 목록(진행 중·예정·쉬는 중·마침), 프로젝트 타임라인, 진행 절차 편집, 이정표.
- **프로젝트** (`/?s=<id>`): 진행률, 지금 단계, 기간·끝 예정, 주 단위 타임라인(단계마다 한 줄), 단계 목록(상태 버튼, 날짜·이름·한 줄 메모 고치기, 순서 바꾸기, 빼기, 추가).
- 점수·연속 기록·빨간 경고는 없다. 끝 예정이 목표일을 넘으면 "옮겨도 됩니다"라고만 알린다. 첫 화면의 '다가오는 이정표'는 오늘 이후만, 지난 이정표는 '날짜 다시 정하기'에 따로 보여 준다.
- 메뉴의 **백업 받기**: 모든 데이터를 JSON 파일로 내려받는다(지운 것, 예전 버전의 단계·작업 항목 포함).

## 코드

| 무엇 | 위치 |
|---|---|
| 화면 | `app/page.tsx` → `components/Projects.tsx`(첫 화면) · `TopProject.tsx` · `SubProject.tsx` · `Timeline.tsx`(주·월·연 Gantt) · `common.tsx` (단어: `projectWords.ts`, 첫 데이터와 절차 초안: `projectStarter.ts`) |
| 규칙 | `lib/projects.ts`: `projects`(Top), `procedure_steps`(진행 절차), `subprojects`(프로젝트), `subproject_steps`(단계), `project_milestones`. `project_phases`·`project_items`·`project_log`는 예전 버전의 테이블로 화면에 쓰지 않고 백업에만 남는다 |
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
