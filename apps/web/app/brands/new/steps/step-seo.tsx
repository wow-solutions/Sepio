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
    <div className="space-y-4">
      <FormField
        control={control}
        name="seo_keywords_primary"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Primary keywords</FormLabel>
            <FormDescription>Top topics worth ranking for. Max 15.</FormDescription>
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
            <FormDescription>Adjacent topics. Max 30.</FormDescription>
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
