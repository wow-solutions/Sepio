"use client";

import { useFormContext } from "react-hook-form";
import type { WizardData } from "../schema";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-border last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span
          key={i}
          className="rounded bg-muted px-2 py-0.5 text-xs"
        >
          {it}
        </span>
      ))}
    </div>
  );
}

export function StepReview() {
  const { getValues } = useFormContext<WizardData>();
  const v = getValues();

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-medium mb-2">Basics</h3>
        <dl>
          <Row label="Name" value={v.name} />
          <Row label="Slug" value={v.slug} />
          <Row label="Website" value={v.website_url} />
          <Row label="Industry" value={v.industry} />
          <Row label="Language" value={v.primary_language} />
          <Row label="Description" value={v.description} />
        </dl>
      </section>

      <section>
        <h3 className="font-medium mb-2">Voice & guards</h3>
        <dl>
          <Row label="Brand voice" value={v.brand_voice} />
          <Row label="Tone" value={<List items={v.tone_attributes} />} />
          <Row label="Forbidden" value={<List items={v.forbidden_words} />} />
          <Row label="Required" value={<List items={v.required_phrases} />} />
        </dl>
      </section>

      <section>
        <h3 className="font-medium mb-2">Customer voice</h3>
        <dl>
          <Row
            label="Pain points"
            value={v.voc_pain_points.length ? `${v.voc_pain_points.length} quote(s)` : ""}
          />
          <Row
            label="Desired outcomes"
            value={v.voc_desired_outcomes.length ? `${v.voc_desired_outcomes.length} quote(s)` : ""}
          />
          <Row label="Triggers" value={<List items={v.trigger_events} />} />
        </dl>
      </section>

      <section>
        <h3 className="font-medium mb-2">SEO</h3>
        <dl>
          <Row label="Primary" value={<List items={v.seo_keywords_primary} />} />
          <Row label="Secondary" value={<List items={v.seo_keywords_secondary} />} />
        </dl>
      </section>

      <section>
        <h3 className="font-medium mb-2">Operations</h3>
        <dl>
          <Row label="Approval mode" value={v.approval_mode} />
          <Row
            label="Voice samples"
            value={v.voice_samples.length ? `${v.voice_samples.length} sample(s)` : ""}
          />
        </dl>
      </section>
    </div>
  );
}
