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
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/tag-input";
import {
  MAX_VOICE_ARTICLES,
  MAX_VOICE_WORDS,
  countWords,
  truncateWords,
  type WizardData,
} from "../schema";

export function StepVoice() {
  const { control, watch, setValue } = useFormContext<WizardData>();
  const samples = watch("voice_samples") ?? [];
  const { fields, append, remove } = useFieldArray({
    control,
    name: "voice_samples",
  });

  function onArticleChange(idx: number, raw: string) {
    const words = countWords(raw);
    const next =
      words > MAX_VOICE_WORDS ? truncateWords(raw, MAX_VOICE_WORDS) : raw;
    setValue(`voice_samples.${idx}.text` as const, next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="tone_attributes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tone attributes</FormLabel>
            <FormDescription>
              Short adjectives that describe how the brand sounds. Enter or
              comma to add. Examples: professional, warm, no-nonsense, witty.
              Max 8 — fewer is usually better.
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

      <FormField
        control={control}
        name="brand_voice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Brand voice in one sentence (optional)</FormLabel>
            <FormDescription>
              How would you describe the voice if you had to explain it to a
              new hire in one breath? Skip if the articles below say it for you.
            </FormDescription>
            <FormControl>
              <Textarea
                rows={2}
                maxLength={500}
                placeholder="Like a senior engineer talking to peers — direct, technical, zero fluff."
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div>
        <FormLabel className="text-base">Voice articles</FormLabel>
        <FormDescription className="mt-1 mb-3">
          Paste up to {MAX_VOICE_ARTICLES} pieces of real writing that already
          sound like this brand — a blog post, LinkedIn essay, newsletter, even
          a long sales email. The AI will mirror this style when generating new
          posts. Up to {MAX_VOICE_WORDS.toLocaleString()} words per article —
          anything longer is trimmed automatically. The more you give us, the
          better — but the first article is the most important.
        </FormDescription>

        <div className="space-y-3">
          {fields.map((f, idx) => {
            const text = samples[idx]?.text ?? "";
            const wc = countWords(text);
            const overLimit = wc >= MAX_VOICE_WORDS;
            return (
              <div
                key={f.id}
                className="grid gap-2 rounded-md border border-input p-3"
              >
                <FormField
                  control={control}
                  name={`voice_samples.${idx}.text` as const}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                        Article {idx + 1}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          rows={10}
                          placeholder="Paste the full text of one article here…"
                          {...field}
                          onChange={(e) => onArticleChange(idx, e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {wc.toLocaleString()} / {MAX_VOICE_WORDS.toLocaleString()} words
                    {overLimit && (
                      <span className="ml-2 text-amber-500">
                        · trimmed to {MAX_VOICE_WORDS.toLocaleString()}
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(idx)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}

          {fields.length < MAX_VOICE_ARTICLES && (
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ text: "", source: "manual" })}
            >
              + Add article ({fields.length} / {MAX_VOICE_ARTICLES})
            </Button>
          )}

          {fields.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No articles yet. Skipping is OK — generation will fall back to
              tone attributes alone, but quality will be lower.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
