import Button from "@/app/components/ui/Button";

import { useEffect, useRef } from "react";

type Step = 1 | 2 | 3 | 4;

type Props = {
  currentStep: Step;
  maxReachedStep: Step;
  labels: {
    prev: string;
    next: string;
    titles: Record<Step, string>;
  };
  isNavigating?: boolean;
  nextStepRevealToken?: number;
  exitLabel: string;
  onPrevStep: () => void;
  onNextStep: () => void;
  onExit: () => void;
};

export default function CreateStepHeader({
  currentStep,
  maxReachedStep,
  labels,
  isNavigating = false,
  nextStepRevealToken = 0,
  exitLabel,
  onPrevStep,
  onNextStep,
  onExit,
}: Props) {
  const headerRef = useRef<HTMLDivElement>(null);
  const canAdvance = currentStep < 4 && currentStep < maxReachedStep;
  const isLastStep = currentStep === 4;

  useEffect(() => {
    if (!nextStepRevealToken || !canAdvance) return;

    const timer = window.setTimeout(() => {
      headerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [canAdvance, nextStepRevealToken]);

  return (
    <div ref={headerRef} className="mb-4 scroll-mt-4 space-y-3 sm:mb-5 sm:space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-5">
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {labels.titles[currentStep]}
          </h1>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-44">
          <Button
            type="button"
            onClick={onPrevStep}
            variant="secondary"
            className="w-full px-3 sm:px-4"
            disabled={isNavigating || currentStep === 1}
          >
            {labels.prev}
          </Button>

          <Button
            type="button"
            onClick={isLastStep ? onExit : onNextStep}
            className={`w-full px-3 sm:px-4 ${
              canAdvance && nextStepRevealToken
                ? "animate-[pulse_1.35s_ease-in-out_infinite] shadow-[0_0_0_3px_rgba(14,165,233,0.18),0_0_18px_rgba(14,165,233,0.3)]"
                : ""
            }`}
            disabled={isNavigating || (!isLastStep && !canAdvance)}
          >
            {isLastStep ? exitLabel : labels.next}
          </Button>
        </div>
      </div>
    </div>
  );
}



