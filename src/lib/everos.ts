import "server-only";

const EVEROS_API_URL =
  process.env.EVEROS_API_URL?.replace(/\/$/, "") ??
  "https://api.evermind.ai";
const REQUEST_TIMEOUT_MS = 4_000;
const DEFAULT_LEARNER_ID = "sofia_reyes";

export const learnerProfile = {
  userId: process.env.EVEROS_LEARNER_ID ?? DEFAULT_LEARNER_ID,
  displayName: "Sofia Reyes",
  age: 16,
  grade: "10th grade English (writing)",
} as const;

export interface EverOSMessage {
  role: "user" | "assistant";
  timestamp: number;
  content: string;
}

export interface LearnerMemoryEpisode {
  id: string;
  sessionId: string | null;
  timestamp: number | null;
  subject: string;
  summary: string;
  episode: string;
}

export interface LearnerMemoryProfile {
  id: string;
  scenario: string;
  memcellCount: number | null;
  explicitInfo: unknown;
  implicitTraits: unknown;
}

export interface LearnerMemorySnapshot {
  available: boolean;
  learner: typeof learnerProfile;
  episodes: LearnerMemoryEpisode[];
  profiles: LearnerMemoryProfile[];
  highlights: string[];
  context: string;
  error?: string;
}

interface EverOSDataEnvelope {
  data?: Record<string, unknown>;
}

function getApiKey() {
  const apiKey = process.env.EVEROS_API_KEY;

  if (!apiKey) {
    throw new Error("EverOS is not configured. Set EVEROS_API_KEY.");
  }

  return apiKey;
}

async function everosRequest(
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${EVEROS_API_URL}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let parsed: EverOSDataEnvelope | Record<string, unknown> = {};

  if (text) {
    try {
      parsed = JSON.parse(text) as EverOSDataEnvelope;
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const detail =
      "message" in parsed && typeof parsed.message === "string"
        ? parsed.message
        : `EverOS request failed with status ${response.status}.`;
    throw new Error(detail);
  }

  if (
    "data" in parsed &&
    parsed.data &&
    typeof parsed.data === "object" &&
    !Array.isArray(parsed.data)
  ) {
    return parsed.data as Record<string, unknown>;
  }

  return parsed as Record<string, unknown>;
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEpisodes(value: unknown): LearnerMemoryEpisode[] {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const episode = recordFrom(item);

    return {
      id: stringFrom(episode.id) || `episode-${index}`,
      sessionId: stringFrom(episode.session_id) || null,
      timestamp: numberFrom(episode.timestamp),
      subject: stringFrom(episode.subject),
      summary: stringFrom(episode.summary),
      episode: stringFrom(episode.episode),
    };
  });
}

function normalizeProfiles(value: unknown): LearnerMemoryProfile[] {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const profile = recordFrom(item);
    const profileData = recordFrom(profile.profile_data);

    return {
      id: stringFrom(profile.id) || `profile-${index}`,
      scenario: stringFrom(profile.scenario),
      memcellCount: numberFrom(profile.memcell_count),
      explicitInfo: profileData.explicit_info ?? null,
      implicitTraits: profileData.implicit_traits ?? null,
    };
  });
}

function truncate(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum - 1).trim()}…`;
}

function profileText(profile: LearnerMemoryProfile) {
  const details = [profile.explicitInfo, profile.implicitTraits]
    .filter((value) => value !== null && value !== undefined)
    .map((value) => JSON.stringify(value))
    .join(" ");

  return truncate(details, 800);
}

function buildSnapshot(
  episodes: LearnerMemoryEpisode[],
  profiles: LearnerMemoryProfile[],
): LearnerMemorySnapshot {
  const episodeHighlights = episodes
    .map((item) => item.summary || item.subject || item.episode)
    .filter(Boolean)
    .map((item) => truncate(item, 220));
  const profileHighlights = profiles.map(profileText).filter(Boolean);
  const highlights = [...episodeHighlights, ...profileHighlights].slice(0, 5);
  const contextParts = [
    ...profiles.map((profile) => `Learner profile: ${profileText(profile)}`),
    ...episodes.map(
      (episode) =>
        `Prior learning episode${episode.subject ? ` (${episode.subject})` : ""}: ${truncate(episode.episode || episode.summary, 900)}`,
    ),
  ].filter((item) => !item.endsWith(": "));

  return {
    available: true,
    learner: learnerProfile,
    episodes,
    profiles,
    highlights,
    context: truncate(contextParts.join("\n"), 4_000),
  };
}

export function isEverOSConfigured() {
  return Boolean(process.env.EVEROS_API_KEY);
}

export async function recallLearnerMemory(
  query: string,
  topK = 5,
): Promise<LearnerMemorySnapshot> {
  try {
    const data = await everosRequest("/api/v1/memories/search", {
      filters: { user_id: learnerProfile.userId },
      query,
      method: "hybrid",
      memory_types: ["episodic_memory", "profile"],
      top_k: topK,
    });

    return buildSnapshot(
      normalizeEpisodes(data.episodes),
      normalizeProfiles(data.profiles),
    );
  } catch (error) {
    console.error("EverOS recall unavailable", error);
    return {
      available: false,
      learner: learnerProfile,
      episodes: [],
      profiles: [],
      highlights: [],
      context: "",
      error: "Learner memory is temporarily unavailable.",
    };
  }
}

export async function getLearnerMemory(): Promise<LearnerMemorySnapshot> {
  try {
    const [episodeData, profileData] = await Promise.all([
      everosRequest("/api/v1/memories/get", {
        filters: { user_id: learnerProfile.userId },
        memory_type: "episodic_memory",
        page: 1,
        page_size: 50,
        rank_by: "timestamp",
        rank_order: "desc",
      }),
      everosRequest("/api/v1/memories/get", {
        filters: { user_id: learnerProfile.userId },
        memory_type: "profile",
        page: 1,
        page_size: 20,
        rank_by: "timestamp",
        rank_order: "desc",
      }),
    ]);

    return buildSnapshot(
      normalizeEpisodes(episodeData.episodes),
      normalizeProfiles(profileData.profiles),
    );
  } catch (error) {
    console.error("EverOS memory reveal unavailable", error);
    return {
      available: false,
      learner: learnerProfile,
      episodes: [],
      profiles: [],
      highlights: [],
      context: "",
      error: "Learner memory is temporarily unavailable.",
    };
  }
}

export async function addLearnerMessages(
  sessionId: string,
  messages: EverOSMessage[],
) {
  if (messages.length === 0) return;

  await everosRequest("/api/v1/memories", {
    user_id: learnerProfile.userId,
    session_id: sessionId,
    messages,
    async_mode: true,
  });
}

export async function flushLearnerSession(sessionId: string) {
  await everosRequest("/api/v1/memories/flush", {
    user_id: learnerProfile.userId,
    session_id: sessionId,
  });
}

export async function deleteLearnerSession(sessionId: string) {
  if (!isEverOSConfigured()) return;

  await everosRequest("/api/v1/memories/delete", {
    user_id: learnerProfile.userId,
    session_id: sessionId,
  });
}
