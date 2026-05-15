"use client";

import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TagInput } from "@/components/tag-input";
import type { WizardData } from "../schema";

export function StepWordGuards() {
  const { control } = useFormContext<WizardData>();
  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="forbidden_words"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Forbidden words</FormLabel>
            <FormDescription>
              Never use. AI-vocabulary words you have seen and disliked.
            </FormDescription>
            <FormControl>
              <TagInput
                value={field.value ?? []}
                onChange={field.onChange}
                max={50}
                placeholder="leverage, elevate, in today's fast-paced world"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="required_phrases"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Required phrases</FormLabel>
            <FormDescription>
              Branded phrases you want to keep appearing.
            </FormDescription>
            <FormControl>
              <TagInput
                value={field.value ?? []}
                onChange={field.onChange}
                max={20}
                placeholder="commercial-grade, factory authorized"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
