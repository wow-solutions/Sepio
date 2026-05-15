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

export function StepSeo() {
  const { control } = useFormContext<WizardData>();
  return (
    <div className="space-y-5">
      <div className="rounded-md border border-dashed border-amber-700 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
        <p className="font-medium mb-1">This whole step is optional.</p>
        <p className="text-amber-200/80">
          In a future version we&apos;ll auto-research keywords for you via
          DataForSEO — you&apos;ll see traffic, difficulty, and trend curves
          and pick from a recommended list. For now: leave both fields empty
          and we&apos;ll generate based on your description, or add a few
          manually if you already know them.
        </p>
      </div>

      <FormField
        control={control}
        name="seo_keywords_primary"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Primary keywords</FormLabel>
            <FormDescription>
              The 3-8 topics this brand most wants to be found for. Up to 15.
              Enter or comma to add.
            </FormDescription>
            <FormControl>
              <TagInput
                value={field.value ?? []}
                onChange={field.onChange}
                max={15}
                placeholder="commercial HVAC Panama, ductless mini-split installation"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="seo_keywords_secondary"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Secondary keywords</FormLabel>
            <FormDescription>
              Adjacent topics — broader subjects worth occasionally writing
              about even if they&apos;re not core. Up to 30.
            </FormDescription>
            <FormControl>
              <TagInput
                value={field.value ?? []}
                onChange={field.onChange}
                max={30}
                placeholder="energy efficiency, building codes, refrigerant phase-out"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
