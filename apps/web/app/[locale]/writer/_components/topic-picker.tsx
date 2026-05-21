"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Topic picker component — sprint 1C Lane F.
// Fetches /api/brands/[id]/topics, shows top-5 cards, supports
// single-select with optional toggle-off. Parent triggers refresh by
// incrementing refreshKey (after generate clears used card).

type TopicSource = "web_search" | "dataforseo" | "voc_history";

type Topic = {
  id: string;
  topic_text: string;
  source: string;
  source_metadata: unknown;
  score: number | null;
  created_at: string;
};

type TopicsResponse = {
  topics: Topic[];
  pool_total: number;
};

type Props = {
  brandId: string;
  selectedId: string | null;
  onSelect: (topic: Topic | null) => void;
  refreshKey: number;
  disabled?: boolean;
};

export function TopicPicker({
  brandId,
  selectedId,
  onSelect,
  refreshKey,
  disabled,
}: Props) {
  const t = useTranslations("writer.topicPicker");
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/topics`);
      if (!res.ok) {
        setError(t("errorFallback"));
        setTopics([]);
        return;
      }
      const data = (await res.json()) as TopicsResponse;
      setTopics(data.topics ?? []);
      // Drop selection if the selected topic disappeared from the pool
      // (e.g. used by another tab или filtered out).
      if (selectedId && !data.topics.some((tp) => tp.id === selectedId)) {
        onSelect(null);
      }
    } catch {
      setError(t("errorFallback"));
      setTopics([]);
    } finally {
      setLoading(false);
    }
    // selectedId/onSelect intentionally not в deps — we only sync selection
    // when the FETCH happens. Including them would re-fetch on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, t]);

  useEffect(() => {
    // Fire async fetch — setState calls inside happen after the await, so this
    // isn't a true cascading-render pattern. The React Compiler still flags it.
    // eslint-disable-next-line react-hooks/static-components
    load();
  }, [load, refreshKey]);

  const handleCardClick = (topic: Topic) => {
    if (disabled) return;
    // Toggle: clicking selected card deselects
    if (selectedId === topic.id) {
      onSelect(null);
    } else {
      onSelect(topic);
    }
  };

  return (
    <section
      style={{
        padding: "18px 20px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span style={caption()}>{t("title")}</span>
        <button
          type="button"
          onClick={load}
          disabled={loading || disabled}
          style={{
            ...mono(10, "var(--ink-muted)"),
            background: "transparent",
            border: 0,
            cursor: loading || disabled ? "not-allowed" : "pointer",
            padding: "2px 6px",
            opacity: loading ? 0.5 : 1,
          }}
          title={t("refresh")}
        >
          ↻
        </button>
      </div>

      <p
        style={{
          fontSize: 11,
          color: "var(--ink-faint)",
          lineHeight: 1.45,
          marginTop: 0,
          marginBottom: 12,
        }}
      >
        {t("helper")}
      </p>

      {loading && topics === null && (
        <div style={{ ...mono(11, "var(--ink-faint)"), padding: "8px 0" }}>
          {t("loading")}
        </div>
      )}

      {error && (
        <div
          style={{
            fontSize: 11,
            color: "var(--risky)",
            background: "var(--risky-bg)",
            border: "1px solid rgba(194,104,90,0.20)",
            padding: "8px 10px",
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}

      {topics !== null && topics.length === 0 && !loading && !error && (
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-muted)",
            lineHeight: 1.55,
            padding: "10px 12px",
            background: "var(--surface)",
            border: "1px dashed var(--border-strong)",
            borderRadius: 6,
          }}
        >
          <div>{t("empty")}</div>
          <div
            style={{ ...mono(10, "var(--ink-faint)"), marginTop: 6 }}
          >
            {t("emptyHint")}
          </div>
        </div>
      )}

      {topics !== null && topics.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {topics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              selected={selectedId === topic.id}
              onClick={() => handleCardClick(topic)}
              disabled={disabled ?? false}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TopicCard({
  topic,
  selected,
  onClick,
  disabled,
}: {
  topic: Topic;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("writer.topicPicker");
  const sourceLabel = sourceLabelFor(topic.source as TopicSource, t);
  const sourceColor = sourceColorFor(topic.source as TopicSource);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: "left",
        padding: "10px 12px",
        background: selected ? "var(--raised)" : "var(--surface)",
        border: `1px solid ${selected ? "var(--info)" : "var(--border-strong)"}`,
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        outline: "none",
        transition: "border-color 120ms ease, background 120ms ease",
        opacity: disabled ? 0.6 : 1,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            ...mono(9, sourceColor),
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            padding: "2px 5px",
            border: `1px solid ${sourceColor}`,
            borderRadius: 3,
            opacity: 0.85,
          }}
        >
          {sourceLabel}
        </span>
        {selected && (
          <span
            style={{
              ...mono(9, "var(--info)"),
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            ✓ {t("selected")}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.45,
          color: "var(--ink)",
          overflowWrap: "anywhere",
        }}
      >
        {topic.topic_text}
      </div>
      {renderMetadata(topic)}
    </button>
  );
}

function renderMetadata(topic: Topic) {
  const meta = topic.source_metadata;
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;

  let detail: string | null = null;
  if (topic.source === "dataforseo" && typeof m.rise_value === "number") {
    detail = `+${Math.round(m.rise_value).toLocaleString()}% rise`;
  } else if (topic.source === "web_search" && typeof m.search_query === "string") {
    detail = `"${m.search_query}"`;
  } else if (topic.source === "voc_history" && typeof m.voc_type === "string") {
    detail = String(m.voc_type).replace("_", " ");
  }

  if (!detail) return null;
  return (
    <div
      style={{
        ...mono(10, "var(--ink-faint)"),
        marginTop: 6,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {detail}
    </div>
  );
}

function sourceLabelFor(
  source: TopicSource,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (source) {
    case "web_search":
      return t("sourceWeb");
    case "dataforseo":
      return t("sourceDataforSeo");
    case "voc_history":
      return t("sourceVoc");
    default:
      return source;
  }
}

function sourceColorFor(source: TopicSource): string {
  switch (source) {
    case "web_search":
      return "var(--info)";
    case "dataforseo":
      return "var(--accent, var(--info))";
    case "voc_history":
      return "var(--ink-muted)";
    default:
      return "var(--ink-muted)";
  }
}

function caption(): React.CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--ink-faint)",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  };
}

function mono(size: number, color: string): React.CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: size,
    color,
    letterSpacing: "0.02em",
    fontVariantNumeric: "tabular-nums",
  };
}
