type Props = {
  currentStep: number;
  labels: readonly string[];
  className?: string;
};

export default function StepProgress({ currentStep, labels, className }: Props) {
  return (
    <div
      style={{
        width: "calc(100vw - var(--app-header-gutter))",
        maxWidth: "var(--app-header-max-width)",
      }}
      className={`relative left-1/2 mb-4 grid -translate-x-1/2 grid-cols-4 gap-1 rounded-b-2xl border-x border-b border-slate-300 bg-white px-4 pb-2 pt-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)] md:mb-5 md:gap-1.5 md:px-5 md:pb-3 ${className ?? ""}`}
      aria-label="Project progress"
    >
      {labels.map((label, index) => {
        const stepId = index + 1;
        const isCompleted = currentStep > stepId;
        const isCurrent = currentStep === stepId;

        return (
          <div key={label} className="min-w-0" aria-current={isCurrent ? "step" : undefined}>
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                isCompleted
                  ? "bg-slate-950"
                  : isCurrent
                    ? "bg-sky-600 shadow-[0_0_10px_rgba(2,132,199,0.35)]"
                    : "bg-slate-200"
              }`}
            />
            <span className="sr-only">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
