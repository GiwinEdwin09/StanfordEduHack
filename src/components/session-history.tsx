"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionHistoryItem } from "@/lib/report";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function riskTone(risk: number | null) {
  if (risk === null) return "bg-[#edf0e9] text-[var(--muted)]";
  if (risk >= 65) return "bg-[#ffd5c9] text-[#7c2d17]";
  if (risk >= 35) return "bg-[#fff0a8] text-[#6b5311]";
  return "bg-[#dff5b1] text-[#365314]";
}

export default function SessionHistory() {
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    async function loadHistory() {
      const participantId = window.localStorage.getItem("viva-participant-id");

      if (!participantId) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/sessions?participantId=${encodeURIComponent(participantId)}`,
        );
        const data = (await response.json()) as {
          sessions?: SessionHistoryItem[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Could not load session history.");
        }

        setSessions(data.sessions ?? []);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load session history.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadHistory();
  }, []);

  async function deleteIncompleteSession(session: SessionHistoryItem) {
    if (session.status !== "active") return;

    const confirmed = window.confirm(
      `Delete the incomplete “${session.topic}” session? This cannot be undone.`,
    );
    if (!confirmed) return;

    const participantId = window.localStorage.getItem("viva-participant-id");
    if (!participantId) {
      setError("This session cannot be verified on this browser.");
      return;
    }

    setDeletingSessionId(session.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/sessions/${session.id}?participantId=${encodeURIComponent(participantId)}`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as {
        deletedSessionId?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not delete the incomplete session.");
      }

      setSessions((current) =>
        current.filter((item) => item.id !== session.id),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not delete the incomplete session.",
      );
    } finally {
      setDeletingSessionId(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-5 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[var(--foreground)] text-sm font-bold text-[var(--accent)]">
            V
          </span>
          <span className="text-lg font-semibold tracking-tight">Viva</span>
        </Link>
        <Link
          href="/"
          className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm font-medium"
        >
          New exam
        </Link>
      </header>

      <section className="py-12 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Persistent learning memory
        </p>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
              Session history
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
              Revisit completed exams, inspect their integrity evidence, and
              clean up attempts you did not finish.
            </p>
          </div>
          {!loading && sessions.length > 0 ? (
            <span className="text-sm text-[var(--muted)]">
              {sessions.length} recent session{sessions.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-48 animate-pulse rounded-[2rem] border border-[var(--line)] bg-white/50"
              />
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="mt-10 rounded-2xl border border-[#e6a995] bg-[#fff0eb] p-5 text-sm text-[#7c2d17]">
            {error}
          </div>
        ) : null}

        {!loading && !error && sessions.length === 0 ? (
          <div className="mt-10 rounded-[2rem] border border-dashed border-[var(--line)] bg-white/50 px-6 py-16 text-center">
            <p className="text-lg font-semibold">No exams here yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
              Start your first oral exam and its progress will appear here.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-full bg-[var(--foreground)] px-5 py-3 text-sm font-semibold text-white"
            >
              Start an exam
            </Link>
          </div>
        ) : null}

        {!loading && sessions.length > 0 ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {sessions.map((session) => (
              <article
                key={session.id}
                className="group rounded-[2rem] border border-[var(--line)] bg-white/75 p-5 transition hover:-translate-y-0.5 hover:border-[#a4aaa6] hover:shadow-[0_18px_50px_rgb(24_32_29/0.08)] sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      {formatDate(session.startedAt)}
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
                      {session.topic}
                    </h2>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${riskTone(session.integrityRisk)}`}
                  >
                    {session.status === "active"
                      ? "In progress"
                      : `${session.integrityRisk ?? "—"} risk`}
                  </span>
                </div>

                <div className="mt-8 grid grid-cols-3 gap-3 border-t border-[var(--line)] pt-5">
                  <div>
                    <p className="text-xl font-semibold">
                      {session.overallScore ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">Overall</p>
                  </div>
                  <div>
                    <p className="text-xl font-semibold">
                      {session.depthScore ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">Depth</p>
                  </div>
                  <div>
                    <p className="text-xl font-semibold">{session.turns}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">Turns</p>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-4">
                  <Link
                    href={`/report/${session.id}`}
                    className="text-sm font-semibold"
                  >
                    Open integrity report{" "}
                    <span className="inline-block transition group-hover:translate-x-1">
                      →
                    </span>
                  </Link>
                  {session.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => void deleteIncompleteSession(session)}
                      disabled={deletingSessionId !== null}
                      className="rounded-full border border-[#e6a995] px-3 py-1.5 text-xs font-semibold text-[#7c2d17] transition hover:bg-[#fff0eb] disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Delete incomplete ${session.topic} session`}
                    >
                      {deletingSessionId === session.id
                        ? "Deleting…"
                        : "Delete incomplete"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
