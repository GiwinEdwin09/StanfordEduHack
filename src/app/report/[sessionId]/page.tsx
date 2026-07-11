import type { Metadata } from "next";
import IntegrityReport from "@/components/integrity-report";

export const metadata: Metadata = {
  title: "Integrity report — Viva",
  description: "Review the evidence behind an adaptive oral exam.",
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <IntegrityReport sessionId={sessionId} />;
}
