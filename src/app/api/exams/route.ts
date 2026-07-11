import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { insertRow } from "@/lib/butterbase";
import { generateOpeningQuestion } from "@/lib/examiner";
import {
  startExamRequestSchema,
  type ExamQuestionRow,
  type ExamSessionRow,
} from "@/lib/exam";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = startExamRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Choose a topic between 2 and 120 characters." },
        { status: 400 },
      );
    }

    const participantId = parsed.data.participantId ?? randomUUID();
    const opening = await generateOpeningQuestion(parsed.data.topic);
    const session = await insertRow<ExamSessionRow>("exam_sessions", {
      participant_id: participantId,
      topic: parsed.data.topic,
      difficulty: 2,
      status: "active",
    });
    const question = await insertRow<ExamQuestionRow>("exam_questions", {
      session_id: session.id,
      turn_index: 1,
      question: opening.question,
      concept_tag: opening.conceptTag,
      question_type: "baseline",
      difficulty: 2,
      reference_answer: opening.referenceAnswer,
      follow_up_of: null,
      paraphrase_of: null,
    });

    return NextResponse.json(
      {
        sessionId: session.id,
        participantId,
        topic: session.topic,
        questionId: question.id,
        difficulty: question.difficulty,
        turnIndex: question.turn_index,
        question: question.question,
        conceptTag: question.concept_tag,
        questionType: question.question_type,
        maxTurns: 5,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to start exam", error);
    return NextResponse.json(
      { error: "The examiner could not start the session. Please try again." },
      { status: 500 },
    );
  }
}
