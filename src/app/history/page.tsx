import type { Metadata } from "next";
import SessionHistory from "@/components/session-history";

export const metadata: Metadata = {
  title: "Session history — Viva",
  description: "Review past oral exams and their integrity evidence.",
};

export default function HistoryPage() {
  return <SessionHistory />;
}
