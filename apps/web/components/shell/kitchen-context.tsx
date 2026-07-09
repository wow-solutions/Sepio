"use client";

// Kitchen context — the single source of truth for the content-kitchen fan-out,
// lifted ABOVE both the rail and the writer (they are siblings under AppShell).
//
// The writer (a child of AppShell) REGISTERS the base blog as the kitchen source
// and renders the active channel's content; the rail (also under AppShell) reads
// the same state to show per-channel toggles + selection. Outside the writer the
// context is inert (source === null) and the rail falls back to indicators only.
//
// One channel = one variant post. 'hosted' is the SOURCE itself (the base blog);
// every other channel is a generated variant fetched from POST
// /api/posts/[id]/variants. Selection state is client-side for slice 1.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isChannelId, type ChannelId } from "@/lib/kitchen/channel-formats";
import { coerceAppliedRules, type AppliedRule } from "@/lib/applied-rules";

export type VariantData = {
  postId: string | null;
  body: string;
  // mirrors posts.variant_state: 'source' | 'synced' | 'stale' | 'edited' | 'published'
  state: string;
  loading: boolean;
  error: string | null;
  // posts.external_post_url once published (the live LinkedIn/etc URL); null otherwise.
  externalUrl: string | null;
  // W2 receipt snapshot from posts.applied_rules. null = not tracked (no
  // receipt); [] = tracked, zero rules applied (teach-Sepio CTA).
  appliedRules: AppliedRule[] | null;
  // Grounded-numbers gate: figures the checker couldn't trace to brand facts.
  // [] = clean or unknown (race-recovery / older builds omit the field).
  ungroundedNumbers: string[];
};

export type KitchenSource = {
  postId: string;
  brandId: string;
  language: string;
};

// Seed for opening an EXISTING content group (reconstruct the whole chain): the
// blog source + every channel that already has a variant + which channel was
// opened. Provided by writer/page.tsx; the provider is born hydrated from it.
export type InitialGroup = {
  source: KitchenSource;
  baseBody: string;
  variants: Partial<Record<ChannelId, VariantData>>;
  active: ChannelId;
};

type KitchenValue = {
  // true while the writer is mounted — the rail shows the interactive channel
  // selector (toggles) even before a blog article exists. Per-channel generation
  // still needs `source` (a blog).
  present: boolean;
  // null = no blog article yet (toggles select destinations, but a channel can't
  // be generated/previewed until a blog exists).
  source: KitchenSource | null;
  selected: ReadonlySet<ChannelId>;
  active: ChannelId;
  variants: Partial<Record<ChannelId, VariantData>>;
  // The writer sets present on mount; it clears on unmount.
  setPresent: (present: boolean) => void;
  // The writer registers/clears the source + seeds the base ('hosted') body.
  setSource: (source: KitchenSource | null, baseBody: string) => void;
  // Keep the base body in sync as the writer edits it (so re-fan uses fresh text).
  syncBase: (body: string) => void;
  toggleChannel: (c: ChannelId) => void;
  // Make a channel active; lazily generate its variant if missing.
  selectChannel: (c: ChannelId) => void;
  // Ensure a channel has a generated variant post; returns its postId (existing
  // or freshly generated), or null if generation failed. Used by the publish
  // fan-out to generate-on-the-fly for selected-but-ungenerated channels.
  ensureVariant: (c: ChannelId) => Promise<string | null>;
  // The active variant editor (KitchenCenter) registers a "save current draft"
  // fn here; the publish fan-out calls flushActive() first so an unsaved edit is
  // persisted before publishing. Returns false if the save failed.
  registerFlush: (fn: (() => Promise<boolean>) | null) => void;
  flushActive: () => Promise<boolean>;
  regenerate: (c: ChannelId) => void;
  // Update a variant's body in place (after a saved draft or an Editorial Memory
  // apply), so the context stays the source of truth for the rail/center.
  updateVariantBody: (c: ChannelId, body: string) => void;
  // Mark a variant published (locks it read-only + carries the live URL). Body
  // and lifecycle are separate contracts — kept distinct from updateVariantBody.
  markVariantPublished: (c: ChannelId, externalUrl: string | null) => void;
  // Flag every channel variant 'stale' after the SOURCE article is edited — the
  // server bumps source_version on a source save, so the cached variant bodies no
  // longer reflect the article. The rail/center surface this + prompt a regenerate
  // (instead of silently showing copy adapted from the pre-edit text). Published
  // variants are left alone (already live; can't be un-published).
  markVariantsStale: () => void;
};

