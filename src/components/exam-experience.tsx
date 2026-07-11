"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import EvidenceSignalCard, {
  evidenceTone,
} from "@/components/evidence-signal-card";
import type {
  IntegrityEvidence,
  PublicTurnEvaluation,
  QuestionType,
} from "@/lib/exam";

const topicOptions = [
  {
    name: "Computer Networks",
    description: "Protocols, reliability, and tradeoffs",
  },
  {
    name: "Data Structures",
    description: "Complexity, selection, and implementation",
  },
  {
    name: "Cell Biology",
    description: "Systems, mechanisms, and evidence",
  },
  {
    name: "Microeconomics",
    description: "Incentives, markets, and behavior",
  },
];

interface QuestionState {
  questionId: string;
  turnIndex: number;
  question: string;
  conceptTag: string;
  questionType: QuestionType;
  difficulty: number;
}

interface TranscriptTurn {
  question: QuestionState;
  answer: string;
  latencyMs: number;
  evaluation: PublicTurnEvaluation;
  integrity: IntegrityEvidence;
}

interface RunningScores {
  overall: number;
  depth: number;
  turns: number;
  integrityRisk: number;
}

interface StartExamResponse extends QuestionState {
  sessionId: string;
  participantId: string;
  topic: string;
  maxTurns: number;
  error?: string;
}

interface SubmitAnswerResponse {
  responseId: string;
  evaluation: PublicTurnEvaluation;
  integrity: IntegrityEvidence;
  runningScores: RunningScores;
  completed: boolean;
  next: QuestionState | null;
  error?: string;
}

type VoiceState =
  | "idle"
  | "loading"
  | "speaking"
  | "recording"
  | "transcribing";

function getParticipantId() {
  const key = "viva-participant-id";
  const existing = window.localStorage.getItem(key);

  if (existing) {
    return existing;
  }

  const created = window.crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function formatLatency(milliseconds: number) {
  return `${Math.max(1, Math.round(milliseconds / 1000))}s response`;
}

function scoreColor(score: number) {
  if (score >= 8) return "bg-[#dff5b1]";
  if (score >= 5) return "bg-[#fff0a8]";
  return "bg-[#ffd5c9]";
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--muted)]">{label}</span>
        <span className="font-semibold">{score}/10</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#e7e8e1]">
        <div
          className="h-full rounded-full bg-[var(--foreground)] transition-[width] duration-500"
          style={{ width: `${score * 10}%` }}
        />
      </div>
    </div>
  );
}

