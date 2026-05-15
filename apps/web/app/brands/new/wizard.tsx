"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  STEPS,
  WIZARD_DRAFT_KEY,
  WizardSchema,
  wizardDefaults,
  type WizardData,
} from "./schema";
import { StepBasics } from "./steps/step-basics";
import { StepVoice } from "./steps/step-voice";
import { StepWordGuards } from "./steps/step-word-guards";
import { StepVoc } from "./steps/step-voc";
import { StepSeo } from "./steps/step-seo";
import { StepApproval } from "./steps/step-approval";
import { StepReview } from "./steps/step-review";
import { createBrand, type CreateBrandResult } from "./actions";

const STEP_BODY: Record<(typeof STEPS)[number]["id"], React.ComponentType> = {
  basics: StepBasics,
  voice: StepVoice,
  "word-guards": StepWordGuards,
  voc: StepVoc,
  seo: StepSeo,
  approval: StepApproval,
  review: StepReview,
};

export function BrandWizard() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const methods = useForm<WizardData>({
    resolver: zodResolver(WizardSchema),
    defaultValues: wizardDefaults,
    mode: "onBlur",
  });

  // Hydrate from localStorage draft.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(WIZARD_DRAFT_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      // Use reset so default values don't clobber later watchers.
      methods.reset({ ...wizardDefaults, ...parsed });
    } catch {
      window.localStorage.removeItem(WIZARD_DRAFT_KEY);
    }
  }, [methods]);

  // Autosave drafts on every change. A4 (plan-eng-review).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sub = methods.watch((values) => {
      window.localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(values));
    });
    return () => sub.unsubscribe();
  }, [methods]);

  const step = STEPS[stepIndex];
  const Body = STEP_BODY[step.id];
  const isLast = stepIndex === STEPS.length - 1;

  async function handleNext() {
    setSubmitError(null);
    // Validate only fields belonging to the current step's sub-schema.
    if ("schema" in step && step.schema) {
      const fieldNames = Object.keys(step.schema.shape) as Array<keyof WizardData>;
      const ok = await methods.trigger(fieldNames as never);
      if (!ok) return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function handleBack() {
    setSubmitError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function handleSubmitFinal() {
    setSubmitError(null);
    startTransition(async () => {
      const ok = await methods.trigger();
      if (!ok) {
        setSubmitError("Please review highlighted fields.");
        return;
      }
      const values = methods.getValues();
      const res: CreateBrandResult = await createBrand(values);
      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }
      window.localStorage.removeItem(WIZARD_DRAFT_KEY);
      router.replace(`/dashboard?brand=${res.brandId}`);
    });
  }

  return (
    <FormProvider {...methods}>
      <Card>
        <CardHeader>
          <CardTitle>{step.label}</CardTitle>
          <CardDescription>
            Step {stepIndex + 1} of {STEPS.length}
          </CardDescription>
          <div className="mt-3 flex flex-wrap gap-1">
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 flex-1 min-w-[20px] rounded-full ${
                  i <= stepIndex ? "bg-foreground" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <Body />
          {submitError && (
            <p className="mt-4 text-sm text-destructive">{submitError}</p>
          )}
          <Separator className="my-6" />
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={stepIndex === 0 || pending}
            >
              Back
            </Button>
            {isLast ? (
              <Button type="button" onClick={handleSubmitFinal} disabled={pending}>
                {pending ? "Creating…" : "Create brand"}
              </Button>
            ) : (
              <Button type="button" onClick={handleNext}>
                Next
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </FormProvider>
  );
}
