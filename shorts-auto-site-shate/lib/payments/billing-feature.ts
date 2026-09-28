import "server-only";

export function isBillingEnabled() {
  return process.env.BILLING_ENABLED === "true";
}

export function getBillingDisabledMessage() {
  return "베타 테스트 기간에는 관리자만 요금제를 변경할 수 있습니다.";
}
