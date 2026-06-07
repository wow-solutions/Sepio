"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Link } from "@/i18n/navigation";
import { signout } from "@/lib/auth-actions";

gsap.registerPlugin(useGSAP);

type Labels = {
  account: string;
  changePassword: string;
  signOut: string;
};

// The avatar in the app top bar, upgraded to an account dropdown: change
// password (reuses the /reset form, which works with the live session) and
// sign out. The panel is always in the DOM (display toggled) so GSAP can play
// both the open and close animations. Closes on outside-click / Esc.
export function AccountMenu({
  userInitials = "—",
  labels,
}: {
  userInitials?: string;
  labels: Labels;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // GSAP open/close: scale + fade from the top-right corner. Runs client-side
  // only (useGSAP) and reverts automatically on unmount. The panel starts
  // display:none; we flip it on before animating in and off after animating out.
  useGSAP(
    () => {
      const panel = panelRef.current;
      if (!panel) return;
      if (open) {
        gsap.set(panel, { display: "block" });
        gsap.fromTo(
          panel,
          { opacity: 0, scale: 0.96, y: -4 },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            duration: 0.16,
            ease: "power2.out",
            transformOrigin: "top right",
          },
        );
      } else {
        gsap.to(panel, {
          opacity: 0,
          scale: 0.96,
          y: -4,
          duration: 0.12,
          ease: "power2.in",
          onComplete: () => {
            if (panelRef.current) panelRef.current.style.display = "none";
          },
        });
      }
    },
    { dependencies: [open], scope: rootRef },
  );

  // Outside-click (pointerdown) / Esc to close, attached only while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={labels.account}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "var(--sepio-sepia)",
          color: "var(--sepio-cream)",
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-fraunces), Georgia, serif",
          fontVariationSettings: '"opsz" 36',
          fontSize: 13,
          fontWeight: 500,
          border: "1px solid rgba(176,123,80,0.32)",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {userInitials.slice(0, 2).toUpperCase()}
      </button>

      <div
        ref={panelRef}
        style={{
          display: "none",
          opacity: 0,
          position: "absolute",
          top: 40,
          right: 0,
          minWidth: 184,
          zIndex: 1000,
          background: "color-mix(in srgb, var(--raised) 82%, transparent)",
          backdropFilter: "blur(22px) saturate(180%)",
          WebkitBackdropFilter: "blur(22px) saturate(180%)",
          border: "1px solid color-mix(in srgb, var(--ink) 12%, transparent)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        }}
      >
        <Link
          href="/reset"
          onClick={() => setOpen(false)}
          style={{ textDecoration: "none" }}
        >
          <MenuRow label={labels.changePassword} />
        </Link>
        <div
          style={{
            height: "0.5px",
            background: "color-mix(in srgb, var(--ink) 10%, transparent)",
          }}
        />
        <form action={signout}>
          <MenuRow as="submit" label={labels.signOut} />
        </form>
      </div>
    </div>
  );
}

function MenuRow({
  label,
  as = "link",
}: {
  label: string;
  as?: "link" | "submit";
}) {
  const [active, setActive] = useState(false);
  const style: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "11px 14px",
    background: active
      ? "color-mix(in srgb, var(--ink) 9%, transparent)"
      : "transparent",
    border: 0,
    cursor: "pointer",
    color: "var(--ink)",
    fontFamily: "var(--font-sans)",
    fontSize: 13.5,
    fontWeight: 500,
    letterSpacing: "-0.01em",
    transition: "background 90ms ease",
  };
  // Highlight on hover AND keyboard focus (the latter is what state-only hover
  // would miss for keyboard users).
  const handlers = {
    onMouseEnter: () => setActive(true),
    onMouseLeave: () => setActive(false),
    onFocus: () => setActive(true),
    onBlur: () => setActive(false),
  };
  if (as === "submit") {
    return (
      <button type="submit" style={style} {...handlers}>
        {label}
      </button>
    );
  }
  return (
    <span style={style} {...handlers}>
      {label}
    </span>
  );
}
