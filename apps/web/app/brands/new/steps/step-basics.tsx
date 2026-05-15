"use client";

import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { slugify, type WizardData } from "../schema";

export function StepBasics() {
  const { control, watch, setValue, getValues } = useFormContext<WizardData>();
  const name = watch("name");

  // Auto-fill slug from name until the user touches the slug field manually.
  useEffect(() => {
    const currentSlug = getValues("slug");
    const autoSlug = slugify(name ?? "");
    if (!currentSlug || currentSlug === slugify(getValues("name") ?? "")) {
      setValue("slug", autoSlug, { shouldValidate: false });
    }
  }, [name, getValues, setValue]);

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Brand name *</FormLabel>
            <FormDescription>
              The display name shown in your dashboard. Can be anything — your
              company, a product line, a personal channel.
            </FormDescription>
            <FormControl>
              <Input placeholder="24Clima" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="slug"
        render={({ field }) => (
          <FormItem>
            <FormLabel>URL slug *</FormLabel>
            <FormDescription>
              A short identifier used in URLs. Auto-generated from the brand
              name — letters, digits, hyphens. You can edit it, but it&apos;s
              awkward to change later, so keep it short.
            </FormDescription>
            <FormControl>
              <Input placeholder="24clima" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="website_url"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Website</FormLabel>
            <FormDescription>
              Optional. Bare domain works — e.g. <code>24clima.com</code>.
              We&apos;ll add <code>https://</code> for you.
            </FormDescription>
            <FormControl>
              <Input placeholder="24clima.com" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="industry"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Industry</FormLabel>
            <FormDescription>
              Free text — what business is this? Used to ground the AI when it
              writes about adjacent topics. Optional.
            </FormDescription>
            <FormControl>
              <Input placeholder="HVAC, B2B distributor" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="primary_language"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Primary language *</FormLabel>
            <FormDescription>
              The main language posts will be generated in. You can change it
              per-post later.
            </FormDescription>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="ru">Русский</SelectItem>
                <SelectItem value="pt">Português</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>One-line description</FormLabel>
            <FormDescription>
              Who is this brand for and what does it sell? One sentence is
              plenty — the AI uses this to stay on-topic.
            </FormDescription>
            <FormControl>
              <Textarea
                rows={2}
                placeholder="B2B HVAC distributor in Panama, focused on commercial installers."
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
