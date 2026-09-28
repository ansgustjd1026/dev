import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APP_BUCKETS = [
  "background-videos",
  "tts-audio",
  "final-videos",
  "source-videos",
];

function loadDotEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex < 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function listAllObjectPaths(supabase, bucket, prefix = "") {
  const paths = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: {
        column: "name",
        order: "asc",
      },
    });

    if (error) {
      throw new Error(`${bucket} 목록 조회 실패: ${error.message}`);
    }

    const items = data ?? [];

    for (const item of items) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      const isFolder = item.id === null || !item.metadata;

      if (isFolder) {
        const childPaths = await listAllObjectPaths(supabase, bucket, path);
        paths.push(...childPaths);
      } else {
        paths.push(path);
      }
    }

    if (items.length < limit) break;

    offset += limit;
  }

  return paths;
}

async function removeInChunks(supabase, bucket, paths) {
  const chunkSize = 100;

  for (let index = 0; index < paths.length; index += chunkSize) {
    const chunk = paths.slice(index, index + chunkSize);
    const { error } = await supabase.storage.from(bucket).remove(chunk);

    if (error) {
      throw new Error(`${bucket} 삭제 실패: ${error.message}`);
    }
  }
}

async function main() {
  if (!process.argv.includes("--yes")) {
    console.log(
      "This deletes all files in app storage buckets. Re-run with --yes to confirm."
    );
    process.exit(1);
  }

  loadDotEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  for (const bucket of APP_BUCKETS) {
    const paths = await listAllObjectPaths(supabase, bucket);

    if (paths.length === 0) {
      console.log(`${bucket}: no files`);
      continue;
    }

    await removeInChunks(supabase, bucket, paths);
    console.log(`${bucket}: removed ${paths.length} files`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
