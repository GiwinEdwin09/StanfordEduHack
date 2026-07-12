# Viva — Memory-Aware Oral Exam AI

**Viva** is an adaptive AI oral examiner that asks real follow-ups, scores understanding in the open, and flags integrity risks with **explainable evidence** — not a single opaque “cheating” score.

Live demo: [https://oral-exam-ai.butterbase.dev](https://oral-exam-ai.butterbase.dev)

Built for **Beta Hack – Reinvented Education** (Butterbase + EverOS). The demo learner is **Sofia Reyes**, a 10th-grade English student whose seeded writing history lets Viva assess *earned growth* across sessions.

---

## What it does

1. Runs a **5-turn conversational oral exam** on a topic you choose.
2. Scores each answer on correctness, depth, reasoning, examples, and confidence.
3. Adapts the next question (follow-up, deeper probe, or consistency check).
4. Computes **integrity signals** from embeddings, score trajectories, paraphrase consistency, and latency patterns.
5. Recalls **EverOS learner memory** so opening questions and feedback can reflect prior work — not just the latest answer.
6. Produces a printable **integrity report** and a **memory reveal** page that shows why longitudinal context matters.

Viva never shows private reference answers to the student. Integrity signals are for review; they do **not** accuse dishonesty on their own.

---

## How a session works

```
Pick topic → Start exam
    │
    ├─ Recall Sofia’s EverOS memory (if available)
    ├─ Generate opening question + private reference answer
    └─ Persist exam_session + exam_question in Butterbase
         │
         ▼
    Answer (text and/or voice) × up to 5 turns
         │
         ├─ Evaluate with OpenAI (scores + feedback + next question)
         ├─ Compute integrity evidence
         ├─ Save response; store turn in EverOS
         └─ After turn 3: force a consistency_check paraphrasing turn 1
         │
         ▼
    Complete → flush EverOS session → integrity report + history
```

### User surfaces

| Route | Purpose |
|-------|---------|
| `/` | Start an oral exam (presets or custom topic) |
| `/report/[sessionId]` | Full integrity report (printable) |
| `/history` | Past sessions for this browser profile |
| `/memory` | Sofia’s EverOS timeline (“memory reveal”) |

Participant identity is a UUID in `localStorage` (`viva-participant-id`). Reports and history are scoped to that ID.

---

## Tech stack

| Layer | Tool | Role |
|-------|------|------|
| App | **Next.js 15.5** (App Router), **React 19**, **TypeScript**, **Tailwind CSS 4** | UI + edge API routes |
| Validation | **Zod** | Request schemas |
| Database / API | **Butterbase** | Postgres tables via REST (`exam_sessions`, `exam_questions`, `responses`) |
| Reasoning | **OpenAI** | Structured examiner prompts, embeddings, transcription |
| Voice out | **ElevenLabs** | Examiner TTS (MP3 stream) |
| Memory | **EverOS** (`api.evermind.ai`) | Hybrid recall, turn ingest, flush, delete |
| Deploy | **Butterbase Edge SSR** + **`@cloudflare/next-on-pages`** | Cloudflare Workers at `*.butterbase.dev` |

All API routes and the report page use `export const runtime = "edge"` so they run on Workers.

---

## Project layout

```
├── data/sofia_reyes.json       # EverOS seed pack (4 writing sessions)
├── scripts/seed-everos.mjs     # Idempotent memory seed
├── public/_headers             # Cache headers for static assets
└── src/
    ├── app/                    # Pages + API routes
    ├── components/             # Exam UX, report, history, memory
    └── lib/
        ├── exam.ts             # Types, Zod schemas, turn limit
        ├── examiner.ts         # Opening Q + turn evaluation
        ├── integrity.ts        # Evidence signals + risk aggregation
        ├── everos.ts           # Memory client
        ├── butterbase.ts       # Table CRUD helper
        └── report.ts           # Report/history shapes
```

---

## API routes

| Method | Path | What it does |
|--------|------|----------------|
| `POST` | `/api/exams` | Start exam: recall memory → opening question → create session |
| `POST` | `/api/exams/[sessionId]/responses` | Submit answer: evaluate, integrity, persist, next Q or complete |
| `GET` | `/api/sessions?participantId=` | List recent sessions |
| `GET` | `/api/sessions/[sessionId]?participantId=` | Full session report |
| `DELETE` | `/api/sessions/[sessionId]?participantId=` | Delete incomplete session (+ EverOS cleanup) |
| `GET` | `/api/memory` | Sofia EverOS snapshot for `/memory` |
| `POST` | `/api/voice/speak` | ElevenLabs TTS → `audio/mpeg` |
| `POST` | `/api/voice/transcribe` | Multipart audio → OpenAI transcription |

---

## Data model (Butterbase)

### `exam_sessions`
Participant, topic, difficulty, status (`active` / `completed`), `final_scores` (overall, depth, turns, integrityRisk), timestamps.

### `exam_questions`
Turn index, question text, concept tag, type (`baseline` | `follow_up` | `deeper` | `consistency_check`), difficulty, **private** `reference_answer`, optional links to prior responses (`follow_up_of`, `paraphrase_of`).

### `responses`
Answer text, latency, scores, `signal_scores` (integrity evidence JSON), evaluation payload, canonical/paraphrase links.

---

## Examiner + integrity

### Adaptive questioning
- Low scores → clarifying follow-up
- Mid scores → neighboring concept
- High scores → deeper probe
- After the third answer, the next question is forced to a **consistency check** that paraphrases turn 1

### Integrity signals (`src/lib/integrity.ts`)

| Signal | Weight | Idea |
|--------|--------|------|
| `reference_similarity` | 0.20 | Embedding + phrase overlap vs private reference |
| `depth_decay` | 0.35 | Depth/overall drop vs linked parent answer |
| `consistency` | 0.35 | Contradiction / alignment vs paraphrase target |
| `latency` | 0.10 | Suspiciously fast long answers (weak alone) |

**Verdict:** risk ≥ 65 → `flag`, ≥ 35 → `review`, else `clear`. Session risk is a weighted mix of the strongest per-signal risks; if neither depth nor consistency has real evidence, overall risk is capped so latency/similarity alone cannot dominate.

---

## EverOS learner memory

Demo profile: **Sofia Reyes** (`EVEROS_LEARNER_ID=sofia_reyes`).

Her seeded arc (Essay 1 → 4 on *Of Mice and Men*) moves from plot summary to a strong analytical leap. That trajectory is the point: with memory, session 5 can treat growth as *earned*.

| Moment | Behavior |
|--------|----------|
| Exam start / each turn | Hybrid recall (episodic + profile) injected into examiner prompts |
| After each answer | Persist Q / A / feedback messages to EverOS |
| Exam complete | Flush session memory |
| Delete incomplete session | Delete that EverOS session |
| `/memory` | Reveal full timeline to judges / demos |

If EverOS is down, exams still run (`memory.available: false`).

Seed (idempotent):

```bash
npm run memory:seed
```

---

## Voice mode

1. Toggle voice → examiner question is spoken via ElevenLabs.
2. Record an answer → browser `MediaRecorder` → OpenAI transcription → editable text.
3. Submit uses the text answer and client-measured latency from when the question appeared.
4. Mic / TTS / STT failures fall back to text.

---

## Local setup

### Prerequisites
- Node.js 20+
- Accounts / keys for **OpenAI**, **Butterbase**, and optionally **ElevenLabs** + **EverOS**

### Steps

```bash
git clone git@github.com:GiwinEdwin09/StanfordEduHack.git
cd StanfordEduHack
npm install
cp .env.example .env.local
```

Fill `.env.local`:

| Variable | Required for |
|----------|----------------|
| `OPENAI_API_KEY` (+ optional model overrides) | Exams, integrity embeddings, transcription |
| `BUTTERBASE_API_URL`, `BUTTERBASE_API_KEY` | Persistence |
| `BUTTERBASE_APP_ID` | App identity / docs |
| `ELEVENLABS_API_KEY` (+ voice/model IDs) | Spoken questions |
| `EVEROS_API_KEY`, `EVEROS_API_URL`, `EVEROS_LEARNER_ID` | Memory-aware exams + `/memory` |

```bash
npm run memory:seed   # optional but recommended for the Sofia demo
npm run dev           # http://localhost:3000
```

**Minimum for a text exam:** OpenAI + Butterbase.  
**Voice:** add ElevenLabs.  
**Memory personalization / reveal:** add EverOS + seed.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Local Next.js dev server |
| `npm run build` | Production Next build |
| `npm run build:cloudflare` | `@cloudflare/next-on-pages` Worker bundle |
| `npm start` | Serve a Next production build |
| `npm run lint` | ESLint |
| `npm run memory:seed` | Seed Sofia’s EverOS history |

---

## Deploy (Butterbase Edge SSR)

1. Ensure edge runtime on APIs (already set).
2. Build: `npm run build:cloudflare`
3. Zip the **contents** of `.vercel/output/static` (must include `_worker.js`).
4. Upload via Butterbase Edge SSR (`manage_edge_ssr` create → PUT zip → start), or the Butterbase dashboard.
5. App-level env: set `OPENAI_*`, `ELEVENLABS_*`, `EVEROS_*`. Reserved `BUTTERBASE_*` keys are injected by the platform at runtime.

Production URL for this app: **https://oral-exam-ai.butterbase.dev**

---

## Demo tips

1. Open `/memory` first — show Sofia’s Essay 1→4 arc.
2. Start an exam on **Literary Analysis** (or a related topic).
3. Answer a few turns; point at live integrity cards and EverOS recall in the sidebar.
4. Finish and open the integrity report; optionally print-preview.
5. Jump-cut long evaluation waits in video demos.

---

## Design notes

- Brand-first cream UI with lime accent (`#e7ff70`); tagline *Show what you understand.*
- Preset topics: Literary Analysis, Computer Networks, Data Structures, Cell Biology, Microeconomics (+ freeform).
- Student answers and recalled memory are treated as **untrusted** content in prompts (never followed as instructions).

---

## License / ownership

Hackathon project by **Giwin Edwin**. Repo: [GiwinEdwin09/StanfordEduHack](https://github.com/GiwinEdwin09/StanfordEduHack).
