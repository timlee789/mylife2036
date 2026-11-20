import type { NewItem, ProjectFields } from './api';

// Tim's four projects as the vault project homes described them on 2026-11-20.
// Offered once on an empty home screen; everything can be edited afterwards.
export interface StarterProject extends ProjectFields {
  items: NewItem[];
  milestones: { title: string; target_on: string }[];
}

export const STARTER: StarterProject[] = [
  {
    title: '규영, 책에게 묻다',
    kind: 'youtube',
    summary: '책 한 권 + 규영의 질문 + 책에서 찾은 대답. 5~10분 글씨 영상 (이전 이름: 규영의 인문학 여행)',
    purpose: '',
    current_focus: 'EP001 「끝을 알 수 없는 일시적 삶」 업로드 완료(11/18). 채널 이름 변경 반영.',
    next_action: 'EP002 책·장·질문 고르기',
    vault_note: '10_Projects/1_규영의_인문학_여행/00_홈',
    items: [
      { title: 'EP001 끝을 알 수 없는 일시적 삶 (빅터 프랭클)', series: '에피소드', stage: 'done', done_on: '2026-11-18' },
      { title: 'EP002', series: '에피소드', stage: 'idea', note: '책·장·질문은 Tim이 정한다' },
      { title: 'EP001 Shorts: 끝을 알 수 없어도 오늘의 한 가지는 알 수 있다', series: 'Shorts', stage: 'idea' },
    ],
    milestones: [],
  },
  {
    title: "팀의 인생 2막 · Tim's Second Act",
    kind: 'youtube',
    summary: '62세 3D 애니메이션 캐릭터 Tim의 이야기. 한국어·영어 두 채널',
    purpose: '',
    current_focus: '시니어 일기 7편 한·영 최종 승인(11/13). 「인생, 다시 설치 중」 6편, 「AI 대화 · 존재가치」 완료.',
    next_action: '시니어 일기 다음 편: 일기 원문 고르기',
    vault_note: '10_Projects/2_팀의_인생_2막/00_홈',
    items: [
      { title: '시니어 일기 1~7편 (한·영)', series: '팀의 시니어 일기', stage: 'done', done_on: '2026-11-13' },
      { title: '시니어 일기 8편', series: '팀의 시니어 일기', stage: 'idea', note: '일기 원문을 주면 시작' },
    ],
    milestones: [],
  },
  {
    title: 'The Collegiate Grill SNS·콘텐츠',
    kind: 'store',
    summary: '매장 메뉴판·메뉴 사진·가상매장·영상·SNS 게시물',
    purpose: '',
    current_focus: '메뉴 사진 진행 중, 가상매장 버전 40(11/12), 사장님 인사 영상 게시(11/4).',
    next_action: '메뉴 사진(버거·핫도그·Classic Trio) 마무리',
    vault_note: '10_Projects/3_Collegiate_World/00_홈',
    items: [
      { title: '사장님 인사 영상 (영어 19.5초)', series: '영상', stage: 'done', done_on: '2026-11-04', note: 'YouTube·Facebook 게시' },
      { title: '메뉴 사진: 버거·핫도그·Classic Trio', series: '메뉴 사진', stage: 'make' },
      { title: '가상매장 Room of Light', series: '가상매장', stage: 'make', note: '버전 40 (2026-11-12)' },
      { title: '벽 사진 TV', series: '매장 TV', stage: 'idea' },
      { title: '채용·설문·SNS 인쇄물', series: '인쇄물', stage: 'idea' },
    ],
    milestones: [],
  },
  {
    title: 'My Life 2036',
    kind: 'life',
    summary: '62세부터 72세까지 탐험하고, 배우고, 창작하고, 기록하는 삶을 돕는 10년 Life Planner',
    purpose: '',
    current_focus: '30일 파일럿 진행 중(11/10~). Today·루틴·회고·설정 사용 중.',
    next_action: '파일럿 입력 시간 측정 계속',
    vault_note: '10_Projects/4_MyLife_2036/00_홈',
    items: [
      { title: 'P0 화면 4개 완성·Mac 설치', series: '앱', stage: 'done', done_on: '2026-11-10' },
      { title: '프로젝트 관리 웹사이트', series: '프로젝트 관리', stage: 'make', note: 'MyLife와 분리된 별도 사이트 (2026-11-20)' },
      { title: '30일 파일럿', series: '파일럿', stage: 'make' },
      { title: '새 DB 파일에 복원 테스트', series: '파일럿', stage: 'prep' },
    ],
    milestones: [{ title: '30일 파일럿 평가', target_on: '2026-12-10' }],
  },
];
