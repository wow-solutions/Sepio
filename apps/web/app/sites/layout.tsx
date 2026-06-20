import { Fraunces, Onest, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { bareHost } from "@/lib/app-host";
import { resolveBlogDomain } from "@/lib/blog-domain";
import "../globals.css";

// Layout for the client blog domains (blog.client.com), served under the
// _sites subtree (the proxy rewrites custom hosts here). The root layout is a
// passthrough and the html/body/theme normally live in [locale]/layout — which
// this subtree does NOT pass through — so we provide our own html/body shell,
// fonts, globals.css, and the editorial theme here. No NextIntlClientProvider:
// the client blog renders no localized app UI. <html lang> uses the brand's
// primary locale; per-article hreflang carries the precise per-locale signal.
const onest = Onest({ variable: "--font-onest", subsets: ["latin", "cyrillic"] });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
});

export default async function SitesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const host = bareHost((await headers()).get("host"));
  const domain = await resolveBlogDomain(host);
  const lang = domain?.primaryLocale ?? "en";

  return (
    <html
      lang={lang}
      className={`dark ${onest.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
