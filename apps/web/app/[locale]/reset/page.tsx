import { getTranslations } from "next-intl/server";
import {
  AuthSplit,
  AuthPane,
  AuthDisplay,
  AuthLede,
  AuthFieldLabel,
  Eyebrow,
  Em,
} from "@/components/shell/auth-split";
import { updatePassword } from "./actions";

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ResetPage({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const t = await getTranslations("auth.reset");
  const tPane = await getTranslations("auth.pane");
  const tFooter = await getTranslations("auth.footer");

  const displayError =
    error === "tooShort"
      ? t("tooShort")
      : error === "mismatch"
        ? t("mismatch")
        : error || null;

  return (
    <AuthSplit
      screenLabel={t("eyebrow")}
      footer={{
        copyright: tFooter("copyright"),
        terms: tFooter("terms"),
        privacy: tFooter("privacy"),
      }}
      rightPane={
        <AuthPane
          eyebrow={tPane("eyebrow")}
          headline={tPane.rich("headline", { em: (c) => <Em>{c}</Em> })}
          lede={tPane("lede")}
        />
      }
    >
      <div style={{ marginBottom: 28 }}>
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <AuthDisplay>{t.rich("headline", { em: (c) => <Em>{c}</Em> })}</AuthDisplay>
        <AuthLede>{t("lede")}</AuthLede>
      </div>

      {displayError && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--risky-bg)",
            color: "var(--risky)",
            border: "1px solid rgba(194,104,90,0.20)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {displayError}
        </div>
      )}

      <form action={updatePassword} style={{ display: "grid", gap: 16 }}>
        <div>
          <AuthFieldLabel htmlFor="password">{t("password")}</AuthFieldLabel>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="auth-input"
          />
        </div>
        <div>
          <AuthFieldLabel htmlFor="confirm">{t("confirm")}</AuthFieldLabel>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="auth-input"
          />
        </div>
        <button type="submit" className="auth-btn-primary" style={{ marginTop: 6 }}>
          {t("submit")} →
        </button>
      </form>
    </AuthSplit>
  );
}
