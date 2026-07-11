import type { EvidenceSignal } from "@/lib/exam";

export function evidenceTone(status: EvidenceSignal["status"]) {
  if (status === "flag") return "bg-[#ffd5c9] text-[#7c2d17]";
  if (status === "review") return "bg-[#fff0a8] text-[#6b5311]";
  if (status === "clear") return "bg-[#dff5b1] text-[#365314]";
  return "bg-[#edf0e9] text-[var(--muted)]";
}

export default function EvidenceSignalCard({
  signal,
  compact = false,
}: {
  signal: EvidenceSignal;
  compact?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-[var(--line)] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold">{signal.label}</p>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${evidenceTone(signal.status)}`}
        >
          {signal.status}
        </span>
      </div>
      <p
        className={`${compact ? "line-clamp-2" : ""} mt-3 text-xs leading-5 text-[var(--muted)]`}
      >
        {signal.summary}
      </p>
      {signal.metrics.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {signal.metrics.map((metric) => (
            <span
              key={`${signal.key}-${metric.label}`}
              className="rounded-lg bg-[#f3f4ee] px-2 py-1 text-[10px]"
            >
              {metric.label}: <strong>{metric.value}</strong>
            </span>
          ))}
        </div>
      ) : null}
      {!compact && signal.evidence.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-[var(--line)] pt-3">
          {signal.evidence.map((item) => (
            <p key={item} className="text-[11px] leading-5 text-[var(--muted)]">
              {item}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}
