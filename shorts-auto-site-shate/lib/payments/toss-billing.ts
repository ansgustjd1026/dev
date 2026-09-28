import "server-only";

type TossError = { code?: unknown; message?: unknown };

type TossBillingAuthorization = {
  billingKey?: unknown;
  customerKey?: unknown;
};

type TossBillingPayment = {
  orderId?: unknown;
  totalAmount?: unknown;
  status?: unknown;
  paymentKey?: unknown;
};

function getTossSecretKey() {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) throw new Error("TOSS_SECRET_KEY가 설정되지 않았습니다.");
  return secretKey;
}

function getAuthorizationHeader() {
  return `Basic ${Buffer.from(`${getTossSecretKey()}:`).toString("base64")}`;
}

async function tossRequest(path: string, init: RequestInit) {
  const response = await fetch(`https://api.tosspayments.com${path}`, {
    ...init,
    headers: {
      Authorization: getAuthorizationHeader(),
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(65_000),
  });
  const data = (await response.json().catch(() => null)) as TossError | null;
  if (!response.ok) {
    const message =
      typeof data?.message === "string"
        ? data.message
        : "토스페이먼츠 요청에 실패했습니다.";
    throw new Error(message);
  }
  return data;
}

export function getBillingCustomerKey(userId: string) {
  return `shate_${userId}`;
}

export async function issueBillingKey({
  authKey,
  customerKey,
}: {
  authKey: string;
  customerKey: string;
}) {
  const data = (await tossRequest("/v1/billing/authorizations/issue", {
    method: "POST",
    body: JSON.stringify({ authKey, customerKey }),
  })) as TossBillingAuthorization | null;

  if (
    typeof data?.billingKey !== "string" ||
    typeof data.customerKey !== "string" ||
    data.customerKey !== customerKey
  ) {
    throw new Error("빌링키 발급 응답을 확인하지 못했습니다.");
  }

  return data.billingKey;
}

export async function chargeBillingKey({
  billingKey,
  customerKey,
  amount,
  orderId,
  orderName,
  customerEmail,
}: {
  billingKey: string;
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerEmail?: string;
}) {
  const data = (await tossRequest(`/v1/billing/${encodeURIComponent(billingKey)}`, {
    method: "POST",
    headers: { "Idempotency-Key": orderId },
    body: JSON.stringify({
      customerKey,
      amount,
      orderId,
      orderName,
      customerEmail,
    }),
  })) as TossBillingPayment | null;

  if (
    data?.orderId !== orderId ||
    Number(data?.totalAmount) !== amount ||
    data?.status !== "DONE" ||
    typeof data.paymentKey !== "string"
  ) {
    throw new Error("자동결제 승인 응답 검증에 실패했습니다.");
  }

  return { paymentKey: data.paymentKey, providerPayload: data };
}

export async function deleteBillingKey(billingKey: string) {
  await tossRequest(`/v1/billing/${encodeURIComponent(billingKey)}`, {
    method: "DELETE",
  });
}
