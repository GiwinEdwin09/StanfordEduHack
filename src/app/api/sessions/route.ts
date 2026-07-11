import { NextResponse } from "next/server";
import { z } from "zod";
import { listRows } from "@/lib/butterbase";
import type { ExamSessionRow } from "@/lib/exam";
import type { SessionHistoryItem } from "@/lib/report";

export const runtime = "nodejs";

function numberFrom(
  scores: Record<string, unknown>,
  key: string,
): number | null {
  const value = scores[key];
  return typeof value === "number" ? value : null;
}

export async function GET(request: Request) {
  try {
    const participantId = new URL(request.url).searchParams.get(
      "participantId",
    );

    if (!z.string().uuid().safeParse(participantId).success) {
      return NextResponse.json(
        { error: "A valid participant ID is required." },
        { status: 400 },
      );
    }

    const sessions = await listRows<ExamSessionRow>("exam_sessions", {
      participant_id: `eq.${participantId}`,
      order: "started_at.desc",
      limit: 20,
    });
    const history: SessionHistoryItem[] = sessions.map((session) => ({
      id: session.id,
      topic: session.topic,
      status: session.status,
      startedAt: session.started_at,
      completedAt: session.completed_at,
      overallScore: numberFrom(session.final_scores, "overall"),
      depthScore: numberFrom(session.final_scores, "depth"),
      integrityRisk: numberFrom(session.final_scores, "integrityRisk"),
      turns: numberFrom(session.final_scores, "turns") ?? 0,
    }));

    return NextResponse.json({ sessions: history });
  } catch (error) {
    console.error("Failed to load session history", error);
    return NextResponse.json(
      { error: "Session history could not be loaded." },
      { status: 500 },
    );
  }
}
