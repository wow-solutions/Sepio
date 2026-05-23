import type { Metadata } from "next";
import { MarkdownPage } from "@/components/legal/markdown-page";
import { LegalShell } from "../privacy/shell";

export const metadata: Metadata = {
  title: "Terms of Service — Quoteworthy",
};

export default function TermsOfServicePage() {
  return (
    <LegalShell>
      <MarkdownPage file="terms.md" />
    </LegalShell>
  );
}
