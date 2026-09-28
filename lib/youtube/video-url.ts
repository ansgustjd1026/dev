export function isAllowedYouTubeVideoUrl(value: string, userId: string) {
  try {
    const url = new URL(value);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return false;

    const storageOrigin = new URL(supabaseUrl).origin;
    const expectedPathPrefix = `/storage/v1/object/public/final-videos/${userId}/`;

    return (
      url.protocol === "https:" &&
      url.origin === storageOrigin &&
      url.pathname.startsWith(expectedPathPrefix)
    );
  } catch {
    return false;
  }
}
