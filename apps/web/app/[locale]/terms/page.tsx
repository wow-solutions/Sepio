import type { Metadata } from "next";
import { MarkdownPage } from "@/components/legal/markdown-page";
import type { Locale } from "@/i18n/routing";
import { alternatesFor, localizedUrl } from "@/lib/seo";
import { LegalShell } from "../privacy/shell";

const TITLE = "Terms of Service — Sepio";
const DESCRIPTION =
  "The terms governing your use of Sepio, the expert-content engine for marketing and content agencies.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const l = ((await params).locale as Locale) ?? "en";
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: alternatesFor(l, "terms"),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: localizedUrl(l, "terms"),
      siteName: "Sepio",
      type: "website",
    },
  };
}

export default function TermsOfServicePage() {
  return (
    <LegalShell>
      <MarkdownPage file="terms.md" />
    </LegalShell>
  );
}