export default function ExamExperience() {
  const [phase, setPhase] = useState<"setup" | "active" | "complete">(
    "setup",
  );
  const [topic, setTopic] = useState(topicOptions[0].name);
  const [customTopic, setCustomTopic] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [maxTurns, setMaxTurns] = useState(5);
  const [question, setQuestion] = useState<QuestionState | null>(null);
  const [answer, setAnswer] = useState("");
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [runningScores, setRunningScores] = useState<RunningScores | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const questionStartedAt = useRef(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const examinerAudio = useRef<HTMLAudioElement | null>(null);
  const examinerAudioUrl = useRef<string | null>(null);
  const speechAbort = useRef<AbortController | null>(null);

  const releaseExaminerAudio = useCallback(() => {
    speechAbort.current?.abort();
    speechAbort.current = null;

    const audio = examinerAudio.current;
    examinerAudio.current = null;

    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
    }

    const objectUrl = examinerAudioUrl.current;
    examinerAudioUrl.current = null;

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }, []);

  const playQuestion = useCallback(
    async (text: string) => {
      releaseExaminerAudio();
      const controller = new AbortController();
      let audio: HTMLAudioElement | null = null;
      speechAbort.current = controller;
      setError(null);
      setVoiceState("loading");

      try {
        const response = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          throw new Error(
            data.error ?? "The examiner voice is currently unavailable.",
          );
        }

        const objectUrl = URL.createObjectURL(await response.blob());
        if (controller.signal.aborted) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        speechAbort.current = null;
        audio = new Audio(objectUrl);
        examinerAudioUrl.current = objectUrl;
        examinerAudio.current = audio;
        audio.onplay = () => {
          if (examinerAudio.current === audio) {
            setVoiceState("speaking");
          }
        };
        audio.onended = () => {
          if (examinerAudio.current !== audio) return;
          releaseExaminerAudio();
          setVoiceState("idle");
        };
        audio.onerror = () => {
          if (examinerAudio.current !== audio) return;
          releaseExaminerAudio();
          setVoiceState("idle");
          setError("The question audio could not be played. Text mode is ready.");
        };
        await audio.play();
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        const isCurrentPlayback =
          audio === null
            ? speechAbort.current === controller
            : examinerAudio.current === audio;

        if (!isCurrentPlayback) return;

        releaseExaminerAudio();
        setVoiceState("idle");
        setError(
          caught instanceof Error
            ? caught.message
            : "The examiner voice is currently unavailable.",
        );
      }
    },
    [releaseExaminerAudio],
  );

  useEffect(() => {
    if (phase !== "active") return;

    const timer = window.setInterval(() => {
      setElapsedSeconds(
        Math.floor((Date.now() - questionStartedAt.current) / 1000),
      );
    }, 500);

    return () => window.clearInterval(timer);
  }, [phase, question?.turnIndex]);

  useEffect(
    () => () => {
      if (
        mediaRecorder.current &&
        mediaRecorder.current.state !== "inactive"
      ) {
        mediaRecorder.current.onstop = null;
        mediaRecorder.current.stop();
      }
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      releaseExaminerAudio();
    },
    [releaseExaminerAudio],
  );

  async function transcribeRecording(recording: Blob) {
    setVoiceState("transcribing");

    try {
      const formData = new FormData();
      const extension = recording.type.includes("mp4") ? "m4a" : "webm";
      formData.append("audio", recording, `response.${extension}`);
      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        text?: string;
        error?: string;
      };

      if (!response.ok || !data.text) {
        throw new Error(data.error ?? "The recording could not be transcribed.");
      }

      setAnswer((current) =>
        current.trim() ? `${current.trim()} ${data.text}` : data.text!,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The recording could not be transcribed. You can still type.",
      );
    } finally {
      setVoiceState("idle");
    }
  }

  async function startRecording() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "This browser does not support microphone recording. Continue by typing.",
      );
      return;
    }

    releaseExaminerAudio();
    setVoiceState("loading");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const preferredType = MediaRecorder.isTypeSupported(
        "audio/webm;codecs=opus",
      )
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);

      mediaStream.current = stream;
      mediaRecorder.current = recorder;
      audioChunks.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || preferredType || "audio/webm";
        const recording = new Blob(audioChunks.current, { type });
        stream.getTracks().forEach((track) => track.stop());
        mediaStream.current = null;
        mediaRecorder.current = null;
        void transcribeRecording(recording);
      };
      recorder.start(250);
      setVoiceState("recording");
    } catch (caught) {
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      mediaStream.current = null;
      mediaRecorder.current = null;
      setVoiceState("idle");
      setError(
        caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "Microphone access was denied. Allow access or continue by typing."
          : "The microphone could not start. Continue by typing.",
      );
    }
  }

  function stopRecording() {
    if (
      mediaRecorder.current &&
      mediaRecorder.current.state !== "inactive"
    ) {
      mediaRecorder.current.stop();
    }
  }

  function toggleVoiceMode() {
    if (voiceMode) {
      if (
        mediaRecorder.current &&
        mediaRecorder.current.state !== "inactive"
      ) {
        mediaRecorder.current.onstop = null;
        mediaRecorder.current.stop();
      }
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      mediaRecorder.current = null;
      mediaStream.current = null;
      releaseExaminerAudio();
      setVoiceState("idle");
    } else if (question) {
      void playQuestion(question.question);
    }

    setVoiceMode((current) => !current);
  }

  async function startExam() {
    const selectedTopic = topic.trim();
    if (selectedTopic.length < 2) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: selectedTopic,
          participantId: getParticipantId(),
        }),
      });
      const data = (await response.json()) as StartExamResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Could not start the exam.");
      }

      setSessionId(data.sessionId);
      setMaxTurns(data.maxTurns);
      setQuestion({
        questionId: data.questionId,
        turnIndex: data.turnIndex,
        question: data.question,
        conceptTag: data.conceptTag,
        questionType: data.questionType,
        difficulty: data.difficulty,
      });
      setTranscript([]);
      setRunningScores(null);
      setAnswer("");
      setElapsedSeconds(0);
      questionStartedAt.current = Date.now();
      setPhase("active");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not start the exam.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer() {
    if (!sessionId || !question || answer.trim().length < 2) return;

    const submittedAnswer = answer.trim();
    const latencyMs = Date.now() - questionStartedAt.current;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/exams/${sessionId}/responses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: question.questionId,
            answer: submittedAnswer,
            latencyMs,
          }),
        },
      );
      const data = (await response.json()) as SubmitAnswerResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Could not evaluate the answer.");
      }

      setTranscript((current) => [
        ...current,
        {
          question,
          answer: submittedAnswer,
          latencyMs,
          evaluation: data.evaluation,
          integrity: data.integrity,
        },
      ]);
      setRunningScores(data.runningScores);
      setAnswer("");

      if (data.completed || !data.next) {
        setQuestion(null);
        setPhase("complete");
      } else {
        setQuestion(data.next);
        setElapsedSeconds(0);
        questionStartedAt.current = Date.now();
        if (voiceMode) {
          void playQuestion(data.next.question);
        }
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not evaluate the answer.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetExam() {
    if (
      mediaRecorder.current &&
      mediaRecorder.current.state !== "inactive"
    ) {
      mediaRecorder.current.onstop = null;
      mediaRecorder.current.stop();
    }
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    mediaRecorder.current = null;
    mediaStream.current = null;
    releaseExaminerAudio();
    setPhase("setup");
    setSessionId(null);
    setQuestion(null);
    setTranscript([]);
    setRunningScores(null);
    setAnswer("");
    setError(null);
    setElapsedSeconds(0);
    setVoiceMode(false);
    setVoiceState("idle");
  }

  const latestTurn = transcript.at(-1);
  const progress = question
    ? ((question.turnIndex - 1) / maxTurns) * 100
    : 100;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-5 py-5 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-5">
        <button
          type="button"
          onClick={resetExam}
          className="flex items-center gap-3 text-left"
          aria-label="Return to Viva home"
        >
          <span className="grid size-9 place-items-center rounded-full bg-[var(--foreground)] text-sm font-bold text-[var(--accent)]">
            V
          </span>
          <span className="text-lg font-semibold tracking-tight">Viva</span>
        </button>
        <div className="flex items-center gap-3">
          {phase === "active" && question ? (
            <span className="hidden text-sm text-[var(--muted)] sm:block">
              Question {question.turnIndex} of {maxTurns}
            </span>
          ) : null}
          {phase !== "active" ? (
            <Link
              href="/history"
              className="text-sm font-medium text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              Session history
            </Link>
          ) : null}
          <span className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
            {phase === "setup"
              ? "Adaptive examiner"
              : phase === "active"
                ? "Exam in progress"
                : "Session complete"}
          </span>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-[#e6a995] bg-[#fff0eb] px-4 py-3 text-sm text-[#7c2d17]"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {phase === "setup" ? (
        <section className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1fr_0.9fr] lg:py-16">
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Conversational oral exams
            </p>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-7xl lg:text-8xl">
              Show what you understand.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
              The examiner adapts to every answer, probes the reasoning, and
              gives specific feedback as you go.
            </p>
            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              {["5 questions", "Adaptive depth", "Voice + text"].map(
                (item, index) => (
                  <div
                    key={item}
                    className="border-l border-[var(--line)] pl-3"
                  >
                    <p className="text-xs font-semibold text-[var(--muted)]">
                      0{index + 1}
                    </p>
                    <p className="mt-2 text-sm font-medium">{item}</p>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[var(--line)] bg-white/75 p-5 shadow-[0_24px_80px_rgb(24_32_29/0.08)] backdrop-blur sm:p-7">
            <div className="mb-6">
              <p className="text-lg font-semibold">Choose your subject</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Start broad. The examiner will find the depth.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {topicOptions.map((option) => {
                const selected =
                  topic === option.name && customTopic.length === 0;
                return (
                  <button
                    type="button"
                    key={option.name}
                    onClick={() => {
                      setTopic(option.name);
                      setCustomTopic("");
                    }}
                    className={`rounded-2xl border p-4 text-left transition ${
                      selected
                        ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                        : "border-[var(--line)] bg-white hover:border-[#929991]"
                    }`}
                  >
                    <span className="text-sm font-semibold">{option.name}</span>
                    <span
                      className={`mt-2 block text-xs leading-5 ${
                        selected ? "text-white/60" : "text-[var(--muted)]"
                      }`}
                    >
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Or enter any topic
              </span>
              <input
                value={customTopic}
                onChange={(event) => {
                  setCustomTopic(event.target.value);
                  setTopic(event.target.value);
                }}
                placeholder="e.g. TCP vs UDP"
                className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-[#a4aaa6] focus:border-[var(--foreground)]"
              />
            </label>

            <button
              type="button"
              disabled={loading || topic.trim().length < 2}
              onClick={startExam}
              className="mt-5 flex w-full items-center justify-between rounded-2xl bg-[var(--accent)] px-5 py-4 text-sm font-semibold text-[var(--foreground)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>{loading ? "Preparing examiner…" : "Begin oral exam"}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      ) : null}

      {phase === "active" && question ? (
        <section className="flex flex-1 flex-col py-6">
          <div className="h-1 overflow-hidden rounded-full bg-[#dedfd7]">
            <div
              className="h-full rounded-full bg-[var(--foreground)] transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="grid flex-1 gap-6 pt-6 lg:grid-cols-[1fr_360px]">
            <div className="flex min-h-[620px] flex-col rounded-[2rem] border border-[var(--line)] bg-white/75 p-5 sm:p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#edf0e9] px-3 py-1 text-xs font-semibold capitalize">
                    {question.questionType.replace("_", " ")}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    Difficulty {question.difficulty}/5
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-pressed={voiceMode}
                    onClick={toggleVoiceMode}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      voiceMode
                        ? "bg-[var(--foreground)] text-white"
                        : "border border-[var(--line)] bg-white text-[var(--muted)]"
                    }`}
                  >
                    {voiceMode ? "Voice on" : "Voice mode"}
                  </button>
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {elapsedSeconds}s
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-center py-10">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Examiner
                </p>
                <h2 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl lg:text-5xl">
                  {question.question}
                </h2>
                {voiceMode ? (
                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          voiceState === "speaking" ||
                          voiceState === "loading"
                        ) {
                          releaseExaminerAudio();
                          setVoiceState("idle");
                        } else {
                          void playQuestion(question.question);
                        }
                      }}
                      disabled={
                        voiceState === "recording" ||
                        voiceState === "transcribing"
                      }
                      className="rounded-full border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                    >
                      {voiceState === "speaking" || voiceState === "loading"
                        ? "Stop question audio"
                        : "Replay question"}
                    </button>
                    <button
                      type="button"
                      onClick={
                        voiceState === "recording"
                          ? stopRecording
                          : startRecording
                      }
                      disabled={
                        voiceState === "transcribing" ||
                        voiceState === "speaking" ||
                        voiceState === "loading"
                      }
                      className={`rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
                        voiceState === "recording"
                          ? "bg-[#ff6b55] text-white"
                          : "bg-[var(--accent)] text-[var(--foreground)]"
                      }`}
                    >
                      {voiceState === "recording"
                        ? "Stop recording"
                        : voiceState === "transcribing"
                          ? "Transcribing…"
                          : "Record answer"}
                    </button>
                    <span className="text-xs text-[var(--muted)]">
                      {voiceState === "recording"
                        ? "Listening — speak naturally"
                        : voiceState === "transcribing"
                          ? "Turning speech into editable text"
                          : "Your transcript stays editable before submission"}
                    </span>
                  </div>
                ) : null}
              </div>

              <div>
                <label htmlFor="answer" className="sr-only">
                  Your answer
                </label>
                <textarea
                  id="answer"
                  value={answer}
                  disabled={
                    loading ||
                    voiceState === "recording" ||
                    voiceState === "transcribing"
                  }
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.metaKey || event.ctrlKey)
                    ) {
                      event.preventDefault();
                      void submitAnswer();
                    }
                  }}
                  placeholder="Explain your reasoning in your own words…"
                  rows={5}
                  autoFocus
                  className="w-full resize-none rounded-2xl border border-[var(--line)] bg-[#fafaf7] px-4 py-4 text-base leading-7 outline-none transition placeholder:text-[#a4aaa6] focus:border-[var(--foreground)] disabled:opacity-60"
                />
                <div className="mt-3 flex items-center justify-between gap-4">
                  <span className="hidden text-xs text-[var(--muted)] sm:block">
                    Press ⌘ Enter to submit
                  </span>
                  <button
                    type="button"
                    onClick={submitAnswer}
                    disabled={
                      loading ||
                      voiceState === "recording" ||
                      voiceState === "transcribing" ||
                      answer.trim().length < 2
                    }
                    className="ml-auto rounded-full bg-[var(--foreground)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#2c3934] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? "Evaluating…" : "Submit answer"}
                  </button>
                </div>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Live evaluation</p>
                  {latestTurn ? (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${scoreColor(latestTurn.evaluation.overallScore)}`}
                    >
                      {latestTurn.evaluation.overallScore}/10
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">Waiting</span>
                  )}
                </div>

                {latestTurn ? (
                  <>
                    <div className="mt-6 space-y-5">
                      <ScoreBar
                        label="Correctness"
                        score={latestTurn.evaluation.correctnessScore}
                      />
                      <ScoreBar
                        label="Depth"
                        score={latestTurn.evaluation.depthScore}
                      />
                      <ScoreBar
                        label="Reasoning"
                        score={latestTurn.evaluation.reasoningScore}
                      />
                    </div>
                    <div className="mt-6 border-t border-[var(--line)] pt-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Examiner note
                      </p>
                      <p className="mt-2 text-sm leading-6">
                        {latestTurn.evaluation.feedback}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
                    Your score breakdown and specific feedback will appear
                    after each answer.
                  </p>
                )}
              </div>

              <div className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Evidence monitor</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Signals with receipts
                    </p>
                  </div>
                  {latestTurn ? (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${evidenceTone(latestTurn.integrity.verdict)}`}
                    >
                      {latestTurn.integrity.overallRisk} risk
                    </span>
                  ) : null}
                </div>
                {latestTurn ? (
                  <div className="mt-4 space-y-2">
                    {latestTurn.integrity.signals.map((signal) => (
                      <EvidenceSignalCard
                        key={signal.key}
                        signal={signal}
                        compact
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
                    Reference wording, depth decay, consistency, and timing
                    will be evaluated independently.
                  </p>
                )}
              </div>

              <div className="rounded-[2rem] bg-[var(--foreground)] p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                  Session average
                </p>
                <div className="mt-4 flex items-end justify-between">
                  <span className="text-4xl font-semibold tracking-tight">
                    {runningScores?.overall ?? "—"}
                  </span>
                  <span className="pb-1 text-xs text-white/50">out of 10</span>
                </div>
                <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-5 text-white/60">
                  Integrity evidence risk:{" "}
                  <strong>{runningScores?.integrityRisk ?? "—"}</strong>. No
                  single weak signal can determine the result.
                </p>
              </div>
            </aside>
          </div>

          {transcript.length > 0 ? (
            <div className="mt-6 rounded-[2rem] border border-[var(--line)] bg-white/55 p-5 sm:p-7">
              <p className="mb-5 text-sm font-semibold">Session trail</p>
              <div className="grid gap-4 lg:grid-cols-2">
                {transcript.map((turn) => (
                  <article
                    key={turn.question.turnIndex}
                    className="rounded-2xl border border-[var(--line)] bg-white p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--muted)]">
                        Q{turn.question.turnIndex}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {formatLatency(turn.latencyMs)}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm font-medium leading-6">
                      {turn.question.question}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
                      {turn.answer}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {phase === "complete" ? (
        <section className="flex flex-1 items-center py-10">
          <div className="grid w-full gap-8 lg:grid-cols-[0.75fr_1.25fr]">
            <div className="rounded-[2rem] bg-[var(--foreground)] p-7 text-white sm:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
                Exam complete
              </p>
              <p className="mt-7 text-7xl font-semibold tracking-[-0.06em]">
                {runningScores?.overall ?? "—"}
              </p>
              <p className="mt-2 text-sm text-white/55">overall understanding</p>
              <div className="mt-10 grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
                <div>
                  <p className="text-2xl font-semibold">
                    {runningScores?.depth ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-white/50">Average depth</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {runningScores?.turns ?? transcript.length}
                  </p>
                  <p className="mt-1 text-xs text-white/50">Answers assessed</p>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-semibold">
                      {runningScores?.integrityRisk ?? "—"}
                      <span className="text-sm text-white/40">/100</span>
                    </p>
                    <p className="mt-1 text-xs text-white/50">
                      Evidence-based integrity risk
                    </p>
                  </div>
                  <span className="text-xs text-white/40">
                    strongest signals
                  </span>
                </div>
              </div>
              <div className="mt-10 space-y-3">
                {sessionId ? (
                  <Link
                    href={`/report/${sessionId}`}
                    className="block w-full rounded-full bg-[var(--accent)] px-5 py-3 text-center text-sm font-semibold text-[var(--foreground)]"
                  >
                    Open full integrity report
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={resetExam}
                  className="w-full rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white"
                >
                  Start another exam
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-5 sm:p-8">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-lg font-semibold">Answer review</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Scores and evidence behind every signal
                  </p>
                </div>
                <span className="text-xs text-[var(--muted)]">
                  {transcript.length} turns
                </span>
              </div>
              <div className="mt-6 max-h-[570px] space-y-3 overflow-y-auto pr-1">
                {transcript.map((turn) => (
                  <article
                    key={turn.question.turnIndex}
                    className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                        Question {turn.question.turnIndex}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${scoreColor(turn.evaluation.overallScore)}`}
                      >
                        {turn.evaluation.overallScore}/10
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-medium leading-6">
                      {turn.question.question}
                    </p>
                    <p className="mt-3 border-l-2 border-[var(--line)] pl-3 text-sm leading-6 text-[var(--muted)]">
                      {turn.answer}
                    </p>
                    <p className="mt-4 rounded-xl bg-[#f3f4ee] px-3 py-2.5 text-xs leading-5">
                      {turn.evaluation.feedback}
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
