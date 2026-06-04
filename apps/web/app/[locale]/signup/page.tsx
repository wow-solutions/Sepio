import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  AuthSplit,
  AuthPane,
  AuthDisplay,
  AuthLede,
  AuthFieldLabel,
  Eyebrow,
  Em,
} from "@/components/shell/auth-split";
import { signup } from "./actions";

// Auth surface: keep out of the index but let link equity flow.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SignupPage({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const t = await getTranslations("auth.signup");
  const tPane = await getTranslations("auth.pane");
  const tFooter = await getTranslations("auth.footer");
  const tMsg = await getTranslations();

  function translateOrRaw(value: string | undefined): string | undefined {
    if (!value) return value;
    if (!value.startsWith("auth.messages.")) return value;
    try {
      return tMsg(value as never);
    } catch {
      return value;
    }
  }
  const displayError = translateOrRaw(error);

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
      <div style={{ marginBottom: 24 }}>
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

      <form action={signup} style={{ display: "grid", gap: 16 }}>
        <div>
          <AuthFieldLabel htmlFor="display_name" hint={t("optional")}>
            {t("displayName")}
          </AuthFieldLabel>
          <input
            id="display_name"
            name="display_name"
            type="text"
            autoComplete="name"
            className="auth-input"
          />
        </div>
        <div>
          <AuthFieldLabel htmlFor="email">{t("email")}</AuthFieldLabel>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="auth-input"
          />
        </div>
        <div>
          <AuthFieldLabel htmlFor="password" hint={t("passwordHint")}>
            {t("password")}
          </AuthFieldLabel>
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
        <button type="submit" className="auth-btn-primary" style={{ marginTop: 6 }}>
          {t("submit")} →
        </button>
      </form>

      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink-faint)",
          marginTop: 18,
          textAlign: "center",
          letterSpacing: "0.02em",
          lineHeight: 1.6,
        }}
      >
        {t.rich("legal", {
          terms: (chunks) => (
            <Link
              href="/terms"
              style={{ color: "var(--ink-muted)", textDecoration: "underline" }}
            >
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link
              href="/privacy"
              style={{ color: "var(--ink-muted)", textDecoration: "underline" }}
            >
              {chunks}
            </Link>
          ),
        })}
      </p>

      <p
        style={{
          textAlign: "center",
          fontSize: 13.5,
          color: "var(--ink-muted)",
          marginTop: 24,
          paddingTop: 20,
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        {t("haveAccount")}{" "}
        <Link
          href="/login"
          style={{
            color: "var(--sepio-sepia-bright)",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          {t("loginLink")}
        </Link>
      </p>
    </AuthSplit>
  );
}
