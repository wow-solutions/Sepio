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
import { updateBrandBasics } from "./actions";

type Props = {
  brandId: string;
  locale: string;
  initialCategoryId: string | null;
  initialDisplayName: string | null;
  initialLanguage: string;
  initialBrandVoice: string;
};

const MAX_VOICE_CHARS = 5000;

export function BasicsForm({
  brandId,
  locale,
  initialCategoryId,
  initialDisplayName,
  initialLanguage,
  initialBrandVoice,
}: Props) {
  const t = useTranslations("brandSettings");

  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [displayName, setDisplayName] = useState<string | null>(
    initialDisplayName,
  );
  const [language, setLanguage] = useState<string>(initialLanguage);
  const [brandVoice, setBrandVoice] = useState<string>(initialBrandVoice);

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

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateBrandBasics(brandId, {
        industryCategoryId: categoryId,
        primaryLanguage: language,
        brandVoice: brandVoice,
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
