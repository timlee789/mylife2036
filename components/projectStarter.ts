import type { NewPhase, ProjectFields } from './api';

// Tim's four projects as the vault project homes described them on 2026-11-20, with example
// phases to show how the timeline works. Offered once on an empty site; everything is editable.
export interface StarterProject extends ProjectFields {
  phases: NewPhase[];
  milestones: { title: string; target_on: string }[];
}

export const STARTER: StarterProject[] = [
  {
    title: '규영, 책에게 묻다',
    kind: 'youtube',
    summary: '책 한 권 + 규영의 질문 + 책에서 찾은 대답. 5~10분 글씨 영상',
    purpose: '',
    current_focus: 'EP001 업로드 완료(11/18), 채널 이름 변경 반영.',
    next_action: 'EP002 책·장·질문 고르기',
    vault_note: '10_Projects/1_규영의_인문학_여행/00_홈',
    phases: [
      { title: '채널 준비와 EP001', start_month: '2026-11', end_month: '2026-11', status: 'done' },
      { title: '정기 제작 리듬 만들기 (EP002~)', start_month: '2026-12', end_month: '2027-03', status: 'planned' },
    ],
    milestones: [],
  },
  {
    title: "팀의 인생 2막 · Tim's Second Act",
    kind: 'youtube',
    summary: '62세 Tim의 이야기. 한국어·영어 두 채널',
    purpose: '',
    current_focus: '시니어 일기 7편 한·영 승인(11/13).',
    next_action: '시니어 일기 다음 편: 일기 원문 고르기',
    vault_note: '10_Projects/2_팀의_인생_2막/00_홈',
    phases: [
      { title: '시니어 일기 1~7편 (한·영)', start_month: '2026-11', end_month: '2026-11', status: 'done' },
      { title: '시니어 일기 다음 편들', start_month: '2026-12', end_month: '2027-03', status: 'planned' },
    ],
    milestones: [],
  },
  {
    title: 'The Collegiate Grill SNS·콘텐츠',
    kind: 'store',
    summary: '매장 메뉴판·메뉴 사진·가상매장·영상·SNS 게시물',
    purpose: '',
    current_focus: '메뉴 사진 진행 중. 인사 영상 게시(11/4), 가상매장 버전 40.',
    next_action: '메뉴 사진(버거·핫도그·Classic Trio) 마무리',
    vault_note: '10_Projects/3_Collegiate_World/00_홈',
    phases: [
      { title: '인사 영상·가상매장', start_month: '2026-11', end_month: '2026-11', status: 'done' },
      { title: '메뉴 사진 리뉴얼', start_month: '2026-11', end_month: '2026-12', status: 'active' },
      { title: '매장 TV·인쇄물', start_month: '2027-01', end_month: '2027-03', status: 'planned' },
    ],
    milestones: [],
  },
  {
    title: 'My Life 2036',
    kind: 'life',
    summary: '62세부터 72세까지 탐험하고, 배우고, 창작하고, 기록하는 삶을 돕는 10년 Life Planner',
    purpose: '',
    current_focus: '30일 파일럿 진행 중(11/10~).',
    next_action: '파일럿 입력 시간 측정 계속',
    vault_note: '10_Projects/4_MyLife_2036/00_홈',
    phases: [
      { title: 'P0 앱 만들기·Mac 설치', start_month: '2026-11', end_month: '2026-11', status: 'done' },
      { title: '30일 파일럿', start_month: '2026-11', end_month: '2026-12', status: 'active' },
      { title: '파일럿 평가와 다음 범위 결정', start_month: '2026-12', end_month: '2027-01', status: 'planned' },
    ],
    milestones: [{ title: '30일 파일럿 평가', target_on: '2026-12-10' }],
  },
];
