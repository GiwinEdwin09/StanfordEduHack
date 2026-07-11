import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const speechRequestSchema = z.object({
  text: z.string().trim().min(1).max(2_000),
});

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Examiner voice is not configured." },
        { status: 503 },
      );
    }

    const parsed = speechRequestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide text between 1 and 2,000 characters." },
        { status: 400 },
      );
    }

    const voiceId =
      process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
    const modelId =
      process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5";
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: parsed.data.text,
          model_id: modelId,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
            style: 0,
            use_speaker_boost: true,
            speed: 1,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text();
      console.error("ElevenLabs TTS request failed", upstream.status, detail);
      return NextResponse.json(
        { error: "The examiner voice is unavailable. Continue in text mode." },
        { status: 502 },
      );
    }

    return new Response(upstream.body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": upstream.headers.get("Content-Type") ?? "audio/mpeg",
      },
    });
  } catch (error) {
    console.error("Failed to generate examiner speech", error);
    return NextResponse.json(
      { error: "The examiner voice is unavailable. Continue in text mode." },
      { status: 500 },
    );
  }
}
