import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SepioMark } from "@/components/shell/sepio-mark";
import { Wordmark } from "@/components/shell/wordmark";
import { login } from "./actions";

type PageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const { error, message } = await searchParams;
  const t = await getTranslations("auth.login");
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
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "24px 16px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 28,
          }}
        >
          <SepioMark size={32} />
          <Wordmark size={18} />
        </div>

        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.018em",
            color: "var(--ink)",
            margin: 0,
            marginBottom: 6,
          }}
        >
          {t("title")}
        </h1>
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 15,
            color: "var(--ink-muted)",
            margin: 0,
            marginBottom: 24,
          }}
        >
          {t("tagline")}
        </p>

        {displayMessage && <Banner kind="pass">{displayMessage}</Banner>}
        {displayError && <Banner kind="risky">{displayError}</Banner>}

        <form action={login} style={{ display: "grid", gap: 14 }}>
          <Field id="email" label={t("email")}>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </Field>
          <Field id="password" label={t("password")}>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" className="w-full mt-2 h-9">
            {t("submit")}
          </Button>
        </form>

        <p
          style={{
            fontSize: 13,
            color: "var(--ink-muted)",
            marginTop: 24,
            textAlign: "center",
          }}
        >
          {t("noAccount")}{" "}
          <Link
            href="/signup"
            style={{ color: "var(--info)", textDecoration: "none" }}
          >
            {t("signupLink")}
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label
        htmlFor={id}
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 500,
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginBottom: 6,
        }}
      >
        {label}
      </Label>
      {children}
    </div>
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
        borderRadius: 6,
        fontSize: 13,
        lineHeight: 1.5,
        ...styles,
      }}
    >
      {children}
    </div>
  );
}
