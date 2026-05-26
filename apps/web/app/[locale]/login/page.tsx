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
import { login } from "./actions";

type PageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const { error, message } = await searchParams;
  const t = await getTranslations("auth.login");
  const tPane = await getTranslations("auth.pane");
  const tFooter = await getTranslations("auth.footer");
  const tMsg = await getTranslations();

  // Translate auth.messages.* keys passed via URL; show plain strings as-is.
  function translateOrRaw(value: string | undefined): string | undefined {
    if (!value) return value;
    if (!value.startsWith("auth.messages.")) return value;
    try {
      return tMsg(value as never);
    } catch {
      return value;
    }
  }
  const displayMessage = translateOrRaw(message);
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
      <div style={{ marginBottom: 28 }}>
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <AuthDisplay>{t.rich("headline", { em: (c) => <Em>{c}</Em> })}</AuthDisplay>
        <AuthLede>{t("lede")}</AuthLede>
      </div>

      {displayMessage && <Banner kind="pass">{displayMessage}</Banner>}
      {displayError && <Banner kind="risky">{displayError}</Banner>}

      <form action={login} style={{ display: "grid", gap: 16 }}>
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
          <AuthFieldLabel
            htmlFor="password"
            hint={
              <Link
                href="/forgot"
                style={{ color: "var(--sepio-sepia-bright)", textDecoration: "none" }}
              >
                {t("forgotLink")}
              </Link>
            }
          >
            {t("password")}
          </AuthFieldLabel>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="auth-input"
          />
        </div>
        <button type="submit" className="auth-btn-primary" style={{ marginTop: 6 }}>
          {t("submit")} →
        </button>
      </form>

      <p
        style={{
          textAlign: "center",
          fontSize: 13.5,
          color: "var(--ink-muted)",
          marginTop: 28,
          paddingTop: 22,
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        {t("noAccount")}{" "}
        <Link
          href="/signup"
          style={{
            color: "var(--sepio-sepia-bright)",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          {t("signupLink")}
        </Link>
      </p>
    </AuthSplit>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: "pass" | "risky";
  children: React.ReactNode;
}) {
  const styles =
    kind === "pass"
      ? {
          background: "var(--pass-bg)",
          color: "var(--pass)",
          border: "1px solid rgba(122,160,121,0.20)",
        }
      : {
          background: "var(--risky-bg)",
          color: "var(--risky)",
          border: "1px solid rgba(194,104,90,0.20)",
        };
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "10px 12px",
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.5,
        ...styles,
      }}
    >
      {children}
    </div>
  );
}
