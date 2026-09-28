import "server-only";

export function getPublicOrigin(request: Request): string {
  // Render's internal Next.js request URL can point to localhost:10000.
  const configured = process.env.APP_BASE_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim();
  const url = new URL(configured || request.url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("APP_BASE_URL must be an HTTP(S) URL without credentials.");
  }
  return url.origin;
}
