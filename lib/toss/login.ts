import "server-only";

import https from "node:https";

const TOSS_API_BASE_URL = "https://apps-in-toss-api.toss.im";

type TossLoginReferrer = "DEFAULT" | "SANDBOX";

type TossApiSuccess<T> = {
  resultType: "SUCCESS";
  success: T;
};

type TossToken = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type TossLoginUser = {
  userKey: number;
};

type TossIapOrder = {
  orderId: string;
  sku: string;
  status: "PURCHASED" | "PAYMENT_COMPLETED" | "FAILED" | "REFUNDED" | "ORDER_IN_PROGRESS" | "NOT_FOUND" | "MINIAPP_MISMATCH" | "ERROR";
};

function readBase64Secret(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`);
  }

  return Buffer.from(value, "base64");
}

function tossRequest<T>(
  path: string,
  options: { method: "GET" | "POST"; body?: Record<string, unknown>; accessToken?: string; tossUserKey?: string },
) {
  const certificate = readBase64Secret("TOSS_MTLS_CERT_BASE64");
  const privateKey = readBase64Secret("TOSS_MTLS_KEY_BASE64");
  const body = options.body ? JSON.stringify(options.body) : undefined;

  return new Promise<T>((resolve, reject) => {
    const request = https.request(
      `${TOSS_API_BASE_URL}${path}`,
      {
        method: options.method,
        cert: certificate,
        key: privateKey,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
          ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
          ...(options.tossUserKey ? { "x-toss-user-key": options.tossUserKey } : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data: unknown = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            reject(new Error("토스 로그인 응답을 해석하지 못했습니다."));
            return;
          }

          if ((response.statusCode ?? 500) >= 400) {
            const reason = typeof (data as { error?: { reason?: unknown } })?.error?.reason === "string"
              ? (data as { error: { reason: string } }).error.reason
              : "토스 로그인 요청이 거부되었습니다.";
            reject(new Error(reason));
            return;
          }

          resolve(data as T);
        });
      },
    );

    request.on("error", () => reject(new Error("토스 로그인 서버에 연결하지 못했습니다.")));
    if (body) request.write(body);
    request.end();
  });
}

export async function getTossLoginUser({
  authorizationCode,
  referrer,
}: {
  authorizationCode: string;
  referrer: TossLoginReferrer;
}) {
  const tokenResponse = await tossRequest<TossApiSuccess<TossToken>>(
    "/api-partner/v1/apps-in-toss/user/oauth2/generate-token",
    { method: "POST", body: { authorizationCode, referrer } },
  );
  const accessToken = tokenResponse.success?.accessToken;
  if (!accessToken) throw new Error("토스 로그인 토큰을 발급하지 못했습니다.");

  const userResponse = await tossRequest<TossApiSuccess<TossLoginUser>>(
    "/api-partner/v1/apps-in-toss/user/oauth2/login-me",
    { method: "GET", accessToken },
  );
  const userKey = userResponse.success?.userKey;
  if (!Number.isSafeInteger(userKey) || userKey <= 0) {
    throw new Error("토스 사용자 정보를 확인하지 못했습니다.");
  }

  return { userKey: String(userKey) };
}

export async function getTossIapOrder({ orderId, userKey }: { orderId: string; userKey: string }) {
  const response = await tossRequest<TossApiSuccess<TossIapOrder>>(
    "/api-partner/v1/apps-in-toss/order/get-order-status",
    { method: "POST", body: { orderId }, tossUserKey: userKey },
  );
  if (!response.success?.orderId || !response.success.sku) {
    throw new Error("토스 인앱결제 주문 정보를 확인하지 못했습니다.");
  }

  return response.success;
}
