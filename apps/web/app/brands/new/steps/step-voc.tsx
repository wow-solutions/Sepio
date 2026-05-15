"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/tag-input";
import type { WizardData } from "../schema";

function QuoteList({
  name,
  quotePlaceholder,
}: {
  name: "voc_pain_points" | "voc_desired_outcomes";
  quotePlaceholder: string;
}) {
  const { control, register } = useFormContext<WizardData>();
  const { fields, append, remove } = useFieldArray({ control, name });
  return (
    <div className="space-y-3">
      {fields.map((f, idx) => (
        <div key={f.id} className="grid gap-2 rounded-md border border-input p-3">
          <FormField
            control={control}
            name={`${name}.${idx}.quote` as const}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                  Quote
                </FormLabel>
                <FormControl>
                  <Textarea rows={2} placeholder={quotePlaceholder} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Source (Twitter, customer call, support ticket…)"
              {...register(`${name}.${idx}.source` as const)}
            />
            <Button type="button" variant="ghost" onClick={() => remove(idx)}>
              Remove
            </Button>
          </div>
        </div>
      ))}
      {fields.length < 10 && (
        <Button
          type="button"
          variant="outline"
          onClick={() => append({ quote: "", source: "" })}
        >
          + Add quote ({fields.length} / 10)
        </Button>
      )}
    </div>
  );
}

export function StepVoc() {
  const { control } = useFormContext<WizardData>();
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium mb-1">Customer pain points</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Real things customers say when something hurts. Paste verbatim from
          support tickets, calls, reviews, DMs — any source. The AI mirrors
          this language so the post sounds like it&apos;s coming from someone
          who&apos;s actually talked to a customer. Up to 10 quotes.
        </p>
        <QuoteList
          name="voc_pain_points"
          quotePlaceholder="“My old AC keeps breaking every summer.”"
        />
      </div>

      <div>
        <h3 className="font-medium mb-1">Desired outcomes</h3>
        <p className="text-sm text-muted-foreground mb-3">
          What customers say they want — in their words, not yours. The flip
          side of pain points. Up to 10 quotes.
        </p>
        <QuoteList
          name="voc_desired_outcomes"
          quotePlaceholder="“I want it to just work for 10 years.”"
        />
      </div>

      <FormField
        control={control}
        name="trigger_events"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Trigger events</FormLabel>
            <FormDescription>
              Specific moments that push someone to look for this brand. Used
              when generating timely content. Optional, up to 10.
            </FormDescription>
            <FormControl>
              <TagInput
                value={field.value ?? []}
                onChange={field.onChange}
                max={10}
                placeholder="new office build-out, AC breakdown in summer"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
