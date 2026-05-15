"use client";

import { useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
};

export function TagInput({ value, onChange, placeholder, max }: Props) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const items = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !value.includes(s));
    if (!items.length) return;
    const next = [...value, ...items];
    onChange(max ? next.slice(0, max) : next);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const reachedMax = max != null && value.length >= max;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/20">
      {value.map((tag, i) => (
        <Badge key={`${tag}-${i}`} variant="secondary" className="gap-1">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="-mr-1 px-1 text-muted-foreground hover:text-foreground"
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </Badge>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder={reachedMax ? `Max ${max}` : placeholder ?? "Type and press Enter"}
        disabled={reachedMax}
        className="h-7 flex-1 min-w-[140px] border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
      />
    </div>
  );
}