const KitchenCtx = createContext<KitchenValue | null>(null);

/** Inert when used outside a KitchenProvider (e.g. SSR-only paths). */
export function useKitchen(): KitchenValue {
  const ctx = useContext(KitchenCtx);
  if (!ctx) return INERT;
  return ctx;
}

export function KitchenProvider({
  children,
  brandId,
  initialGroup,
}: {
  children: ReactNode;
  brandId: string | null;
  // When set, the provider is born hydrated from an opened content group. The
  // localStorage load/save of `selected` is suppressed (groupMode) so the
  // group's channels-with-content do not overwrite the per-brand default.
  initialGroup?: InitialGroup | null;
}) {
  const groupModeRef = useRef(!!initialGroup);
  const [present, setPresent] = useState(!!initialGroup);
  const [source, setSourceState] = useState<KitchenSource | null>(
    initialGroup?.source ?? null,
  );
  const [selected, setSelected] = useState<ReadonlySet<ChannelId>>(() =>
    initialGroup
      ? new Set<ChannelId>([
          "hosted",
          ...(Object.keys(initialGroup.variants) as ChannelId[]),
        ])
      : new Set<ChannelId>(["hosted"]),
  );
  const [active, setActive] = useState<ChannelId>(
    initialGroup?.active ?? "hosted",
  );
  const [variants, setVariants] = useState<
    Partial<Record<ChannelId, VariantData>>
  >(() =>
    initialGroup
      ? {
          hosted: {
            postId: initialGroup.source.postId,
            body: initialGroup.baseBody,
            state: "source",
            loading: false,
            error: null,
            externalUrl: null,
            appliedRules: null,
            ungroundedNumbers: [],
          },
          ...initialGroup.variants,
        }
      : {},
  );

  // A ref mirror of `variants` so selectChannel can read the latest state for its
  // "already loaded?" guard WITHOUT calling fetch inside a setState updater
  // (React StrictMode double-invokes updaters → would fire two fetches per click
  // → duplicate-key race on the variant insert).
  const variantsRef = useRef(variants);
  useEffect(() => {
    variantsRef.current = variants;
  }, [variants]);
  // In-flight fetches keyed by `${postId}:${channel}` — dedupes concurrent
  // (non-force) requests for the same variant.
  const inflightRef = useRef<Set<string>>(new Set());

  // Persist the destination selection per brand so the rail reads the same on
  // every page (and survives navigation, even though AppShell remounts the
  // provider per page). Hydrate once after mount; save after hydration.
  const hydratedRef = useRef(false);
  const storageKey = brandId ? `content-kitchen:selected:${brandId}` : null;
  useEffect(() => {
    // Group mode: the rail reflects this group's channels-with-content, NOT the
    // persisted per-brand default — don't load it (it would clobber the seed).
    if (groupModeRef.current) {
      hydratedRef.current = true;
      return;
    }
    if (!storageKey) {
      hydratedRef.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const arr = (JSON.parse(raw) as unknown[]).filter(
          (x): x is ChannelId => typeof x === "string" && isChannelId(x),
        );
        setSelected(new Set<ChannelId>(arr.length ? arr : ["hosted"]));
      }
    } catch {
      // ignore malformed storage
    }
    hydratedRef.current = true;
  }, [storageKey]);
  useEffect(() => {
    // Group mode: never persist the group-derived selection over the per-brand
    // default the user set for fresh generations.
    if (groupModeRef.current) return;
    if (!hydratedRef.current || !storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...selected]));
    } catch {
      // ignore quota / private-mode errors
    }
  }, [selected, storageKey]);

  const setSource = useCallback(
    (s: KitchenSource | null, baseBody: string) => {
      // Reset source/active/variants — but NOT `selected` (the destination
      // selection is the user's persistent preference, not per-article).
      setSourceState(s);
      setActive("hosted");
      setVariants(
        s
          ? {
              hosted: {
                postId: s.postId,
                body: baseBody,
                state: "source",
                loading: false,
                error: null,
                externalUrl: null,
                appliedRules: null,
                ungroundedNumbers: [],
              },
            }
          : {},
      );
    },
    [],
  );

  const syncBase = useCallback((body: string) => {
    setVariants((v) =>
      v.hosted ? { ...v, hosted: { ...v.hosted, body } } : v,
    );
  }, []);

  // Every channel (including the blog) can be toggled as a publish destination.
  // The blog stays the SOURCE you write either way; the toggle only controls
  // whether the article is also published to the hosted blog.
  const toggleChannel = useCallback((c: ChannelId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }, []);

  // Generate (or fetch cached) the variant for a channel via the fan-out API.
  // Returns the variant's postId on success, or null (no source, hosted, a
  // deduped concurrent fetch, or a failure).
  const fetchVariant = useCallback(
    async (c: ChannelId, force: boolean): Promise<string | null> => {
      if (!source || c === "hosted") return null;
      // Dedupe concurrent fetches for the same variant (a StrictMode double-fire
      // or a fast re-click). Only non-force requests participate in the set, so a
      // force/regenerate never clears a non-force's key (it always proceeds; an
      // overlapping insert race is caught by the backend 23505 recovery).
      const inflightKey = `${source.postId}:${c}`;
      if (!force) {
        if (inflightRef.current.has(inflightKey)) return null;
        inflightRef.current.add(inflightKey);
      }
      setVariants((v) => ({
        ...v,
        [c]: {
          postId: v[c]?.postId ?? null,
          body: v[c]?.body ?? "",
          state: v[c]?.state ?? "synced",
          loading: true,
          error: null,
          externalUrl: v[c]?.externalUrl ?? null,
          appliedRules: v[c]?.appliedRules ?? null,
          ungroundedNumbers: v[c]?.ungroundedNumbers ?? [],
        },
      }));
      try {
        const res = await fetch(`/api/posts/${source.postId}/variants`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform: c, force }),
        });
        const data = (await res.json().catch(() => null)) as
          | {
              post_id?: string;
              content_text?: string | null;
              content_markdown?: string | null;
              variant_state?: string;
              applied_rules?: unknown;
              ungrounded_numbers?: string[];
              error?: string;
            }
          | null;
        if (!res.ok || !data?.post_id) {
          setVariants((v) => ({
            ...v,
            [c]: {
              postId: v[c]?.postId ?? null,
              body: v[c]?.body ?? "",
              state: v[c]?.state ?? "synced",
              loading: false,
              error: data?.error ?? `HTTP ${res.status}`,
              externalUrl: v[c]?.externalUrl ?? null,
              appliedRules: v[c]?.appliedRules ?? null,
              ungroundedNumbers: v[c]?.ungroundedNumbers ?? [],
            },
          }));
          return null;
        }
        const newPostId = data.post_id;
        setVariants((v) => ({
          ...v,
          [c]: {
            postId: newPostId,
            body: data.content_text ?? data.content_markdown ?? "",
            state: data.variant_state ?? "synced",
            loading: false,
            error: null,
            externalUrl: v[c]?.externalUrl ?? null,
            appliedRules: coerceAppliedRules(data.applied_rules),
            ungroundedNumbers: Array.isArray(data.ungrounded_numbers)
              ? data.ungrounded_numbers.filter((n) => typeof n === "string")
              : [],
          },
        }));
        return newPostId;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error";
        setVariants((v) => ({
          ...v,
          [c]: {
            postId: v[c]?.postId ?? null,
            body: v[c]?.body ?? "",
            state: v[c]?.state ?? "synced",
            loading: false,
            error: msg,
            externalUrl: v[c]?.externalUrl ?? null,
            appliedRules: v[c]?.appliedRules ?? null,
          ungroundedNumbers: v[c]?.ungroundedNumbers ?? [],
          },
        }));
        return null;
      } finally {
        if (!force) inflightRef.current.delete(inflightKey);
      }
    },
    [source],
  );

  // Ensure a channel has a generated variant post. Returns the existing postId
  // when one is already loaded, otherwise generates (non-force) and returns the
  // new id. Used by the publish fan-out (generate-on-the-fly for selected-but-
  // ungenerated channels).
  const ensureVariant = useCallback(
    async (c: ChannelId): Promise<string | null> => {
      if (c === "hosted") return source?.postId ?? null;
      const existing = variantsRef.current[c]?.postId;
      if (existing) return existing;
      const pid = await fetchVariant(c, false);
      if (pid) return pid;
      // null can mean "deduped against an in-flight preview fetch" (not a
      // failure) — wait for that fetch to settle, then read its postId.
      for (let i = 0; i < 40 && variantsRef.current[c]?.loading; i++) {
        await new Promise((r) => setTimeout(r, 250));
      }
      return variantsRef.current[c]?.postId ?? null;
    },
    [fetchVariant, source],
  );

  // The active variant editor registers a save-current-draft fn so the publish
  // fan-out can persist an unsaved edit before publishing (the per-channel
  // Publish button used to save first; the picker is now the only publish path).
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const registerFlush = useCallback(
    (fn: (() => Promise<boolean>) | null) => {
      flushRef.current = fn;
    },
    [],
  );
  const flushActive = useCallback(
    async (): Promise<boolean> => (flushRef.current ? flushRef.current() : true),
    [],
  );

  // A row click only PREVIEWS the channel (sets active) — it never toggles the
  // destination (only the switch does that). Lazy-generates the variant when a
  // blog source exists. Pre-blog it's a center no-op (the create flow stays,
  // guarded by the kitchenSource check in the writer center).
  const selectChannel = useCallback(
    (c: ChannelId) => {
      setActive(c);
      if (source && c !== "hosted") {
        // Read current state via the ref (NOT inside a setState updater — that
        // double-fires under StrictMode). Lazy-generate only if there's no
        // variant body yet and nothing already loading.
        const cur = variantsRef.current[c];
        if (!cur || (!cur.body && !cur.loading)) void fetchVariant(c, false);
      }
    },
    [fetchVariant, source],
  );

  const regenerate = useCallback(
    (c: ChannelId) => {
      void fetchVariant(c, true);
    },
    [fetchVariant],
  );

  const updateVariantBody = useCallback((c: ChannelId, body: string) => {
    setVariants((v) => (v[c] ? { ...v, [c]: { ...v[c]!, body } } : v));
  }, []);

  const markVariantPublished = useCallback(
    (c: ChannelId, externalUrl: string | null) => {
      setVariants((v) =>
        v[c]
          ? { ...v, [c]: { ...v[c]!, state: "published", externalUrl } }
          : v,
      );
    },
    [],
  );

  const markVariantsStale = useCallback(() => {
    setVariants((v) => {
      let changed = false;
      const next: Partial<Record<ChannelId, VariantData>> = {};
      for (const key of Object.keys(v) as ChannelId[]) {
        const data = v[key]!;
        // The blog itself is the source (not a variant); a published variant is
        // already live. Everything else generated from the old source is stale.
        if (key !== "hosted" && data.state !== "published" && data.state !== "stale") {
          next[key] = { ...data, state: "stale" };
          changed = true;
        } else {
          next[key] = data;
        }
      }
      return changed ? next : v;
    });
  }, []);

  const value = useMemo<KitchenValue>(
    () => ({
      present,
      source,
      selected,
      active,
      variants,
      setPresent,
      setSource,
      syncBase,
      toggleChannel,
      selectChannel,
      ensureVariant,
      registerFlush,
      flushActive,
      regenerate,
      updateVariantBody,
      markVariantPublished,
      markVariantsStale,
    }),
    [
      present,
      source,
      selected,
      active,
      variants,
      setSource,
      syncBase,
      toggleChannel,
      selectChannel,
      ensureVariant,
      registerFlush,
      flushActive,
      regenerate,
      updateVariantBody,
      markVariantPublished,
      markVariantsStale,
    ],
  );

  return <KitchenCtx.Provider value={value}>{children}</KitchenCtx.Provider>;
}

// Inert value for consumers outside a provider — no source, no-op actions.
const INERT: KitchenValue = {
  present: false,
  source: null,
  selected: new Set<ChannelId>(["hosted"]),
  active: "hosted",
  variants: {},
  setPresent: () => {},
  setSource: () => {},
  syncBase: () => {},
  toggleChannel: () => {},
  selectChannel: () => {},
  ensureVariant: async () => null,
  registerFlush: () => {},
  flushActive: async () => true,
  regenerate: () => {},
  updateVariantBody: () => {},
  markVariantPublished: () => {},
  markVariantsStale: () => {},
};
