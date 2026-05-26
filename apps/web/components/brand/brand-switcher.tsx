"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { BrandDot } from "./brand-dot";
import { brandColor } from "@/lib/brand-color";

export type BrandOption = {
  id: string;
  name: string;
  slug: string;
  toneSummary?: string;
  postCount?: number;
  lastActivity?: string;
};

type Props = {
  brands: BrandOption[];
  currentBrandId: string | null;
  // "bar" = the legacy top-bar pill (fixed min-width). "rail" = full-width
  // workspace selector that sits at the top of the app rail (Phase 1 chassis).
  variant?: "bar" | "rail";
};

export function BrandSwitcher({ brands, currentBrandId, variant = "bar" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const current = useMemo(
    () => brands.find((b) => b.id === currentBrandId) ?? null,
    [brands, currentBrandId],
  );

  // ⌘B / Ctrl+B opens from anywhere
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function selectBrand(id: string | null) {
    setOpen(false);
    if (id === null) {
      router.push("/dashboard");
    } else {
      router.push(`/writer?brand=${id}`);
    }
  }

  const triggerColor = current ? brandColor(current.slug) : "var(--ink-faint)";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Switch brand"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            height: 32,
            padding: "0 10px 0 8px",
            background: "var(--surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            fontSize: 13,
            color: "var(--ink)",
            minWidth: variant === "rail" ? 0 : 232,
            width: variant === "rail" ? "100%" : undefined,
            cursor: "pointer",
            transition: "border-color 120ms",
          }}
        >
          <BrandDot color={triggerColor} />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 500,
              textAlign: "left",
            }}
          >
            {current ? current.name : "All brands"}
          </span>
          {current && typeof current.postCount === "number" && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-faint)",
                marginLeft: 2,
              }}
            >
              {current.postCount} posts
            </span>
          )}
          <span
            aria-hidden
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ink-faint)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 3,
              padding: "1px 4px",
              marginLeft: 4,
            }}
          >
            ⌘B
          </span>
          <span
            aria-hidden
            style={{
              color: "var(--ink-faint)",
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            ▾
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        style={{
          padding: 0,
          width: 360,
          background: "var(--overlay)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
        }}
      >
        <Command>
          <CommandInput placeholder="Search brands…" autoFocus />
          <CommandList>
            <CommandEmpty>No brand matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => selectBrand(null)}
              >
                <BrandDot color="var(--ink-faint)" />
                <span style={{ flex: 1, fontWeight: 500 }}>All brands</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ink-faint)",
                  }}
                >
                  {brands.length}
                </span>
              </CommandItem>
            </CommandGroup>
            {brands.length > 0 && <CommandSeparator />}
            <CommandGroup heading="Brands">
              {brands.map((b) => (
                <CommandItem
                  key={b.id}
                  value={`${b.name} ${b.slug}`}
                  onSelect={() => selectBrand(b.id)}
                >
                  <BrandDot color={brandColor(b.slug)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.name}
                      </span>
                      {b.id === currentBrandId && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            color: "var(--pass)",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                          }}
                        >
                          current
                        </span>
                      )}
                    </div>
                    {b.toneSummary && (
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "var(--ink-faint)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.toneSummary}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 2,
                      flexShrink: 0,
                    }}
                  >
                    {typeof b.postCount === "number" && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "var(--ink-faint)",
                        }}
                      >
                        {b.postCount} posts
                      </span>
                    )}
                    {b.lastActivity && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--ink-faint)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {b.lastActivity}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
