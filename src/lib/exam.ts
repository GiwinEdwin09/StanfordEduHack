import { z } from "zod";

export const MAX_EXAM_TURNS = 5;

export const questionTypeSchema = z.enum([
  "baseline",
  "follow_up",
  "deeper",
]);

export const startExamRequestSchema = z.object({
  topic: z.string().trim().min(2).max(120),
  participantId: z.string().uuid().optional(),
});

export const submitAnswerRequestSchema = z.object({
  question: z.string().trim().min(2).max(1_500),
  answer: z.string().trim().min(2).max(8_000),
  conceptTag: z.string().trim().min(1).max(120),
  questionType: questionTypeSchema,
  turnIndex: z.number().int().min(1).max(MAX_EXAM_TURNS),
  latencyMs: z.number().int().min(0).max(3_600_000),
  followUpOf: z.string().uuid().nullable().optional(),
});

export const openingQuestionSchema = z.object({
  question: z.string().trim().min(2).max(1_500),
  conceptTag: z.string().trim().min(1).max(120),
});

export const turnEvaluationSchema = z.object({
  overallScore: z.number().int().min(0).max(10),
  correctnessScore: z.number().int().min(0).max(10),
  depthScore: z.number().int().min(0).max(10),
  reasoningScore: z.number().int().min(0).max(10),
  examplesScore: z.number().int().min(0).max(10),
  confidenceScore: z.number().int().min(0).max(10),
  feedback: z.string().trim().min(1).max(1_000),
  summary: z.string().trim().min(1).max(300),
  canonicalAnswer: z.string().trim().min(1).max(2_000),
  conceptTag: z.string().trim().min(1).max(120),
  nextQuestion: z.string().trim().min(2).max(1_500),
  nextQuestionType: questionTypeSchema,
  nextDifficulty: z.number().int().min(1).max(5),
});

export type QuestionType = z.infer<typeof questionTypeSchema>;
export type OpeningQuestion = z.infer<typeof openingQuestionSchema>;
export type TurnEvaluation = z.infer<typeof turnEvaluationSchema>;

export interface ExamSessionRow {
  id: string;
  participant_id: string;
  topic: string;
  difficulty: number;
  status: "active" | "completed";
  final_scores: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
}

export interface ResponseRow {
  id: string;
  session_id: string;
  turn_index: number;
  question: string;
  concept_tag: string;
  question_type: QuestionType;
  answer: string;
  latency_ms: number | null;
  score: number | null;
  depth_score: number | null;
  confidence_score: number | null;
  evaluation: {
    correctnessScore?: number;
    reasoningScore?: number;
    examplesScore?: number;
    feedback?: string;
    summary?: string;
  };
  canonical_answer: string | null;
  follow_up_of: string | null;
  created_at: string;
}
