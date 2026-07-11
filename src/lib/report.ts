import type {
  EvidenceSignal,
  IntegrityEvidence,
  QuestionType,
} from "@/lib/exam";

export interface SessionHistoryItem {
  id: string;
  topic: string;
  status: "active" | "completed";
  startedAt: string;
  completedAt: string | null;
  overallScore: number | null;
  depthScore: number | null;
  integrityRisk: number | null;
  turns: number;
}

export interface ReportTurn {
  id: string;
  turnIndex: number;
  question: string;
  answer: string;
  questionType: QuestionType;
  score: number | null;
  depthScore: number | null;
  confidenceScore: number | null;
  latencyMs: number | null;
  feedback: string | null;
  integrity: IntegrityEvidence | null;
}

export interface SessionReport {
  id: string;
  topic: string;
  status: "active" | "completed";
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  overallScore: number;
  depthScore: number;
  integrityRisk: number;
  verdict: "clear" | "review" | "flag";
  strongestSignals: EvidenceSignal[];
  turns: ReportTurn[];
}
