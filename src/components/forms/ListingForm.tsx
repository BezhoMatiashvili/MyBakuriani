"use client";

import { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ListingFormProps {
  steps: string[];
  currentStep: number;
  onStepChange: (step: number) => void;
  children: ReactNode;
}

export default function ListingForm({
  steps,
  currentStep,
  onStepChange,
  children,
}: ListingFormProps) {
  const totalSteps = steps.length;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="w-full space-y-8">
      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-brand-accent"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center">
        {steps.map((label, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;

          return (
            <div key={index} className="flex items-center">
              {/* Connector line */}
              {index > 0 && (
                <div
                  className={`h-0.5 w-8 sm:w-12 ${
                    index <= currentStep ? "bg-brand-accent" : "bg-muted"
                  }`}
                />
              )}

              {/* Step circle */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isCompleted) onStepChange(index);
                  }}
                  className={`flex size-9 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors ${
                    isCompleted
                      ? "cursor-pointer border-brand-accent bg-brand-accent text-white"
                      : isActive
                        ? "border-brand-accent bg-background text-brand-accent"
                        : "cursor-default border-muted bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="size-4" /> : index + 1}
                </button>
                <span
                  className={`hidden text-xs sm:block ${
                    isActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step content with animation */}
      <div className="relative min-h-[200px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => onStepChange(currentStep - 1)}
          disabled={currentStep === 0}
        >
          უკან
        </Button>

        <span className="text-sm text-muted-foreground">
          {currentStep + 1} / {totalSteps}
        </span>

        <Button
          onClick={() => onStepChange(currentStep + 1)}
          disabled={currentStep === totalSteps - 1}
        >
          შემდეგი
        </Button>
      </div>
    </div>
  );
}
