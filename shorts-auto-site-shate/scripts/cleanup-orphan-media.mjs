import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const shouldDelete = process.argv.includes("--delete");
const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    })
);

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase server configuration is missing.");
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function listFiles(bucket, prefix = "", depth = 0) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw error;

  const files = [];
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (!item.metadata && depth < 5) {
      files.push(...(await listFiles(bucket, path, depth + 1)));
    } else if (item.metadata) {
      files.push(path);
    }
  }
  return files;
}

async function cleanBucket(bucket, projectColumn) {
  const [files, projectResult] = await Promise.all([
    listFiles(bucket),
    supabase.from("projects").select(projectColumn).not(projectColumn, "is", null),
  ]);
  if (projectResult.error) throw projectResult.error;

  const referenced = new Set(
    (projectResult.data ?? []).map((row) => row[projectColumn]).filter(Boolean)
  );
  const orphaned = files.filter((path) => !referenced.has(path));

  if (shouldDelete && orphaned.length > 0) {
    for (let index = 0; index < orphaned.length; index += 100) {
      const { error } = await supabase.storage
        .from(bucket)
        .remove(orphaned.slice(index, index + 100));
      if (error) throw error;
    }
  }

  return { bucket, files: files.length, orphaned: orphaned.length };
}

const results = await Promise.all([
  cleanBucket("tts-audio", "audio_path"),
  cleanBucket("final-videos", "final_video_path"),
]);

console.table(results);
console.log(shouldDelete ? "Orphaned files deleted." : "Dry run only. Pass --delete to remove them.");
