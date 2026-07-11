import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const apiUrl = (process.env.EVEROS_API_URL ?? "https://api.evermind.ai").replace(
  /\/$/,
  "",
);
const apiKey = process.env.EVEROS_API_KEY;
const sourcePath = resolve(process.argv[2] ?? "data/sofia_reyes.json");

if (!apiKey) {
  throw new Error("Set EVEROS_API_KEY before seeding learner history.");
}

async function request(path, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(
      parsed.message ?? `EverOS request failed with status ${response.status}.`,
    );
  }

  return parsed.data ?? parsed;
}

async function sessionAlreadyLoaded(userId, sessionId) {
  const data = await request("/api/v1/memories/get", {
    filters: {
      user_id: userId,
      AND: [{ session_id: sessionId }],
    },
    memory_type: "episodic_memory",
    page: 1,
    page_size: 1,
  });

  return Array.isArray(data.episodes) && data.episodes.length > 0;
}

const pack = JSON.parse(await readFile(sourcePath, "utf8"));
const sessions = Array.isArray(pack.sessions) ? pack.sessions : [];

if (!pack.learner?.user_id || sessions.length === 0) {
  throw new Error("The learner pack must include a learner and sessions.");
}

console.log(
  `Seeding ${pack.learner.display_name ?? pack.learner.user_id} into EverOS...`,
);

let added = 0;
let skipped = 0;

for (const session of sessions) {
  if (await sessionAlreadyLoaded(session.user_id, session.session_id)) {
    console.log(`skip ${session.session_id} (already loaded)`);
    skipped += 1;
    continue;
  }

  await request("/api/v1/memories", {
    user_id: session.user_id,
    session_id: session.session_id,
    messages: session.messages,
    async_mode: false,
  });
  const flush = await request("/api/v1/memories/flush", {
    user_id: session.user_id,
    session_id: session.session_id,
  });

  console.log(`added ${session.session_id} (${flush.status ?? "flushed"})`);
  added += 1;
}

console.log(`EverOS seed complete: ${added} added, ${skipped} skipped.`);
