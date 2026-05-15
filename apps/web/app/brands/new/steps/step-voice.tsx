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
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/tag-input";
import type { WizardData } from "../schema";

export function StepVoice() {
  const { control } = useFormContext<WizardData>();
  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="brand_voice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Brand voice</FormLabel>
            <FormDescription>
              Free-form. How should the brand sound — first person? technical?
              warm? sharp? Examples are useful.
            </FormDescription>
            <FormControl>
              <Textarea rows={6} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="tone_attributes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tone attributes</FormLabel>
            <FormDescription>
              Short adjectives. Max 8. Enter or comma to add.
            </FormDescription>
            <FormControl>
              <TagInput
                value={field.value ?? []}
                onChange={field.onChange}
                max={8}
                placeholder="professional, warm, authoritative"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
