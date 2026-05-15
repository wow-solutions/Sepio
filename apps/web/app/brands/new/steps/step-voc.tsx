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

function QuoteList({ name }: { name: "voc_pain_points" | "voc_desired_outcomes" }) {
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
                  <Textarea rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Source (Twitter, customer call, …)"
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
          Add quote
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
          Paste real customer language. Up to 10 quotes.
        </p>
        <QuoteList name="voc_pain_points" />
      </div>

      <div>
        <h3 className="font-medium mb-1">Desired outcomes</h3>
        <p className="text-sm text-muted-foreground mb-3">
          What customers say they want. Up to 10 quotes.
        </p>
        <QuoteList name="voc_desired_outcomes" />
      </div>

      <FormField
        control={control}
        name="trigger_events"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Trigger events</FormLabel>
            <FormDescription>
              Moments that push someone to look for this brand.
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
