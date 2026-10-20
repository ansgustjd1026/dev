import { randomInt } from "node:crypto";
import type { VideoVisualStyle } from "@/lib/visuals/styles";

const SETTINGS = [
  { category: "취미와 모임", relationships: ["동호회 운영자와 회원", "함께 취미를 배우는 친구"], places: ["취미 수업", "모임 단체 채팅방"] },
  { category: "이웃과 공동생활", relationships: ["옆집 이웃", "공동시설 이용자"], places: ["아파트 공용 공간", "동네 주민 모임"] },
  { category: "일과 협업", relationships: ["함께 일하는 동료", "새로 온 사람과 기존 구성원"], places: ["공동 작업 공간", "업무 회의"] },
  { category: "소비와 서비스", relationships: ["손님과 매장 직원", "서비스 예약자와 담당자"], places: ["동네 가게", "예약 상담 창구"] },
  { category: "우정과 약속", relationships: ["오랜 친구", "새로 친해진 지인"], places: ["약속 장소", "친구 단체 채팅방"] },
  { category: "배움과 도전", relationships: ["수강생과 강사", "함께 공부하는 동료"], places: ["배움터", "공동 과제 모임"] },
  { category: "여가와 외출", relationships: ["함께 외출한 친구", "시설 이용자와 운영자"], places: ["공원", "공연장"] },
  { category: "디지털 생활", relationships: ["온라인 모임 회원", "사진을 공유한 지인"], places: ["온라인 커뮤니티", "영상 통화"] },
  { category: "가족의 일상", relationships: ["부모와 성인 자녀", "형제자매"], places: ["가족 식사 자리", "집안일을 나누는 자리"] },
  { category: "지역과 봉사", relationships: ["봉사 모임 구성원", "행사 담당자와 참여자"], places: ["동네 행사", "봉사 활동 현장"] },
] as const;

const YOUTH_SETTINGS = [
  { category: "학교와 팀 활동", relationships: ["조별 과제 동료", "동아리 운영자와 회원"], places: ["과제 회의", "동아리 활동 공간"] },
  { category: "진로와 첫 일자리", relationships: ["아르바이트 동료", "신입 구성원과 선배"], places: ["근무 교대 시간", "진로 준비 모임"] },
] as const;

const CONFLICTS = [
  "약속한 시간을 일방적으로 바꾸는 행동",
  "다른 사람의 공로를 자기 것으로 내세우는 행동",
  "허락 없이 사진이나 개인 이야기를 공유하는 행동",
  "공동 규칙을 자신에게만 예외로 적용하는 행동",
  "호의를 당연한 의무로 여기는 행동",
  "확인하지 않은 말로 상대를 오해하는 상황",
  "취향이나 생활 방식을 무시하는 행동",
  "책임이나 번거로운 일을 남에게 미루는 행동",
  "공유 물건이나 공간을 독점하는 행동",
  "공동 비용의 분담 기준을 일방적으로 정하는 행동",
] as const;

function pick<T>(items: readonly T[]): T {
  return items[randomInt(items.length)];
}

export function createTopicSeed(visualStyle: VideoVisualStyle) {
  const settings = visualStyle === "webtoon"
    ? [...SETTINGS, ...YOUTH_SETTINGS]
    : SETTINGS;
  const setting = pick(settings);
  return {
    category: setting.category,
    relationship: pick(setting.relationships),
    place: pick(setting.places),
    conflict: pick(CONFLICTS),
  };
}
