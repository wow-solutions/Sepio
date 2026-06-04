import type { Metadata } from "next";
import { MarkdownPage } from "@/components/legal/markdown-page";
import type { Locale } from "@/i18n/routing";
import { alternatesFor, localizedUrl } from "@/lib/seo";
import { LegalShell } from "./shell";

const TITLE = "Privacy Policy — Sepio";
const DESCRIPTION =
  "How Sepio collects, uses, and protects your data. Client credentials and brand voice stay encrypted and never train shared models.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const l = ((await params).locale as Locale) ?? "en";
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: alternatesFor(l, "privacy"),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: localizedUrl(l, "privacy"),
      siteName: "Sepio",
      type: "website",
    },
  };
}

export default function PrivacyPolicyPage() {
  return (
    <LegalShell>
      <MarkdownPage file="privacy.md" />
    </LegalShell>
  );
}
