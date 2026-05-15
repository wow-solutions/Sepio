"use client";

import { useState, useTransition } from "react";
import type { PangramResponse } from "@/lib/pangram";
import { saveDraft } from "./actions";

type GenerateResponse = {
  post_id: string;
  content: string;
  detection_score: number;
  detection_breakdown: PangramResponse;
  status: "draft" | "pending_approval";
  cache_read_tokens: number;
};

type Stage =
  | "idle"
  | "generating"
  | "detecting"
  | "ready"
  | "saving"
  | "saved"
  | "error";

const LINKEDIN_MAX = 3000;

type Props = {
  brandId: string;
  brandName: string;
};

export function WriterClient({ brandId, brandName }: Props) {
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [postId, setPostId] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<PangramResponse | null>(null);
  const [status, setStatus] = useState<"draft" | "pending_approval" | null>(
    null,
  );
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const charCount = content.length;
  const busy =
    stage === "generating" || stage === "detecting" || stage === "saving";
  const dirty = postId !== null && content !== originalContent;

  async function onGenerate() {
    setError(null);
    setStage("generating");
    setPostId(null);
    setScore(null);
    setBreakdown(null);
    setStatus(null);

    let res: Response;
    try {
      res = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          topic_hint: topic.trim() || undefined,
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStage("error");
      return;
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: unknown; stage?: unknown }
        | null;
      const errText =
        data && typeof data.error === "string" && data.error
          ? data.error
          : `HTTP ${res.status}`;
      const note =
        data && typeof data.stage === "string" ? ` (${data.stage})` : "";
      setError(`${errText}${note}`);
      setStage("error");
      return;
    }

    // Visual second-stage signal while the response was actually awaited above.
    setStage("detecting");
    const data = (await res.json()) as GenerateResponse;
    setContent(data.content);
    setOriginalContent(data.content);
    setPostId(data.post_id);
    setScore(data.detection_score);
    setBreakdown(data.detection_breakdown);
    setStatus(data.status);
    setStage("ready");
  }

  function onSave() {
    if (!postId) return;
    setError(null);
    setStage("saving");
    startTransition(async () => {
      const result = await saveDraft(postId, content);
      if (!result.ok) {
        setError(result.error);
        setStage("error");
        return;
      }
      setOriginalContent(content);
      setStage("saved");
    });
  }

  const scoreColor =
    score === null
      ? "text-slate-600"
      : score >= 80
        ? "text-emerald-400"
        : score >= 40
          ? "text-amber-400"
          : "text-red-400";

  return (
    <section className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm text-slate-300">Topic hint (optional)</span>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={`e.g. "summer maintenance tips" — or leave blank for ${brandName}`}
            disabled={busy}
            className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={onGenerate}
            disabled={busy}
            className="rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white font-medium px-4 py-2 transition-colors"
          >
            {stage === "generating"
              ? "Generating draft… ~5s"
              : stage === "detecting"
                ? "Checking detection… ~5s"
                : postId
                  ? "Regenerate"
                  : "Generate"}
          </button>

          {postId && (
            <button
              onClick={onSave}
              disabled={busy || isPending || !dirty}
              className="rounded border border-slate-700 hover:border-slate-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 font-medium px-4 py-2 transition-colors"
            >
              {stage === "saving"
                ? "Saving…"
                : stage === "saved" && !dirty
                  ? "Saved"
                  : "Save edits"}
            </button>
          )}
        </div>

        {error && (
          <div className="rounded border border-red-700 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <label className="block">
          <span className="text-sm text-slate-300">Draft</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            placeholder="Generated draft will appear here…"
            className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-3 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono text-sm"
          />
        </label>

        <div className="flex justify-between text-xs text-slate-500">
          <span>
            {charCount} / {LINKEDIN_MAX} characters
            {dirty && (
              <span className="ml-2 text-amber-400">
                · edited — score may be stale
              </span>
            )}
          </span>
          {charCount > LINKEDIN_MAX && (
            <span className="text-red-400">Exceeds LinkedIn limit</span>
          )}
        </div>
      </div>

      <aside className="space-y-3">
        <div className="rounded-lg border border-slate-800 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">
            Detection Pass Score
          </p>
          <p className={`text-4xl font-semibold ${scoreColor}`}>
            {score === null ? "—" : score}
            {score !== null && (
              <span className="text-lg text-slate-500">/100</span>
            )}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Higher = more human-detected by Pangram 3.x.
          </p>
        </div>

        {breakdown && (
          <div className="rounded-lg border border-slate-800 p-4 space-y-2 text-xs">
            <p className="text-sm font-medium text-white">
              {breakdown.headline}
            </p>
            <p className="text-slate-400">{breakdown.prediction}</p>
            <div className="pt-2 border-t border-slate-800 grid grid-cols-3 gap-2 text-slate-400">
              <div>
                <div className="text-slate-500 text-[10px] uppercase tracking-wider">
                  AI seg
                </div>
                <div className="text-white">{breakdown.num_ai_segments}</div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase tracking-wider">
                  Assisted
                </div>
                <div className="text-white">
                  {breakdown.num_ai_assisted_segments}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[10px] uppercase tracking-wider">
                  Human
                </div>
                <div className="text-white">
                  {breakdown.num_human_segments}
                </div>
              </div>
            </div>
          </div>
        )}

        {status && (
          <div className="rounded-lg border border-slate-800 p-3 text-xs text-slate-400">
            Saved as{" "}
            <span className="text-white font-medium">
              {status === "pending_approval"
                ? "Pending approval"
                : "Draft"}
            </span>
          </div>
        )}

        <div className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-200">
          <strong className="block mb-1">Humanizer = Sprint 2</strong>
          Raw Claude output reliably scores low. Adversarial humanizer loop
          ships next sprint.
        </div>
      </aside>
    </section>
  );
}
