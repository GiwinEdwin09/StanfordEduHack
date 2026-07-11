import type { Metadata } from "next";
import LearnerMemory from "@/components/learner-memory";

export const metadata: Metadata = {
  title: "Sofia's learning memory | Viva",
  description:
    "See the EverOS profile and learning episodes that personalize Sofia's oral exams.",
};

export default function MemoryPage() {
  return <LearnerMemory />;
}
