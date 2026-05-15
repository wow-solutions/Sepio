"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import type { WizardData } from "../schema";

export function StepVoiceSamples() {
  const { control } = useFormContext<WizardData>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "voice_samples",
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Optional. Paste 3-5 real LinkedIn posts that already sound like the
        brand. We use these to keep generated drafts in voice. Skip if you do
        not have samples yet — you can add them later.
      </p>

      {fields.map((f, idx) => (
        <div key={f.id} className="grid gap-2 rounded-md border border-input p-3">
          <FormField
            control={control}
            name={`voice_samples.${idx}.text` as const}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                  Sample {idx + 1}
                </FormLabel>
                <FormControl>
                  <Textarea rows={6} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={() => remove(idx)}>
              Remove
            </Button>
          </div>
        </div>
      ))}

      {fields.length < 5 && (
        <Button
          type="button"
          variant="outline"
          onClick={() => append({ text: "", source: "manual" })}
        >
          Add sample
        </Button>
      )}
    </div>
  );
}
