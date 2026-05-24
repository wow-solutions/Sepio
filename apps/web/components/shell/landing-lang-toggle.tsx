"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type { Route } from "next";
import { useTransition } from "react";

// Trilingual [EN][ES][RU] pill for the landing nav. Switches the URL locale
// while preserving the current path (next-intl locale-aware router). Styled by
// the .lang-toggle rules in landing.css.
export function LandingLangToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="lang-toggle" style={{ opacity: isPending ? 0.6 : 1 }}>
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          className={l === locale ? "active" : undefined}
          aria-current={l === locale ? "true" : undefined}
          onClick={() => {
            if (l === locale) return;
            startTransition(() => {
              router.replace(pathname as Route, { locale: l });
            });
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
