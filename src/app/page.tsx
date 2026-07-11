const foundations = [
  {
    label: "Session memory",
    detail: "Butterbase",
    status: "Ready",
  },
  {
    label: "Adaptive examiner",
    detail: "OpenAI",
    status: "Configured",
  },
  {
    label: "Natural voice",
    detail: "ElevenLabs",
    status: "Configured",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-7 sm:px-10 lg:px-16">
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[var(--foreground)] text-sm font-bold text-[var(--accent)]">
            V
          </span>
          <span className="text-lg font-semibold tracking-tight">Viva</span>
        </div>
        <span className="rounded-full border border-[var(--line)] bg-white/60 px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
          Foundation ready
        </span>
      </header>

      <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Conversational oral exams
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.055em] sm:text-7xl lg:text-8xl">
            Understanding has a sound.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
            An adaptive AI examiner that follows the reasoning, presses for
            depth, and shows the evidence behind every integrity signal.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <span className="rounded-full bg-[var(--foreground)] px-6 py-3 text-sm font-semibold text-white">
              Exam experience coming next
            </span>
            <span className="text-sm text-[var(--muted)]">
              Text first, voice ready when you are.
            </span>
          </div>
        </div>

        <aside className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-5 shadow-[0_24px_80px_rgb(24_32_29/0.08)] backdrop-blur sm:p-7">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">System foundation</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Core services connected
              </p>
            </div>
            <span className="size-3 rounded-full bg-[var(--accent)] ring-4 ring-[var(--accent)]/30" />
          </div>

          <div className="space-y-3">
            {foundations.map((foundation) => (
              <div
                key={foundation.label}
                className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white px-4 py-4"
              >
                <div>
                  <p className="text-sm font-medium">{foundation.label}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {foundation.detail}
                  </p>
                </div>
                <span className="rounded-full bg-[#eef5cf] px-2.5 py-1 text-xs font-semibold text-[#4b5820]">
                  {foundation.status}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl bg-[var(--foreground)] p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/55">
              Guiding principle
            </p>
            <p className="mt-3 text-lg leading-7">
              Every flag needs evidence. No opaque “BS probability.”
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
