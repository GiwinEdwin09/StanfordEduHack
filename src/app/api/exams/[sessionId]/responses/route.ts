import { NextResponse } from "next/server";
import { z } from "zod";
import { getRow, insertRow, listRows, updateRow } from "@/lib/butterbase";
import { evaluateTurn } from "@/lib/examiner";
import {
  MAX_EXAM_TURNS,
  submitAnswerRequestSchema,
  type ExamSessionRow,
  type ResponseRow,
} from "@/lib/exam";

export const runtime = "nodejs";

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(
    (values.reduce((total, value) => total + value, 0) / values.length) *
      10,
  ) / 10;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;

    if (!z.string().uuid().safeParse(sessionId).success) {
      return NextResponse.json(
        { error: "Invalid exam session." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = submitAnswerRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "The answer or question data is invalid." },
        { status: 400 },
      );
    }

    const session = await getRow<ExamSessionRow>("exam_sessions", sessionId);

    if (session.status !== "active") {
      return NextResponse.json(
        { error: "This exam has already ended." },
        { status: 409 },
      );
    }

    const priorResponses = await listRows<ResponseRow>("responses", {
      session_id: `eq.${sessionId}`,
      order: "turn_index.asc",
    });
    const expectedTurn = priorResponses.length + 1;

    if (parsed.data.turnIndex !== expectedTurn) {
      return NextResponse.json(
        {
          error:
            "This answer is out of sequence. Refresh the session and try again.",
        },
        { status: 409 },
      );
    }

    const evaluation = await evaluateTurn({
      topic: session.topic,
      difficulty: session.difficulty,
      turnIndex: parsed.data.turnIndex,
      question: parsed.data.question,
      answer: parsed.data.answer,
      conceptTag: parsed.data.conceptTag,
      questionType: parsed.data.questionType,
      history: priorResponses.map((response) => ({
        question: response.question,
        answer: response.answer,
        score: response.score,
      })),
    });

    const response = await insertRow<ResponseRow>("responses", {
      session_id: sessionId,
      turn_index: parsed.data.turnIndex,
      question: parsed.data.question,
      concept_tag: parsed.data.conceptTag,
      question_type: parsed.data.questionType,
      answer: parsed.data.answer,
      latency_ms: parsed.data.latencyMs,
      score: evaluation.overallScore,
      depth_score: evaluation.depthScore,
      confidence_score: evaluation.confidenceScore,
      signal_scores: {},
      evaluation: {
        correctnessScore: evaluation.correctnessScore,
        reasoningScore: evaluation.reasoningScore,
        examplesScore: evaluation.examplesScore,
        feedback: evaluation.feedback,
        summary: evaluation.summary,
      },
      canonical_answer: evaluation.canonicalAnswer,
      follow_up_of: parsed.data.followUpOf ?? null,
      is_paraphrase_of: null,
    });

    const completed = parsed.data.turnIndex >= MAX_EXAM_TURNS;
    const allScores = [
      ...priorResponses.flatMap((item) =>
        item.score === null ? [] : [item.score],
      ),
      evaluation.overallScore,
    ];
    const allDepthScores = [
      ...priorResponses.flatMap((item) =>
        item.depth_score === null ? [] : [item.depth_score],
      ),
      evaluation.depthScore,
    ];
    const runningScores = {
      overall: average(allScores),
      depth: average(allDepthScores),
      turns: allScores.length,
    };

    await updateRow<ExamSessionRow>("exam_sessions", sessionId, {
      difficulty: evaluation.nextDifficulty,
      ...(completed
        ? {
            status: "completed",
            completed_at: new Date().toISOString(),
            final_scores: runningScores,
          }
        : {}),
    });

    return NextResponse.json({
      responseId: response.id,
      evaluation,
      runningScores,
      completed,
      next: completed
        ? null
        : {
            turnIndex: parsed.data.turnIndex + 1,
            question: evaluation.nextQuestion,
            conceptTag: evaluation.conceptTag,
            questionType: evaluation.nextQuestionType,
            followUpOf:
              evaluation.nextQuestionType === "follow_up"
                ? response.id
                : null,
            difficulty: evaluation.nextDifficulty,
          },
    });
  } catch (error) {
    console.error("Failed to evaluate exam response", error);
    return NextResponse.json(
      {
        error: "The examiner could not evaluate that answer. Please try again.",
      },
      { status: 500 },
    );
  }
}
