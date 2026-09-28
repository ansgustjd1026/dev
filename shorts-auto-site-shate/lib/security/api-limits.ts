import "server-only";

import { NextResponse } from "next/server";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export function enforceRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions) {
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return null;
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000)
    );

    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
        },
      }
    );
  }

  existing.count += 1;
  return null;
}

export async function readJsonBody(
  request: Request,
  maxBytes: number
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > maxBytes) {
    throw new RequestLimitError(
      `요청 크기는 ${formatBytes(maxBytes)} 이하여야 합니다.`,
      413
    );
  }

  if (!request.body) {
    throw new RequestLimitError("요청 본문이 없습니다.", 400);
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    receivedBytes += value.byteLength;

    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new RequestLimitError(
        `요청 크기는 ${formatBytes(maxBytes)} 이하여야 합니다.`,
        413
      );
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();

  try {
    return JSON.parse(text);
  } catch {
    throw new RequestLimitError("올바른 JSON 요청이 아닙니다.", 400);
  }
}

export class RequestLimitError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RequestLimitError";
    this.status = status;
  }
}

export function getRequestLimitResponse(error: unknown) {
  if (!(error instanceof RequestLimitError)) {
    return null;
  }

  return NextResponse.json({ error: error.message }, { status: error.status });
}

export function isStringWithinLimit(
  value: unknown,
  maxLength: number,
  allowEmpty = false
) {
  if (typeof value !== "string") return false;
  if (!allowEmpty && value.trim().length === 0) return false;
  return value.length <= maxLength;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${Math.floor(bytes / 1024 / 1024)}MB`;
  }

  return `${Math.floor(bytes / 1024)}KB`;
}
