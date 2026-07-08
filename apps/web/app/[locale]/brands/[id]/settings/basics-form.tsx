"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { IndustryPicker } from "@/components/industry-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES } from "@/lib/_private/dataforseo-locations";
import { updateBrandBasics } from "./actions";

type Props = {
  brandId: string;
  locale: string;
  initialCategoryId: string | null;
  initialDisplayName: string | null;
  initialLanguage: string;
  initialAdditionalLanguages: string[];
  initialBrandVoice: string;
  initialTargetMarket: string | null;
  clientBrainLocations: string[];
};

const MAX_VOICE_CHARS = 5000;

const ALLOWED_LANGUAGES = ["en", "es", "ru", "pt", "fr"] as const;
const LANGUAGE_LABELS: Record<(typeof ALLOWED_LANGUAGES)[number], string> = {
  en: "English",
  es: "Español",
  ru: "Русский",
  pt: "Português",
  fr: "Français",
};

// Radix Select reserves the empty string for "no selection" — use a sentinel
// for the "not set" option and translate to/from null at the edges.
const UNSET_MARKET = "__unset__";

export function BasicsForm({
  brandId,
  locale,
  initialCategoryId,
  initialDisplayName,
  initialLanguage,
  initialAdditionalLanguages,
  initialBrandVoice,
  initialTargetMarket,
  clientBrainLocations,
}: Props) {
  const t = useTranslations("brandSettings");

  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [displayName, setDisplayName] = useState<string | null>(
    initialDisplayName,
  );
  const [language, setLanguage] = useState<string>(initialLanguage);
  const [additionalLanguages, setAdditionalLanguages] = useState<string[]>(
    initialAdditionalLanguages,
  );
  const [brandVoice, setBrandVoice] = useState<string>(initialBrandVoice);
  const [targetMarket, setTargetMarket] = useState<string | null>(
    initialTargetMarket,
  );

  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const markDirty = () => {
    setDirty(true);
    setSavedAt(null);
    setError(null);
  };

  const handleIndustryChange = (id: string | null, name: string | null) => {
    setCategoryId(id);
    setDisplayName(name);
    markDirty();
  };

  const toggleAdditional = (code: string) => {
    setAdditionalLanguages((prev) =>
      prev.includes(code)
        ? prev.filter((l) => l !== code)
        : [...prev, code],
    );
    markDirty();
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateBrandBasics(brandId, {
        industryCategoryId: categoryId,
        primaryLanguage: language,
        additionalLanguages: additionalLanguages.filter((l) => l !== language),
        brandVoice: brandVoice,
        targetMarket: targetMarket,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDirty(false);
      setSavedAt(Date.now());
    });
  };

  const recentlySaved = savedAt && Date.now() - savedAt < 4000;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Industry */}
      <div>
        <label
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
            marginBottom: 6,
          }}
        >
          {t("industryLabel")}
        </label>
        <p
          style={{
            fontSize: 12,
            color: "var(--ink-muted)",
            margin: "0 0 8px",
          }}
        >
          {t("industryDescription")}
        </p>
        <IndustryPicker
          value={categoryId}
          onChange={handleIndustryChange}
          brandId={brandId}
          locale={locale}
          initialDisplayName={displayName}
        />
      </div>

      {/* Language */}
      <div>
        <label
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
            marginBottom: 6,
          }}
        >
          {t("languageLabel")}
        </label>
        <p
          style={{
            fontSize: 12,
            color: "var(--ink-muted)",
            margin: "0 0 8px",
          }}
        >
          {t("languageDescription")}
        </p>
        <Select
          value={language}
          onValueChange={(v) => {
            setLanguage(v);
            setAdditionalLanguages((prev) => prev.filter((l) => l !== v));
            markDirty();
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="es">Español</SelectItem>
            <SelectItem value="ru">Русский</SelectItem>
            <SelectItem value="pt">Português</SelectItem>
            <SelectItem value="fr">Français</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Additional languages (allowlist) */}
      <div>
        <label
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
            marginBottom: 6,
          }}
        >
          Also publish in
        </label>
        <p
          style={{
            fontSize: 12,
            color: "var(--ink-muted)",
            margin: "0 0 8px",
          }}
        >
          Extra languages this brand publishes content in.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ALLOWED_LANGUAGES.filter((code) => code !== language).map((code) => {
            const selected = additionalLanguages.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleAdditional(code)}
                aria-pressed={selected}
                style={{
                  cursor: "pointer",
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--border-subtle)",
                  background: selected ? "var(--ink)" : "transparent",
                  color: selected ? "var(--raised)" : "var(--ink-muted)",
                  fontWeight: selected ? 500 : 400,
                }}
              >
                {LANGUAGE_LABELS[code]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Brand voice */}
      <div>
        <label
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
            marginBottom: 6,
          }}
        >
          {t("voiceLabel")}
        </label>
        <p
          style={{
            fontSize: 12,
            color: "var(--ink-muted)",
            margin: "0 0 8px",
          }}
        >
          {t("voiceDescription")}
        </p>
        <Textarea
          rows={6}
          value={brandVoice}
          maxLength={MAX_VOICE_CHARS}
          placeholder={t("voicePlaceholder")}
          onChange={(e) => {
            setBrandVoice(e.target.value);
            markDirty();
          }}
        />
        <p
          style={{
            fontSize: 11,
            color: "var(--ink-faint)",
            margin: "4px 0 0",
            textAlign: "right",
          }}
        >
          {brandVoice.length} / {MAX_VOICE_CHARS}
        </p>
      </div>

      {/* Target market */}
      <div>
        <label
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
            marginBottom: 6,
          }}
        >
          {t("targetMarketLabel")}
        </label>
        <p
          style={{
            fontSize: 12,
            color: "var(--ink-muted)",
            margin: "0 0 8px",
          }}
        >
          {t("targetMarketDescription")}
        </p>
        <Select
          value={targetMarket ?? UNSET_MARKET}
          onValueChange={(v) => {
            setTargetMarket(v === UNSET_MARKET ? null : v);
            markDirty();
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET_MARKET}>
              {t("targetMarketEmpty")}
            </SelectItem>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {locale === "es" ? c.nameEs : c.nameEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {clientBrainLocations.length > 0 && (
          <p
            style={{
              fontSize: 12,
              color: "var(--ink-faint)",
              margin: "8px 0 0",
            }}
          >
            {t("targetMarketHint", { locations: clientBrainLocations.join(", ") })}
          </p>
        )}
      </div>

      {/* Save row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button type="button" onClick={handleSave} disabled={pending || !dirty}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("save")
          )}
        </Button>
        {recentlySaved && (
          <span style={{ fontSize: 13, color: "var(--pass)" }}>
            {t("saved")}
          </span>
        )}
        {error && (
          <span style={{ fontSize: 13, color: "rgb(180, 60, 60)" }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
