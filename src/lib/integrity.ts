import { embedTexts } from "@/lib/examiner";
import type {
  EvidenceKey,
  EvidenceSignal,
  EvidenceStatus,
  IntegrityEvidence,
  ResponseRow,
  TurnEvaluation,
} from "@/lib/exam";

const SIGNAL_WEIGHTS: Record<EvidenceKey, number> = {
  reference_similarity: 0.2,
  depth_decay: 0.35,
  consistency: 0.35,
  latency: 0.1,
};

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundPercent(value: number) {
  return Math.round(clamp(value * 100));
}

function statusForRisk(risk: number): EvidenceStatus {
  if (risk >= 65) return "flag";
  if (risk >= 35) return "review";
  return "clear";
}

function truncate(value: string, maxLength = 150) {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1).trim()}…`;
}

function cosineSimilarity(left: number[], right: number[]) {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function phraseOverlap(left: string, right: string) {
  const toBigrams = (value: string) => {
    const tokens = words(value);
    return new Set(
      tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`),
    );
  };

  const leftBigrams = toBigrams(left);
  const rightBigrams = toBigrams(right);
  const smallerSize = Math.min(leftBigrams.size, rightBigrams.size);

  if (smallerSize === 0) return 0;

  let overlap = 0;
  for (const phrase of leftBigrams) {
    if (rightBigrams.has(phrase)) overlap += 1;
  }

  return overlap / smallerSize;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function pendingSignal(
  key: EvidenceKey,
  label: string,
  summary: string,
): EvidenceSignal {
  return {
    key,
    label,
    status: "pending",
    risk: null,
    summary,
    metrics: [],
    evidence: [],
  };
}

function calculateOverallRisk(signals: EvidenceSignal[]) {
  const available = signals.filter(
    (signal): signal is EvidenceSignal & { risk: number } =>
      signal.risk !== null,
  );
  const weight = available.reduce(
    (total, signal) => total + SIGNAL_WEIGHTS[signal.key],
    0,
  );

  if (weight === 0) return 0;

  const weightedRisk =
    available.reduce(
      (total, signal) =>
        total + signal.risk * SIGNAL_WEIGHTS[signal.key],
      0,
    ) / weight;
  const hasStrongSignal = available.some(
    (signal) =>
      signal.key === "depth_decay" || signal.key === "consistency",
  );

  return Math.round(hasStrongSignal ? weightedRisk : Math.min(49, weightedRisk));
}

function verdictForRisk(risk: number): IntegrityEvidence["verdict"] {
  if (risk >= 65) return "flag";
  if (risk >= 35) return "review";
  return "clear";
}

interface ComputeIntegrityInput {
  answer: string;
  referenceAnswer: string;
  latencyMs: number;
  priorLatencies: number[];
  evaluation: TurnEvaluation;
  followUpTarget?: ResponseRow;
  consistencyTarget?: ResponseRow;
}

