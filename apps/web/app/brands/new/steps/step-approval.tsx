"use client";

import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import type { WizardData } from "../schema";

type Option = {
  value: "manual" | "auto";
  title: string;
  description: string;
};

const OPTIONS: Option[] = [
  {
    value: "manual",
    title: "Manual approval",
    description:
      "Every generated post lands in pending_approval. You click Approve before publish.",
  },
  {
    value: "auto",
    title: "Auto-publish",
    description:
      "Generated post goes straight to draft. Riskier — recommended after dogfood phase.",
  },
];

export function StepApproval() {
  const { control } = useFormContext<WizardData>();
  return (
    <FormField
      control={control}
      name="approval_mode"
      render={({ field }) => (
        <FormItem className="space-y-3">
          <FormControl>
            <div className="grid gap-3">
              {OPTIONS.map((opt) => {
                const selected = field.value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => field.onChange(opt.value)}
                    className={`text-left rounded-md border p-4 transition-colors ${
                      selected
                        ? "border-foreground bg-accent"
                        : "border-input hover:border-foreground/50"
                    }`}
                  >
                    <div className="font-medium">{opt.title}</div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
