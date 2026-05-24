import type { Metadata } from "next";
import { MarkdownPage } from "@/components/legal/markdown-page";
import { LegalShell } from "./shell";

export const metadata: Metadata = {
  title: "Privacy Policy — Sepio",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalShell>
      <MarkdownPage file="privacy.md" />
    </LegalShell>
  );
}
