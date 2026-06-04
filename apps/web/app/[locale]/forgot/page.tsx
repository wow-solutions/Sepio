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
import { requestReset } from "./actions";

// Auth surface: keep out of the index but let link equity flow.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

type PageProps = {
  searchParams: Promise<{ sent?: string }>;
};

export default async function ForgotPage({ searchParams }: PageProps) {
  const { sent } = await searchParams;
  const t = await getTranslations("auth.forgot");
  const tPane = await getTranslations("auth.pane");
  const tFooter = await getTranslations("auth.footer");

  const pane = (
    <AuthPane
      eyebrow={tPane("eyebrow")}
      headline={tPane.rich("headline", { em: (c) => <Em>{c}</Em> })}
      lede={tPane("lede")}
    />
  );
  const footer = {
    copyright: tFooter("copyright"),
    terms: tFooter("terms"),
    privacy: tFooter("privacy"),
  };

  if (sent) {
    return (
      <AuthSplit screenLabel={t("eyebrow")} footer={footer} rightPane={pane}>
        <div style={{ marginBottom: 28 }}>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <AuthDisplay>{t.rich("sentTitle", { em: (c) => <Em>{c}</Em> })}</AuthDisplay>
          <AuthLede>{t("sentBody")}</AuthLede>
        </div>
        <BackLink label={t("back")} />
      </AuthSplit>
    );
  }

  return (
    <AuthSplit screenLabel={t("eyebrow")} footer={footer} rightPane={pane}>
      <div style={{ marginBottom: 28 }}>
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <AuthDisplay>{t.rich("headline", { em: (c) => <Em>{c}</Em> })}</AuthDisplay>
        <AuthLede>{t("lede")}</AuthLede>
      </div>

      <form action={requestReset} style={{ display: "grid", gap: 16 }}>
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
        <button type="submit" className="auth-btn-primary" style={{ marginTop: 6 }}>
          {t("submit")} →
        </button>
      </form>

      <div
        style={{
          marginTop: 28,
          paddingTop: 22,
          borderTop: "1px solid var(--border-subtle)",
          textAlign: "center",
        }}
      >
        <BackLink label={t("back")} />
      </div>
    </AuthSplit>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/login"
      style={{
        fontSize: 13.5,
        color: "var(--sepio-sepia-bright)",
        textDecoration: "none",
        fontWeight: 500,
      }}
    >
      {label}
    </Link>
  );
}
