import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuoteworthyMark } from "@/components/shell/quoteworthy-mark";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <Header />

      <Hero />
      <Problem />
      <How />
      <FinalCTA />

      <Footer />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────── */

async function Header() {
  const t = await getTranslations("landing.header");
  return (
    <header
      style={{
        height: "var(--shell-topbar-h)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <QuoteworthyMark size={28} />
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            color: "var(--ink)",
          }}
        >
          Quoteworthy
        </span>
        <Eyebrow style={{ marginLeft: 8 }}>{t("preAlpha")}</Eyebrow>
      </div>

      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          fontSize: 13,
        }}
      >
        <Link href="/pricing" style={{ color: "var(--ink-muted)" }}>
          {t("pricing")}
        </Link>
        <a
          href="https://github.com/wow-solutions/Quoteworthy"
          style={{ color: "var(--ink-muted)" }}
        >
          GitHub
        </a>
        <Link href="/login" style={{ color: "var(--ink-muted)" }}>
          {t("login")}
        </Link>
        <Link href="/signup">
          <Button size="sm">{t("signup")}</Button>
        </Link>
        <LocaleSwitcher />
      </nav>
    </header>
  );
}

async function Hero() {
  const t = await getTranslations("landing.hero");
  return (
    <Section paddingY={120}>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h1
        style={{
          fontSize: "var(--text-display)",
          lineHeight: "var(--leading-tight)",
          letterSpacing: "var(--tracking-tight)",
          fontWeight: 600,
          color: "var(--ink)",
          margin: "16px 0 12px",
          maxWidth: 760,
        }}
      >
        {t("h1")}
      </h1>
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontSize: 22,
          color: "var(--ink-muted)",
          margin: 0,
          marginBottom: 24,
        }}
      >
        {t("tagline")}
      </p>
      <p
        style={{
          fontSize: 16,
          lineHeight: "var(--leading-relaxed)",
          color: "var(--ink-muted)",
          margin: 0,
          marginBottom: 32,
          maxWidth: 620,
        }}
      >
        {t("body")}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/signup">
          <Button size="lg">{t("signup")}</Button>
        </Link>
        <Link
          href="/login"
          style={{
            fontSize: 14,
            color: "var(--ink-muted)",
            padding: "10px 14px",
          }}
        >
          {t("alreadyHave")}
        </Link>
      </div>
    </Section>
  );
}

async function Problem() {
  const t = await getTranslations("landing.problem");
  return (
    <Section paddingY={96} bordered>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h2
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--leading-tight)",
          letterSpacing: "var(--tracking-tight)",
          fontWeight: 600,
          color: "var(--ink)",
          margin: "16px 0 32px",
          maxWidth: 640,
        }}
      >
        {t("h2")}
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 24,
          maxWidth: 720,
          marginBottom: 24,
        }}
      >
        <Stat number={t("stat1.number")} label={t("stat1.label")} />
        <Stat number={t("stat2.number")} label={t("stat2.label")} />
        <Stat number={t("stat3.number")} label={t("stat3.label")} />
      </div>

      <p
        style={{
          fontSize: 15,
          lineHeight: "var(--leading-relaxed)",
          color: "var(--ink-muted)",
          margin: 0,
          maxWidth: 620,
        }}
      >
        {t("body")}
      </p>
    </Section>
  );
}

async function How() {
  const t = await getTranslations("landing.how");
  return (
    <Section paddingY={96} bordered>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h2
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--leading-tight)",
          letterSpacing: "var(--tracking-tight)",
          fontWeight: 600,
          color: "var(--ink)",
          margin: "16px 0 40px",
        }}
      >
        {t("h2")}
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 32,
        }}
      >
        <Step n="01" title={t("step1.title")} body={t("step1.body")} />
        <Step n="02" title={t("step2.title")} body={t("step2.body")} />
        <Step n="03" title={t("step3.title")} body={t("step3.body")} />
      </div>
    </Section>
  );
}

async function FinalCTA() {
  const t = await getTranslations("landing.finalCta");
  return (
    <Section paddingY={96} bordered>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h2
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--leading-tight)",
          letterSpacing: "var(--tracking-tight)",
          fontWeight: 600,
          color: "var(--ink)",
          margin: "16px 0 12px",
        }}
      >
        {t("h2")}
      </h2>
      <p
        style={{
          fontSize: 16,
          color: "var(--ink-muted)",
          margin: 0,
          marginBottom: 24,
          maxWidth: 560,
        }}
      >
        {t("body")}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/signup">
          <Button size="lg">{t("signup")}</Button>
        </Link>
        <a
          href="https://github.com/wow-solutions/Quoteworthy"
          style={{
            fontSize: 14,
            color: "var(--ink-muted)",
            padding: "10px 14px",
          }}
        >
          {t("github")}
        </a>
      </div>
    </Section>
  );
}

async function Footer() {
  const t = await getTranslations("landing.footer");
  return (
    <footer
      style={{
        padding: "32px 24px",
        textAlign: "center",
        fontSize: 12,
        color: "var(--ink-faint)",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      {t("license")} ·{" "}
      <Link
        href="/privacy"
        style={{ color: "var(--ink-faint)" }}
      >
        {t("privacy")}
      </Link>{" "}
      ·{" "}
      <Link
        href="/terms"
        style={{ color: "var(--ink-faint)" }}
      >
        {t("terms")}
      </Link>
    </footer>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Helpers                                                       */
/* ──────────────────────────────────────────────────────────── */

function Section({
  children,
  paddingY,
  bordered = false,
}: {
  children: React.ReactNode;
  paddingY: number;
  bordered?: boolean;
}) {
  return (
    <section
      style={{
        padding: `${paddingY}px 24px`,
        borderTop: bordered ? "1px solid var(--border-subtle)" : undefined,
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function Eyebrow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--ink-faint)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 36,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: "var(--risky)",
          lineHeight: 1.1,
          marginBottom: 8,
        }}
      >
        {number}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--ink-muted)",
          lineHeight: "var(--leading-snug)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.12em",
          color: "var(--ink-faint)",
          marginBottom: 12,
        }}
      >
        {n}
      </div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "-0.015em",
          color: "var(--ink)",
          margin: 0,
          marginBottom: 8,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 14,
          lineHeight: "var(--leading-relaxed)",
          color: "var(--ink-muted)",
          margin: 0,
        }}
      >
        {body}
      </p>
    </div>
  );
}
