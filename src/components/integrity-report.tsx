"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EvidenceSignalCard, {
  evidenceTone,
} from "@/components/evidence-signal-card";
import type { SessionReport } from "@/lib/report";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "In progress";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function scoreTone(score: number | null) {
  if (score === null) return "bg-[#edf0e9]";
  if (score >= 8) return "bg-[#dff5b1]";
  if (score >= 5) return "bg-[#fff0a8]";
  return "bg-[#ffd5c9]";
}

export default function IntegrityReport({
  sessionId,
}: {
  sessionId: string;
}) {
  const [report, setReport] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReport() {
      const participantId = window.localStorage.getItem("viva-participant-id");

      if (!participantId) {
        setError(
          "This report belongs to a local Viva profile that is not available in this browser.",
        );
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/sessions/${sessionId}?participantId=${encodeURIComponent(participantId)}`,
        );
        const data = (await response.json()) as {
          report?: SessionReport;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Could not load this report.");
        }

        setReport(data.report ?? null);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load this report.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadReport();
  }, [sessionId]);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-7xl px-5 py-5 sm:px-8 lg:px-12">
        <div className="h-16 animate-pulse rounded-2xl bg-white/60" />
        <div className="mt-10 grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="h-[520px] animate-pulse rounded-[2rem] bg-[#28312e]" />
          <div className="h-[520px] animate-pulse rounded-[2rem] bg-white/60" />
        </div>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <div className="max-w-lg rounded-[2rem] border border-[var(--line)] bg-white/75 p-8 text-center">
          <p className="text-lg font-semibold">Report unavailable</p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {error ?? "The requested report could not be found."}
          </p>
          <Link
            href="/history"
            className="mt-6 inline-block rounded-full bg-[var(--foreground)] px-5 py-3 text-sm font-semibold text-white"
          >
            Return to history
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-5 py-5 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-5 print:hidden">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[var(--foreground)] text-sm font-bold text-[var(--accent)]">
            V
          </span>
          <span className="text-lg font-semibold tracking-tight">Viva</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/history"
            className="text-sm font-medium text-[var(--muted)]"
          >
            All sessions
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm font-medium"
          >
            Print report
          </button>
        </div>
      </header>

      <section className="py-10 sm:py-14">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Integrity report
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-[0.08em] ${evidenceTone(report.verdict)}`}
              >
                {report.verdict}
              </span>
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
              {report.topic}
            </h1>
            <p className="mt-4 text-sm text-[var(--muted)]">
              {formatDate(report.startedAt)} ·{" "}
              {formatDuration(report.durationSeconds)} · {report.turns.length}{" "}
              responses
            </p>
          </div>
          <p className="max-w-sm text-sm leading-6 text-[var(--muted)]">
            This report surfaces evidence for review. It does not label a
            student dishonest, and no timing or similarity signal is decisive
            on its own.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="h-fit rounded-[2rem] bg-[var(--foreground)] p-7 text-white lg:sticky lg:top-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
              Understanding score
            </p>
            <div className="mt-5 flex items-end gap-2">
              <span className="text-7xl font-semibold tracking-[-0.065em]">
                {report.overallScore}
              </span>
              <span className="pb-2 text-sm text-white/40">/10</span>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 border-t border-white/10 pt-6">
              <div>
                <p className="text-2xl font-semibold">{report.depthScore}</p>
                <p className="mt-1 text-xs text-white/45">Average depth</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">
                  {report.turns.length}
                </p>
                <p className="mt-1 text-xs text-white/45">Turns analyzed</p>
              </div>
            </div>

            <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                Evidence risk
              </p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-semibold">
                  {report.integrityRisk}
                </span>
                <span className="pb-1 text-xs text-white/40">/100</span>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${report.integrityRisk}%` }}
                />
              </div>
            </div>

            <div className="mt-7 space-y-3 text-xs leading-5 text-white/55">
              <p>
                <strong className="text-white">0–34:</strong> evidence is clear
              </p>
              <p>
                <strong className="text-white">35–64:</strong> review suggested
              </p>
              <p>
                <strong className="text-white">65–100:</strong> strong evidence
                flag
              </p>
            </div>
          </aside>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-5 sm:p-7">
              <div>
                <p className="text-lg font-semibold">Strongest evidence</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  The highest observed value for each independent signal
                </p>
              </div>

              {report.strongestSignals.length > 0 ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {report.strongestSignals.map((signal) => (
                    <EvidenceSignalCard key={signal.key} signal={signal} />
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl bg-[#f3f4ee] p-5 text-sm text-[var(--muted)]">
                  No integrity evidence has been recorded for this session yet.
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-5 sm:p-7">
              <div>
                <p className="text-lg font-semibold">Question-by-question</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Answers, examiner feedback, and turn-level evidence
                </p>
              </div>
              <div className="mt-6 space-y-4">
                {report.turns.map((turn) => (
                  <article
                    key={turn.id}
                    className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-6"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--muted)]">
                          Q{turn.turnIndex}
                        </span>
                        <span className="rounded-full bg-[#edf0e9] px-2.5 py-1 text-[10px] font-semibold capitalize">
                          {turn.questionType.replaceAll("_", " ")}
                        </span>
                        {turn.latencyMs !== null ? (
                          <span className="text-xs text-[var(--muted)]">
                            {Math.round(turn.latencyMs / 1_000)}s
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreTone(turn.score)}`}
                      >
                        {turn.score ?? "—"}/10
                      </span>
                    </div>

                    <h2 className="mt-4 text-base font-semibold leading-6">
                      {turn.question}
                    </h2>
                    <p className="mt-3 border-l-2 border-[var(--line)] pl-4 text-sm leading-6 text-[var(--muted)]">
                      {turn.answer}
                    </p>
                    {turn.feedback ? (
                      <p className="mt-4 rounded-xl bg-[#f3f4ee] px-4 py-3 text-xs leading-5">
                        <strong>Examiner:</strong> {turn.feedback}
                      </p>
                    ) : null}

                    {turn.integrity ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {turn.integrity.signals
                          .filter((signal) => signal.status !== "pending")
                          .map((signal) => (
                            <EvidenceSignalCard
                              key={signal.key}
                              signal={signal}
                              compact
                            />
                          ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
