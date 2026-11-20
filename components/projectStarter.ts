import type { ProcedureStep, ProjectFields } from './api';

// Tim's four top projects as the vault project homes described them on 2026-11-20, each with a
// draft procedure taken from how that work is done now. Offered once on an empty site; all editable.
export interface StarterProject extends ProjectFields {
  procedure: ProcedureStep[];
  milestones: { title: string; target_on: string }[];
}

export const PROCEDURES: Record<string, ProcedureStep[]> = {
  '규영, 책에게 묻다': [
    { title: '책·장·질문 정하기', days: 2 },
    { title: '대본 초안', days: 3 },
    { title: '대본 수정·확정', days: 3 },
    { title: '음성·렌더 (TextVideoKit)', days: 2 },
    { title: '썸네일·제목·설명란', days: 1 },
    { title: 'YouTube 업로드', days: 1 },
    { title: 'Obsidian 기록', days: 1 },
  ],
  "팀의 인생 2막 · Tim's Second Act": [
    { title: '일기 원문 고르기·정리', days: 1 },
    { title: '대본', days: 2 },
    { title: 'Typecast 음성', days: 1 },
    { title: '이미지·립싱크 영상', days: 4 },
    { title: '자막·음량·화질', days: 2 },
    { title: '영어판', days: 3 },
    { title: '업로드 자료·업로드', days: 1 },
    { title: '기록', days: 1 },
  ],
  'The Collegiate Grill SNS·콘텐츠': [
    { title: '기획', days: 2 },
    { title: '촬영·자료 모으기', days: 3 },
    { title: '제작·편집', days: 4 },
    { title: 'Tim 확인', days: 1 },
    { title: '게시', days: 1 },
    { title: '반응 보기', days: 7 },
  ],
  'My Life 2036': [
    { title: '계획', days: 2 },
    { title: '만들기', days: 7 },
    { title: '테스트', days: 2 },
    { title: '설치·적용', days: 1 },
    { title: '써 보고 점검', days: 7 },
  ],
};

export const STARTER: StarterProject[] = [
  {
    title: '규영, 책에게 묻다',
    kind: 'youtube',
    summary: '책 한 권 + 규영의 질문 + 책에서 찾은 대답. 5~10분 글씨 영상',
    purpose: '',
    current_focus: 'EP001 업로드 완료(11/18), 채널 이름 변경 반영.',
    next_action: 'EP002 책·장·질문 고르기',
    vault_note: '10_Projects/1_규영의_인문학_여행/00_홈',
    procedure: PROCEDURES['규영, 책에게 묻다'],
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
    procedure: PROCEDURES["팀의 인생 2막 · Tim's Second Act"],
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
    procedure: PROCEDURES['The Collegiate Grill SNS·콘텐츠'],
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
    procedure: PROCEDURES['My Life 2036'],
    milestones: [{ title: '30일 파일럿 평가', target_on: '2026-12-10' }],
  },
];
