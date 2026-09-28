import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_VERIFICATION_COOKIE = "shate_admin_verified";
const ADMIN_VERIFICATION_TTL_SECONDS = 15 * 60;

export function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminUsernames() {
  return (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((username) => username.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

export function isAdminUsername(username?: string | null) {
  if (!username) return false;
  return getAdminUsernames().includes(username.toLowerCase());
}

export async function isAdminUser(user: User | null) {
  if (!user) return false;
  if (isAdminEmail(user.email)) return true;

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();

  return isAdminUsername(data?.username);
}

export async function getCurrentAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!(await isAdminUser(user))) {
    return null;
  }

  return user;
}

function getVerificationSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

function signVerificationPayload(payload: string) {
  const secret = getVerificationSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminVerificationToken(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_VERIFICATION_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const signature = signVerificationPayload(payload);
  return signature ? `${payload}.${signature}` : null;
}

export function verifyAdminVerificationToken(token: string | undefined, userId: string) {
  if (!token) return false;

  const [tokenUserId, expiresAtValue, suppliedSignature] = token.split(".");
  const expiresAt = Number(expiresAtValue);
  if (
    tokenUserId !== userId ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000) ||
    !suppliedSignature
  ) {
    return false;
  }

  const expectedSignature = signVerificationPayload(`${tokenUserId}.${expiresAt}`);
  if (!expectedSignature || expectedSignature.length !== suppliedSignature.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(suppliedSignature));
}

export async function isCurrentAdminVerified() {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) return false;

  const cookieStore = await cookies();
  return verifyAdminVerificationToken(
    cookieStore.get(ADMIN_VERIFICATION_COOKIE)?.value,
    adminUser.id
  );
}
