import OpenAI, { toFile } from "openai";
import { NextResponse } from "next/server";

export const runtime = "edge";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const supportedTypes = new Set([
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/webm",
]);

function extensionFor(contentType: string) {
  if (contentType.includes("mp4")) return "m4a";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  return "webm";
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Speech transcription is not configured." },
        { status: 503 },
      );
    }

    const contentType = request.headers.get("Content-Type") ?? "";
    if (!contentType.startsWith("multipart/form-data")) {
      return NextResponse.json(
        { error: "Attach an audio recording to transcribe." },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "Attach an audio recording to transcribe." },
        { status: 400 },
      );
    }

    const baseType = audio.type.split(";")[0];

    if (!supportedTypes.has(baseType)) {
      return NextResponse.json(
        { error: "That audio format is not supported." },
        { status: 415 },
      );
    }

    if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Recordings must be between 1 byte and 10 MB." },
        { status: 413 },
      );
    }

    const upload = await toFile(
      Buffer.from(await audio.arrayBuffer()),
      `oral-exam-response.${extensionFor(baseType)}`,
      { type: baseType },
    );
    const openai = new OpenAI({ apiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: upload,
      model:
        process.env.OPENAI_TRANSCRIPTION_MODEL ??
        "gpt-4o-mini-transcribe",
      response_format: "json",
      prompt:
        "This is a technical oral exam answer. Preserve technical terms, acronyms, and protocol names accurately.",
    });
    const text = transcription.text.trim();

    if (!text) {
      return NextResponse.json(
        { error: "No speech was detected. Try recording again." },
        { status: 422 },
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Failed to transcribe oral exam audio", error);
    return NextResponse.json(
      { error: "The recording could not be transcribed. You can still type." },
      { status: 500 },
    );
  }
}
