import { z } from "zod";

export const MAX_EXAM_TURNS = 5;

export const questionTypeSchema = z.enum([
  "baseline",
  "follow_up",
  "deeper",
  "consistency_check",
]);

export const startExamRequestSchema = z.object({
  topic: z.string().trim().min(2).max(120),
  participantId: z.string().uuid().optional(),
});

export const submitAnswerRequestSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().trim().min(2).max(8_000),
  latencyMs: z.number().int().min(0).max(3_600_000),
});

export const openingQuestionSchema = z.object({
  question: z.string().trim().min(2).max(1_500),
  conceptTag: z.string().trim().min(1).max(120),
  referenceAnswer: z.string().trim().min(1).max(2_000),
});

export const consistencyCheckSchema = z
  .object({
    contradictionDetected: z.boolean(),
    explanation: z.string().trim().min(1).max(600),
    alignedClaims: z.array(z.string().trim().min(1).max(300)).max(4),
    conflictingClaims: z.array(z.string().trim().min(1).max(300)).max(4),
  })
  .nullable();

export const turnEvaluationSchema = z.object({
  overallScore: z.number().int().min(0).max(10),
  correctnessScore: z.number().int().min(0).max(10),
  depthScore: z.number().int().min(0).max(10),
  reasoningScore: z.number().int().min(0).max(10),
  examplesScore: z.number().int().min(0).max(10),
  confidenceScore: z.number().int().min(0).max(10),
  feedback: z.string().trim().min(1).max(1_000),
  summary: z.string().trim().min(1).max(300),
  consistencyCheck: consistencyCheckSchema,
  conceptTag: z.string().trim().min(1).max(120),
  nextQuestion: z.string().trim().min(2).max(1_500),
  nextReferenceAnswer: z.string().trim().min(1).max(2_000),
  nextQuestionType: questionTypeSchema,
  nextDifficulty: z.number().int().min(1).max(5),
});

export type QuestionType = z.infer<typeof questionTypeSchema>;
export type OpeningQuestion = z.infer<typeof openingQuestionSchema>;
export type TurnEvaluation = z.infer<typeof turnEvaluationSchema>;
export type PublicTurnEvaluation = Pick<
  TurnEvaluation,
  | "overallScore"
  | "correctnessScore"
  | "depthScore"
  | "reasoningScore"
  | "examplesScore"
  | "confidenceScore"
  | "feedback"
  | "summary"
  | "consistencyCheck"
>;

export type EvidenceStatus = "clear" | "review" | "flag" | "pending";
export type EvidenceKey =
  | "reference_similarity"
  | "depth_decay"
  | "consistency"
  | "latency";

export interface EvidenceMetric {
  label: string;
  value: string;
}

export interface EvidenceSignal {
  key: EvidenceKey;
  label: string;
  status: EvidenceStatus;
  risk: number | null;
  summary: string;
  metrics: EvidenceMetric[];
  evidence: string[];
}

export interface IntegrityEvidence {
  overallRisk: number;
  verdict: "clear" | "review" | "flag";
  signals: EvidenceSignal[];
}

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

export interface ExamQuestionRow {
  id: string;
  session_id: string;
  turn_index: number;
  question: string;
  concept_tag: string;
  question_type: QuestionType;
  difficulty: number;
  reference_answer: string;
  follow_up_of: string | null;
  paraphrase_of: string | null;
  asked_at: string;
}

export interface ResponseRow {
  id: string;
  session_id: string;
  question_id: string | null;
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
  signal_scores: IntegrityEvidence | Record<string, never>;
  canonical_answer: string | null;
  follow_up_of: string | null;
  is_paraphrase_of: string | null;
  created_at: string;
}
