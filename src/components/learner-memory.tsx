"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Learner {
  userId: string;
  displayName: string;
  age: number;
  grade: string;
}

interface MemoryEpisode {
  id: string;
  sessionId: string | null;
  timestamp: number | null;
  subject: string;
  summary: string;
  episode: string;
}

interface MemoryProfile {
  id: string;
  scenario: string;
  memcellCount: number | null;
  explicitInfo: unknown;
  implicitTraits: unknown;
}

interface MemoryResponse {
  memory: {
    available: boolean;
    learner: Learner;
    episodes: MemoryEpisode[];
    profiles: MemoryProfile[];
    highlights: string[];
    error?: string;
  };
}

function formatDate(timestamp: number | null) {
  if (timestamp === null) return "Date unavailable";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatProfileValue(value: unknown) {
  if (value === null || value === undefined) return "Not extracted yet";
  if (typeof value === "string") return value;

  return JSON.stringify(value, null, 2);
}

export default function LearnerMemory() {
  const [data, setData] = useState<MemoryResponse["memory"] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMemory() {
      try {
        const response = await fetch("/api/memory");
        const payload = (await response.json()) as MemoryResponse;
        setData(payload.memory);
      } catch {
        setData({
          available: false,
          learner: {
            userId: "sofia_reyes",
            displayName: "Sofia Reyes",
            age: 16,
            grade: "10th grade English (writing)",
          },
          episodes: [],
          profiles: [],
          highlights: [],
          error: "Learner memory could not be loaded.",
        });
      } finally {
        setLoading(false);
      }
    }

    void loadMemory();
  }, []);

  const episodes = [...(data?.episodes ?? [])].sort(
    (left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0),
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-5 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[var(--foreground)] text-sm font-bold text-[var(--accent)]">
            V
          </span>
          <span className="text-lg font-semibold tracking-tight">Viva</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/history"
            className="text-sm font-medium text-[var(--muted)]"
          >
            Session history
          </Link>
          <Link
            href="/"
            className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm font-medium"
          >
            New exam
          </Link>
        </div>
      </header>

      <section className="py-12 sm:py-16">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Memory reveal
              </p>
              <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold">
                Powered by EverOS
              </span>
            </div>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
              What Viva remembers about Sofia
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)]">
              EverOS turns prior learning conversations into a living profile
              and searchable episodes. Viva recalls this evidence before it
              chooses a question or interprets growth.
            </p>
          </div>
          {data ? (
            <span
              className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${
                data.available
                  ? "bg-[#dff5b1] text-[#365314]"
                  : "bg-[#fff0a8] text-[#6b5311]"
              }`}
            >
              {data.available ? "Memory connected" : "Memory unavailable"}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="mt-10 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="h-72 animate-pulse rounded-[2rem] bg-white/60" />
            <div className="h-72 animate-pulse rounded-[2rem] bg-white/60" />
          </div>
        ) : null}

        {!loading && data ? (
          <>
            <div className="mt-10 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <article className="rounded-[2rem] bg-[var(--foreground)] p-7 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                  Learner card
                </p>
                <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em]">
                  {data.learner.displayName}
                </h2>
                <p className="mt-2 text-sm text-white/65">
                  Age {data.learner.age} · {data.learner.grade}
                </p>
                <div className="mt-8 border-t border-white/15 pt-6">
                  <p className="text-sm leading-6 text-white/75">
                    Sofia moved from plot summary to a precise analytical
                    thesis across four essays, reliably applying each round of
                    feedback.
                  </p>
                  <p className="mt-5 font-mono text-xs text-white/45">
                    EverOS ID: {data.learner.userId}
                  </p>
                </div>
              </article>

              <article className="rounded-[2rem] border border-[var(--line)] bg-white/75 p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Why memory changes the assessment
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em]">
                  The leap is evidence-backed, not unexplained.
                </h2>
                <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
                  A memoryless evaluator sees only Essay 4&apos;s sudden
                  vocabulary and fluency. Viva can see the intervening thesis,
                  quotation, and analysis improvements—and that Sofia acted on
                  every prior note—before deciding how to probe her
                  understanding.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    ["Essay 1", "Plot summary"],
                    ["Essay 3", "First clear thesis"],
                    ["Essay 4", "Controlled analysis"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl bg-[#f3f4ee] p-4"
                    >
                      <p className="text-xs text-[var(--muted)]">{label}</p>
                      <p className="mt-2 text-sm font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            {!data.available ? (
              <div className="mt-6 rounded-2xl border border-[#e4c65f] bg-[#fff7cf] p-5 text-sm text-[#6b5311]">
                {data.error ??
                  "EverOS is unavailable. Oral exams still work without memory."}
              </div>
            ) : null}

            {data.highlights.length > 0 ? (
              <section className="mt-12">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Recalled now
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {data.highlights.map((highlight) => (
                    <blockquote
                      key={highlight}
                      className="rounded-2xl border border-[var(--line)] bg-white/70 p-5 text-sm leading-6"
                    >
                      {highlight}
                    </blockquote>
                  ))}
                </div>
              </section>
            ) : null}

            {data.profiles.length > 0 ? (
              <section className="mt-12">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Consolidated learner profile
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {data.profiles.map((profile) => (
                    <article
                      key={profile.id}
                      className="rounded-[2rem] border border-[var(--line)] bg-white/75 p-6"
                    >
                      <p className="text-xs font-semibold text-[var(--muted)]">
                        {profile.scenario || "Cross-session profile"}
                        {profile.memcellCount === null
                          ? ""
                          : ` · ${profile.memcellCount} memory cells`}
                      </p>
                      <h3 className="mt-5 text-sm font-semibold">
                        Explicit information
                      </h3>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-[var(--muted)]">
                        {formatProfileValue(profile.explicitInfo)}
                      </pre>
                      <h3 className="mt-5 text-sm font-semibold">
                        Inferred learning traits
                      </h3>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-[var(--muted)]">
                        {formatProfileValue(profile.implicitTraits)}
                      </pre>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-12">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Learning timeline
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">
                    {episodes.length} extracted episode
                    {episodes.length === 1 ? "" : "s"}
                  </h2>
                </div>
              </div>
              {episodes.length > 0 ? (
                <div className="mt-6 space-y-4">
                  {episodes.map((episode, index) => (
                    <article
                      key={episode.id}
                      className="grid gap-5 rounded-[2rem] border border-[var(--line)] bg-white/75 p-6 md:grid-cols-[9rem_1fr]"
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                          Session {index + 1}
                        </p>
                        <p className="mt-2 text-sm font-medium">
                          {formatDate(episode.timestamp)}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold tracking-[-0.02em]">
                          {episode.subject || episode.summary || "Learning episode"}
                        </h3>
                        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                          {episode.episode || episode.summary}
                        </p>
                        {episode.sessionId ? (
                          <p className="mt-4 font-mono text-[11px] text-[var(--muted)]">
                            {episode.sessionId}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-[2rem] border border-dashed border-[var(--line)] bg-white/50 p-8 text-sm text-[var(--muted)]">
                  No extracted episodes are available yet. Run the Sofia seed
                  command, then refresh this page.
                </div>
              )}
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