export async function computeIntegrityEvidence(
  input: ComputeIntegrityInput,
): Promise<IntegrityEvidence> {
  let referenceSimilarity: number | null = null;
  let answerConsistencySimilarity: number | null = null;

  try {
    const embeddingInputs = [input.answer, input.referenceAnswer];
    if (input.consistencyTarget) {
      embeddingInputs.push(input.consistencyTarget.answer);
    }

    const embeddings = await embedTexts(embeddingInputs);
    referenceSimilarity = cosineSimilarity(embeddings[0], embeddings[1]);

    if (input.consistencyTarget && embeddings[2]) {
      answerConsistencySimilarity = cosineSimilarity(
        embeddings[0],
        embeddings[2],
      );
    }
  } catch (error) {
    console.error("Failed to compute embedding evidence", error);
  }

  const overlap = phraseOverlap(input.answer, input.referenceAnswer);
  const answerWordCount = words(input.answer).length;
  const referenceRisk =
    referenceSimilarity === null
      ? null
      : Math.round(
          clamp(
            ((overlap - 0.25) / 0.55) * 85 +
              (referenceSimilarity > 0.94
                ? ((referenceSimilarity - 0.94) / 0.06) * 15
                : 0),
          ) * (answerWordCount < 12 ? 0.6 : 1),
        );

  const referenceSignal: EvidenceSignal =
    referenceRisk === null
      ? pendingSignal(
          "reference_similarity",
          "Reference similarity",
          "Embedding comparison was unavailable for this answer.",
        )
      : {
          key: "reference_similarity",
          label: "Reference similarity",
          status: statusForRisk(referenceRisk),
          risk: referenceRisk,
          summary:
            referenceRisk >= 65
              ? "The response closely follows the independently generated reference wording."
              : referenceRisk >= 35
                ? "Some reference phrasing overlaps and is worth a closer look."
                : "The response appears independently phrased.",
          metrics: [
            {
              label: "Meaning match",
              value: `${roundPercent(referenceSimilarity ?? 0)}%`,
            },
            {
              label: "Phrase overlap",
              value: `${roundPercent(overlap)}%`,
            },
          ],
          evidence: [
            `Student: “${truncate(input.answer)}”`,
            `Private reference: “${truncate(input.referenceAnswer)}”`,
          ],
        };

  let depthSignal = pendingSignal(
    "depth_decay",
    "Depth under pressure",
    "A linked follow-up is needed before depth decay can be measured.",
  );

  if (
    input.followUpTarget &&
    input.followUpTarget.depth_score !== null &&
    input.followUpTarget.score !== null
  ) {
    const depthDrop =
      input.followUpTarget.depth_score - input.evaluation.depthScore;
    const scoreDrop =
      input.followUpTarget.score - input.evaluation.overallScore;
    const depthRisk = Math.round(
      clamp(Math.max(0, depthDrop) * 24 + Math.max(0, scoreDrop) * 8),
    );

    depthSignal = {
      key: "depth_decay",
      label: "Depth under pressure",
      status: statusForRisk(depthRisk),
      risk: depthRisk,
      summary:
        depthDrop >= 3
          ? "Understanding dropped substantially when the examiner pressed deeper."
          : depthDrop >= 1
            ? "The follow-up exposed a modest loss of depth."
            : "Depth held steady under follow-up pressure.",
      metrics: [
        {
          label: "Initial depth",
          value: `${input.followUpTarget.depth_score}/10`,
        },
        {
          label: "Follow-up depth",
          value: `${input.evaluation.depthScore}/10`,
        },
        {
          label: "Change",
          value: `${depthDrop > 0 ? "−" : "+"}${Math.abs(depthDrop)}`,
        },
      ],
      evidence: [
        `Initial: “${truncate(input.followUpTarget.answer)}”`,
        `Under pressure: “${truncate(input.answer)}”`,
      ],
    };
  }

  let consistencySignal = pendingSignal(
    "consistency",
    "Cross-question consistency",
    "A differently worded re-check will appear later in the exam.",
  );

  if (input.consistencyTarget && input.evaluation.consistencyCheck) {
    const check = input.evaluation.consistencyCheck;
    const similarityPenalty =
      answerConsistencySimilarity === null
        ? 0
        : clamp((0.72 - answerConsistencySimilarity) * 100);
    const consistencyRisk = Math.round(
      check.contradictionDetected
        ? Math.max(70, similarityPenalty)
        : Math.min(30, similarityPenalty),
    );

    consistencySignal = {
      key: "consistency",
      label: "Cross-question consistency",
      status: statusForRisk(consistencyRisk),
      risk: consistencyRisk,
      summary: check.explanation,
      metrics: [
        {
          label: "Meaning alignment",
          value:
            answerConsistencySimilarity === null
              ? "Unavailable"
              : `${roundPercent(answerConsistencySimilarity)}%`,
        },
        {
          label: "Contradiction",
          value: check.contradictionDetected ? "Detected" : "None",
        },
      ],
      evidence: [
        ...check.alignedClaims.map((claim) => `Aligned: ${claim}`),
        ...check.conflictingClaims.map((claim) => `Conflict: ${claim}`),
      ],
    };
  }

  const seconds = Math.max(0.1, input.latencyMs / 1_000);
  const priorMedian = median(input.priorLatencies);
  let latencyRisk = 0;

  if (seconds < 3 && answerWordCount >= 15) {
    latencyRisk = 70;
  } else if (seconds < 6 && answerWordCount >= 30) {
    latencyRisk = 55;
  } else if (seconds < 10 && answerWordCount >= 60) {
    latencyRisk = 45;
  } else if (
    priorMedian !== null &&
    input.latencyMs < priorMedian * 0.35 &&
    answerWordCount >= 25
  ) {
    latencyRisk = 35;
  }

  const latencySignal: EvidenceSignal = {
    key: "latency",
    label: "Response timing",
    status: statusForRisk(latencyRisk),
    risk: latencyRisk,
    summary:
      latencyRisk >= 65
        ? "A long response arrived unusually quickly; timing is weak evidence and is never decisive alone."
        : latencyRisk >= 35
          ? "This answer was much faster than the session baseline."
          : "Response timing is within a plausible range.",
    metrics: [
      { label: "Response time", value: `${Math.round(seconds)}s` },
      { label: "Answer length", value: `${answerWordCount} words` },
      ...(priorMedian === null
        ? []
        : [
            {
              label: "Prior median",
              value: `${Math.round(priorMedian / 1_000)}s`,
            },
          ]),
    ],
    evidence: [
      `${answerWordCount} words were submitted after ${Math.round(seconds)} seconds.`,
    ],
  };

  const signals = [
    referenceSignal,
    depthSignal,
    consistencySignal,
    latencySignal,
  ];
  const overallRisk = calculateOverallRisk(signals);

  return {
    overallRisk,
    verdict: verdictForRisk(overallRisk),
    signals,
  };
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

export function aggregateIntegrityRisk(
  priorResponses: ResponseRow[],
  current: IntegrityEvidence,
) {
  const allEvidence = [
    ...priorResponses
      .map((response) => response.signal_scores)
      .filter(isIntegrityEvidence),
    current,
  ];
  const strongestSignals = new Map<EvidenceKey, EvidenceSignal>();

  for (const evidence of allEvidence) {
    for (const signal of evidence.signals) {
      if (signal.risk === null) continue;
      const existing = strongestSignals.get(signal.key);
      if (!existing || (existing.risk ?? -1) < signal.risk) {
        strongestSignals.set(signal.key, signal);
      }
    }
  }

  return calculateOverallRisk([...strongestSignals.values()]);
}
