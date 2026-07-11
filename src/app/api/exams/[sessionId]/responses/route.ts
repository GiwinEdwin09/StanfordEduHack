import { NextResponse } from "next/server";
import { z } from "zod";
import { getRow, insertRow, listRows, updateRow } from "@/lib/butterbase";
import { evaluateTurn } from "@/lib/examiner";
import {
  aggregateIntegrityRisk,
  computeIntegrityEvidence,
} from "@/lib/integrity";
import {
  addLearnerMessages,
  flushLearnerSession,
  recallLearnerMemory,
} from "@/lib/everos";
import {
  MAX_EXAM_TURNS,
  submitAnswerRequestSchema,
  type ExamQuestionRow,
  type ExamSessionRow,
  type ResponseRow,
} from "@/lib/exam";

export const runtime = "edge";

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

    const [session, question] = await Promise.all([
      getRow<ExamSessionRow>("exam_sessions", sessionId),
      getRow<ExamQuestionRow>("exam_questions", parsed.data.questionId),
    ]);

    if (session.status !== "active") {
      return NextResponse.json(
        { error: "This exam has already ended." },
        { status: 409 },
      );
    }

    if (question.session_id !== sessionId) {
      return NextResponse.json(
        { error: "That question does not belong to this exam." },
        { status: 403 },
      );
    }

    const [priorResponses, memory] = await Promise.all([
      listRows<ResponseRow>("responses", {
        session_id: `eq.${sessionId}`,
        order: "turn_index.asc",
      }),
      recallLearnerMemory(
        `${session.topic}: ${question.question} — prior strengths, misconceptions, feedback response, and demonstrated growth`,
      ),
    ]);
    const expectedTurn = priorResponses.length + 1;

    if (question.turn_index !== expectedTurn) {
      return NextResponse.json(
        {
          error:
            "This answer is out of sequence. Refresh the session and try again.",
        },
        { status: 409 },
      );
    }

    const followUpTarget = question.follow_up_of
      ? priorResponses.find(
          (response) => response.id === question.follow_up_of,
        )
      : undefined;
    const consistencyTarget = question.paraphrase_of
      ? priorResponses.find(
          (response) => response.id === question.paraphrase_of,
        )
      : undefined;
    const firstResponse = priorResponses[0];

    const evaluation = await evaluateTurn({
      topic: session.topic,
      difficulty: question.difficulty,
      turnIndex: question.turn_index,
      question: question.question,
      answer: parsed.data.answer,
      conceptTag: question.concept_tag,
      questionType: question.question_type,
      learnerMemory: memory.context,
      history: priorResponses.map((response) => ({
        id: response.id,
        question: response.question,
        answer: response.answer,
        score: response.score,
      })),
      consistencyTarget: consistencyTarget
        ? {
            question: consistencyTarget.question,
            answer: consistencyTarget.answer,
          }
        : undefined,
      forceParaphraseOf:
        question.turn_index === 3 && firstResponse
          ? {
              question: firstResponse.question,
              conceptTag: firstResponse.concept_tag,
            }
          : undefined,
    });

    const integrity = await computeIntegrityEvidence({
      answer: parsed.data.answer,
      referenceAnswer: question.reference_answer,
      latencyMs: parsed.data.latencyMs,
      priorLatencies: priorResponses.flatMap((response) =>
        response.latency_ms === null ? [] : [response.latency_ms],
      ),
      evaluation,
      followUpTarget,
      consistencyTarget,
    });

    const response = await insertRow<ResponseRow>("responses", {
      session_id: sessionId,
      question_id: question.id,
      turn_index: question.turn_index,
      question: question.question,
      concept_tag: question.concept_tag,
      question_type: question.question_type,
      answer: parsed.data.answer,
      latency_ms: parsed.data.latencyMs,
      score: evaluation.overallScore,
      depth_score: evaluation.depthScore,
      confidence_score: evaluation.confidenceScore,
      signal_scores: integrity,
      evaluation: {
        correctnessScore: evaluation.correctnessScore,
        reasoningScore: evaluation.reasoningScore,
        examplesScore: evaluation.examplesScore,
        feedback: evaluation.feedback,
        summary: evaluation.summary,
      },
      canonical_answer: question.reference_answer,
      follow_up_of: question.follow_up_of,
      is_paraphrase_of: question.paraphrase_of,
    });

    const completed = question.turn_index >= MAX_EXAM_TURNS;
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
    const integrityRisk = aggregateIntegrityRisk(priorResponses, integrity);
    const runningScores = {
      overall: average(allScores),
      depth: average(allDepthScores),
      turns: allScores.length,
      integrityRisk,
    };

    let nextQuestion: ExamQuestionRow | null = null;

    if (!completed) {
      const forceConsistencyCheck =
        question.turn_index === 3 && Boolean(firstResponse);
      const nextQuestionType = forceConsistencyCheck
        ? "consistency_check"
        : evaluation.nextQuestionType === "consistency_check"
          ? "deeper"
          : evaluation.nextQuestionType;
      const nextFollowUpOf =
        nextQuestionType === "follow_up" || nextQuestionType === "deeper"
          ? response.id
          : null;

      nextQuestion = await insertRow<ExamQuestionRow>("exam_questions", {
        session_id: sessionId,
        turn_index: question.turn_index + 1,
        question: evaluation.nextQuestion,
        concept_tag: evaluation.conceptTag,
        question_type: nextQuestionType,
        difficulty: evaluation.nextDifficulty,
        reference_answer: evaluation.nextReferenceAnswer,
        follow_up_of: nextFollowUpOf,
        paraphrase_of: forceConsistencyCheck ? firstResponse.id : null,
      });
    }

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

    let memoryStored = true;
    const memoryTimestamp = Date.now();

    try {
      await addLearnerMessages(sessionId, [
        {
          role: "assistant",
          timestamp: memoryTimestamp,
          content: `Oral exam question ${question.turn_index} on ${session.topic}: ${question.question}`,
        },
        {
          role: "user",
          timestamp: memoryTimestamp + 1,
          content: parsed.data.answer,
        },
        {
          role: "assistant",
          timestamp: memoryTimestamp + 2,
          content: [
            `Evaluation: ${evaluation.overallScore}/10 overall and ${evaluation.depthScore}/10 depth.`,
            evaluation.feedback,
            completed
              ? "The oral exam is complete."
              : `Next question: ${evaluation.nextQuestion}`,
          ].join(" "),
        },
      ]);

      if (completed) {
        await flushLearnerSession(sessionId);
      }
    } catch (memoryError) {
      memoryStored = false;
      console.error("Failed to persist EverOS learner memory", memoryError);
    }

    return NextResponse.json({
      responseId: response.id,
      evaluation: {
        overallScore: evaluation.overallScore,
        correctnessScore: evaluation.correctnessScore,
        depthScore: evaluation.depthScore,
        reasoningScore: evaluation.reasoningScore,
        examplesScore: evaluation.examplesScore,
        confidenceScore: evaluation.confidenceScore,
        feedback: evaluation.feedback,
        summary: evaluation.summary,
        consistencyCheck: evaluation.consistencyCheck,
      },
      integrity,
      runningScores,
      memory: {
        available: memory.available,
        stored: memoryStored,
        highlights: memory.highlights.slice(0, 3),
        recalledCount: memory.episodes.length + memory.profiles.length,
      },
      completed,
      next: !nextQuestion
        ? null
        : {
            questionId: nextQuestion.id,
            turnIndex: nextQuestion.turn_index,
            question: nextQuestion.question,
            conceptTag: nextQuestion.concept_tag,
            questionType: nextQuestion.question_type,
            difficulty: nextQuestion.difficulty,
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
