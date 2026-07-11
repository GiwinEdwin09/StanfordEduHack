import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteRow, getRow, listRows } from "@/lib/butterbase";
import { deleteLearnerSession } from "@/lib/everos";
import type {
  EvidenceKey,
  EvidenceSignal,
  ExamSessionRow,
  IntegrityEvidence,
  ResponseRow,
} from "@/lib/exam";
import type { ReportTurn, SessionReport } from "@/lib/report";

export const runtime = "edge";

const signalOrder: EvidenceKey[] = [
  "reference_similarity",
  "depth_decay",
  "consistency",
  "latency",
];

function average(values: number[]) {
  if (values.length === 0) return 0;
  return (
    Math.round(
      (values.reduce((total, value) => total + value, 0) / values.length) *
        10,
    ) / 10
  );
}

function numberFrom(
  scores: Record<string, unknown>,
  key: string,
): number | null {
  const value = scores[key];
  return typeof value === "number" ? value : null;
}

function isIntegrityEvidence(
  value: ResponseRow["signal_scores"],
): value is IntegrityEvidence {
  return (
    "signals" in value &&
    Array.isArray(value.signals) &&
    typeof value.overallRisk === "number"
  );
}

function verdictFor(risk: number): SessionReport["verdict"] {
  if (risk >= 65) return "flag";
  if (risk >= 35) return "review";
  return "clear";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;
    const participantId = new URL(request.url).searchParams.get(
      "participantId",
    );
    const validSessionId = z.string().uuid().safeParse(sessionId);
    const validParticipantId = z.string().uuid().safeParse(participantId);

    if (!validSessionId.success || !validParticipantId.success) {
      return NextResponse.json(
        { error: "Valid session and participant IDs are required." },
        { status: 400 },
      );
    }

    const session = await getRow<ExamSessionRow>(
      "exam_sessions",
      validSessionId.data,
    );

    if (session.participant_id !== validParticipantId.data) {
      return NextResponse.json(
        { error: "This report is not available to this participant." },
        { status: 403 },
      );
    }

    const responses = await listRows<ResponseRow>("responses", {
      session_id: `eq.${session.id}`,
      order: "turn_index.asc",
    });
    const strongest = new Map<
      EvidenceKey,
      { signal: EvidenceSignal; turnIndex: number }
    >();

    for (const response of responses) {
      if (!isIntegrityEvidence(response.signal_scores)) continue;

      for (const signal of response.signal_scores.signals) {
        if (signal.risk === null || signal.status === "pending") continue;
        const existing = strongest.get(signal.key);

        if (!existing || (existing.signal.risk ?? -1) < signal.risk) {
          strongest.set(signal.key, {
            signal,
            turnIndex: response.turn_index,
          });
        }
      }
    }

    const strongestSignals = signalOrder.flatMap((key) => {
      const item = strongest.get(key);
      if (!item) return [];

      return [
        {
          ...item.signal,
          metrics: [
            { label: "Observed", value: `Question ${item.turnIndex}` },
            ...item.signal.metrics,
          ],
        },
      ];
    });
    const turns: ReportTurn[] = responses.map((response) => ({
      id: response.id,
      turnIndex: response.turn_index,
      question: response.question,
      answer: response.answer,
      questionType: response.question_type,
      score: response.score,
      depthScore: response.depth_score,
      confidenceScore: response.confidence_score,
      latencyMs: response.latency_ms,
      feedback: response.evaluation.feedback ?? null,
      integrity: isIntegrityEvidence(response.signal_scores)
        ? response.signal_scores
        : null,
    }));
    const overallScore =
      numberFrom(session.final_scores, "overall") ??
      average(responses.flatMap((item) => (item.score === null ? [] : [item.score])));
    const depthScore =
      numberFrom(session.final_scores, "depth") ??
      average(
        responses.flatMap((item) =>
          item.depth_score === null ? [] : [item.depth_score],
        ),
      );
    const integrityRisk =
      numberFrom(session.final_scores, "integrityRisk") ??
      Math.max(
        0,
        ...responses.flatMap((item) =>
          isIntegrityEvidence(item.signal_scores)
            ? [item.signal_scores.overallRisk]
            : [],
        ),
      );
    const startedAt = new Date(session.started_at).getTime();
    const completedAt = session.completed_at
      ? new Date(session.completed_at).getTime()
      : null;
    const report: SessionReport = {
      id: session.id,
      topic: session.topic,
      status: session.status,
      startedAt: session.started_at,
      completedAt: session.completed_at,
      durationSeconds:
        completedAt === null
          ? null
          : Math.max(0, Math.round((completedAt - startedAt) / 1_000)),
      overallScore,
      depthScore,
      integrityRisk,
      verdict: verdictFor(integrityRisk),
      strongestSignals,
      turns,
    };

    return NextResponse.json({ report });
  } catch (error) {
    console.error("Failed to load integrity report", error);
    return NextResponse.json(
      { error: "The integrity report could not be loaded." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;
    const participantId = new URL(request.url).searchParams.get(
      "participantId",
    );
    const validSessionId = z.string().uuid().safeParse(sessionId);
    const validParticipantId = z.string().uuid().safeParse(participantId);

    if (!validSessionId.success || !validParticipantId.success) {
      return NextResponse.json(
        { error: "Valid session and participant IDs are required." },
        { status: 400 },
      );
    }

    const session = await getRow<ExamSessionRow>(
      "exam_sessions",
      validSessionId.data,
    );

    if (session.participant_id !== validParticipantId.data) {
      return NextResponse.json(
        { error: "This session is not available to this participant." },
        { status: 403 },
      );
    }

    if (session.status !== "active") {
      return NextResponse.json(
        { error: "Only incomplete sessions can be deleted." },
        { status: 409 },
      );
    }

    await deleteLearnerSession(session.id);
    await deleteRow("exam_sessions", session.id);

    return NextResponse.json({ deletedSessionId: session.id });
  } catch (error) {
    console.error("Failed to delete incomplete session", error);
    return NextResponse.json(
      { error: "The incomplete session could not be deleted." },
      { status: 500 },
    );
  }
}
