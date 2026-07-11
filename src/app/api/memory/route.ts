import { NextResponse } from "next/server";
import { getLearnerMemory } from "@/lib/everos";

export const runtime = "edge";

export async function GET() {
  const memory = await getLearnerMemory();

  return NextResponse.json({
    memory: {
      available: memory.available,
      learner: memory.learner,
      episodes: memory.episodes,
      profiles: memory.profiles,
      highlights: memory.highlights,
      error: memory.error,
    },
  });
}
