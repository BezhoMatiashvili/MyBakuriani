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
  const goToStep = (step: number) => {
    onStepChange(Math.max(0, Math.min(step, totalSteps - 1)));
  };

  return (
    <div className="w-full space-y-8">
      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
        <motion.div
          className="h-full rounded-full bg-[#2563EB]"
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
                    index <= currentStep ? "bg-[#2563EB]" : "bg-[#E2E8F0]"
                  }`}
                />
              )}

              {/* Step circle */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isCompleted) goToStep(index);
                  }}
                  className={`flex size-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors ${
                    isCompleted
                      ? "cursor-pointer border-[#2563EB] bg-[#2563EB] text-white"
                      : isActive
                        ? "border-[#2563EB] bg-white text-[#2563EB]"
                        : "cursor-default border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]"
                  }`}
                >
                  {isCompleted ? <Check className="size-4" /> : index + 1}
                </button>
                <span
                  className={`hidden text-xs sm:block ${
                    isActive ? "font-bold text-[#0F172A]" : "text-[#94A3B8]"
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
          onClick={() => goToStep(currentStep - 1)}
          disabled={currentStep === 0}
        >
          უკან
        </Button>

        <span className="text-sm text-[#94A3B8]">
          {currentStep + 1} / {totalSteps}
        </span>

        <Button
          onClick={() => goToStep(currentStep + 1)}
          disabled={currentStep === totalSteps - 1}
        >
          შემდეგი
        </Button>
      </div>
    </div>
  );
}
