import { redirect } from "next/navigation";
import type { Metadata, Route } from "next";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingLangToggle } from "@/components/shell/landing-lang-toggle";
import { BlogWordmark } from "@/components/shell/blog-wordmark";
import type { Locale } from "@/i18n/routing";
import { alternatesFor, localizedUrl } from "@/lib/seo";
import { landingCopy } from "./landing-copy";
import { StructuredData } from "./_components/structured-data";
import "./landing.css";

// Markup + styles ported from design_handoff_sepio_brand v1 (Sepio Landing.html).
// Copy comes from landing-copy.tsx (en/es/ru); brand names, prices, icons, times
// and sample data stay inline because they are not translated.

const TITLE =
  "Sepio — Expert Content Engine for Agencies | GEO + AI Citations";
const DESCRIPTION =
  "Sepio turns client expertise into multi-platform content built for GEO — the kind AI assistants cite. For agencies. Start free, no card.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const l = (locale as Locale) ?? "en";
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: alternatesFor(l, ""),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: localizedUrl(l, ""),
      siteName: "Sepio",
      type: "website",
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const C = landingCopy[locale as Locale] ?? landingCopy.en;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/dashboard");
  }

  const adaptPlatforms = ["LinkedIn", "Telegram", "Threads", "Instagram", "TikTok", "Blog"];
  const schedule = [
    { time: "09:00", name: "LinkedIn", now: true },
    { time: "09:05", name: "Telegram" },
    { time: "09:10", name: "Threads" },
    { time: "14:00", name: "Instagram" },
    { time: "18:00", name: "TikTok" },
    { time: "23:00", name: "Blog" },
  ];
  const channels = [
    { name: "LinkedIn", active: true },
    { name: "Telegram" },
    { name: "Instagram" },
    { name: "TikTok" },
    { name: "Threads", off: true },
    { name: "Blog" },
  ];
  const platformCards = [
    { icon: "in", name: "LinkedIn" },
    { icon: "Tg", name: "Telegram" },
    { icon: "Ig", name: "Instagram" },
    { icon: "Tk", name: "TikTok" },
    { icon: "Th", name: "Threads" },
    { icon: "Bl", name: "Blog" },
  ];
  const featureIcons = [
    <svg key="i0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 5v3M12 16v3M5 12h3M16 12h3M7 7l2 2M15 15l2 2M7 17l2-2M15 9l2-2" /></svg>,
    <svg key="i1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /><circle cx="12" cy="14" r="1" fill="currentColor" /></svg>,
    <svg key="i2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>,
    <svg key="i3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>,
  ];
  const prices = ["$24", "$89", "$240"];
  const footerHrefs: string[][] = [
    ["#how", "#features", "#platforms", "#pricing"],
    ["#", "/blog", "#", "#"], // Company → Blog (label[1][1]) now links to the public blog
    ["#", "#", "#", "#"],
    ["/privacy", "/terms", "#", "#"],
  ];

  return (
    <div className="lp">
      <StructuredData />
      {/* NAV */}
      <header className="nav">
        <div className="nav-inner">
          <Link href="/" className="brand">
            <span className="mark">
              <ForkSvg stroke={4} bigDot={11} dot={10} />
            </span>
            <span className="wm">
              Sepi<span className="o">o</span>
            </span>
          </Link>
          <nav className="nav-links">
            <a href="#how">{C.nav.howItWorks}</a>
            <a href="#platforms">{C.nav.platforms}</a>
            <a href="#features">{C.nav.features}</a>
            <a href="#pricing">{C.nav.pricing}</a>
            <a href="#faq">{C.nav.faq}</a>
            <BlogWordmark size={26} />
          </nav>
          <div className="nav-cta">
            <LandingLangToggle />
            <Link href="/login" className="btn-ghost">
              {C.nav.signIn}
            </Link>
            <Link href="/signup" className="btn-primary">
              {C.nav.startFree}
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="container hero-inner">
          <span className="eyebrow">{C.hero.eyebrow}</span>
          <h1 className="display-1">{C.hero.h1}</h1>
          <p className="lede">{C.hero.lede}</p>
          <div className="hero-ctas">
            <Link href="/signup" className="btn-lg-primary">
              <span>{C.hero.startFree}</span>
              <span className="arrow">→</span>
            </Link>
            <a href="#how" className="btn-lg-ghost">
              {C.hero.seeHow}
            </a>
          </div>
          <div className="hero-tag-row">
            <span className="live">{C.hero.tagLive}</span>
            <span className="dot" />
            <span>{C.hero.tag6}</span>
            <span className="dot" />
            <span>{C.hero.tagSchedule}</span>
            <span className="dot" />
            <span>{C.hero.tagNoCard}</span>
          </div>

          <div className="mark-stage">
            <div className="fork-tile">
              <svg viewBox="0 0 200 200" aria-hidden="true">
                <circle cx="32" cy="100" r="14" className="fk-pulse-ring" />
                <circle cx="32" cy="100" r="14" fill="#f3ece1" className="fk-source" />
                <g stroke="#f3ece1" strokeWidth="3.5" fill="none" strokeLinecap="round">
                  <path d="M 46 100 C 90 100, 100 100, 118 28" pathLength={1} className="fk-line fk-line-1" />
                  <path d="M 46 100 C 100 100, 110 100, 130 64" pathLength={1} className="fk-line fk-line-2" />
                  <path d="M 46 100 L 168 100" pathLength={1} className="fk-line fk-line-3" />
                  <path d="M 46 100 C 100 100, 110 100, 130 136" pathLength={1} className="fk-line fk-line-4" />
                  <path d="M 46 100 C 90 100, 100 100, 118 172" pathLength={1} className="fk-line fk-line-5" />
                </g>
                {[
                  { c: "fk-p-1", cx: 122, cy: 22, r: 16, t: "in" },
                  { c: "fk-p-2", cx: 135, cy: 58, r: 16, t: "Tg" },
                  { c: "fk-p-3", cx: 172, cy: 100, r: 17, t: "Ig" },
                  { c: "fk-p-4", cx: 135, cy: 142, r: 16, t: "Tt" },
                  { c: "fk-p-5", cx: 122, cy: 178, r: 16, t: "Bl" },
                ].map((p) => (
                  <g key={p.c} className={`fk-platform ${p.c}`}>
                    <circle cx={p.cx} cy={p.cy} r={p.r} fill="#f3ece1" />
                    <text x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="700" fill="#1C1815" letterSpacing="-0.5">
                      {p.t}
                    </text>
                  </g>
                ))}
                <circle cx="122" cy="22" r="9" fill="#B07B50" className="fk-dot fk-dot-1" />
                <circle cx="135" cy="58" r="9" fill="#B07B50" className="fk-dot fk-dot-2" />
                <circle cx="172" cy="100" r="10" fill="#B07B50" className="fk-dot fk-dot-3" />
                <circle cx="135" cy="142" r="9" fill="#B07B50" className="fk-dot fk-dot-4" />
                <circle cx="122" cy="178" r="9" fill="#B07B50" className="fk-dot fk-dot-5" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" id="how">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">{C.how.eyebrow}</span>
            <h2 className="display-2">{C.how.h2}</h2>
            <p className="lede">{C.how.lede}</p>
          </div>
          <div className="steps">
            <article className="step">
              <div className="step-num">{C.how.steps[0].num}</div>
              <h3>{C.how.steps[0].title}</h3>
              <p>{C.how.steps[0].body}</p>
              <div className="step-art">
                <div className="art-write">
                  {C.how.write}
                  <span className="ph-cursor" />
                </div>
              </div>
            </article>

            <article className="step">
              <div className="step-num">{C.how.steps[1].num}</div>
              <h3>{C.how.steps[1].title}</h3>
              <p>{C.how.steps[1].body}</p>
              <div className="step-art">
                <div className="art-adapt">
                  {adaptPlatforms.map((p, i) => (
                    <div className="ad-card" key={p}>
                      <div className="ad-platform">{p}</div>
                      {C.how.adaptDesc[i]}
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="step">
              <div className="step-num">{C.how.steps[2].num}</div>
              <h3>{C.how.steps[2].title}</h3>
              <p>{C.how.steps[2].body}</p>
              <div className="step-art">
                <div className="art-schedule">
                  {schedule.map((s) => (
                    <div className={`sl${s.now ? " now" : ""}`} key={s.name}>
                      <span className="sl-time">{s.time}</span>
                      <span className="sl-name">{s.name}</span>
                      <span className="sl-dot" />
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* PRODUCT DEMO */}
      <section className="section demo-section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">{C.demo.eyebrow}</span>
            <h2 className="display-2">{C.demo.h2}</h2>
            <p className="lede">{C.demo.lede}</p>
          </div>

          <div className="demo-card">
            <div className="demo-bar">
              <div className="lights"><span /><span /><span /></div>
              <div className="crumb">
                <span className="ph-pulse" />
                <span><b>sepio.app</b> · queue · 6 channels</span>
              </div>
              <div className="demo-search">⌘K · jump</div>
            </div>
            <div className="demo-grid">
              <aside className="demo-rail">
                <div className="rh">{C.demo.channelsLabel}</div>
                {channels.map((ch) => (
                  <div className={`ch${ch.active ? " active" : ""}${ch.off ? " off" : ""}`} key={ch.name}>
                    <span className="ch-dot" />
                    {ch.name}
                    <span className="ch-status">{ch.off ? C.demo.statusDraft : C.demo.statusLive}</span>
                  </div>
                ))}
                <hr />
                <div className="add">{C.demo.connect}</div>
              </aside>

              <div className="demo-body">
                <div className="post-head">
                  <div className="post-title">{C.demo.postTitle}</div>
                  <div className="post-meta">{C.demo.postMeta}</div>
                </div>
                <div className="editor-toolbar">
                  <button>H1</button>
                  <button>H2</button>
                  <div className="div" />
                  <button>B</button>
                  <button style={{ fontStyle: "italic" }}>I</button>
                  <button>U</button>
                  <div className="div" />
                  <button>“ ”</button>
                  <button>—</button>
                  <button>‹›</button>
                </div>
                <div className="editor">
                  <p>{C.demo.editor[0]}</p>
                  <p>{C.demo.editor[1]}</p>
                  <p>
                    {C.demo.editor[2]}
                    <span className="ph-cursor" />
                  </p>
                </div>
              </div>

              <aside className="demo-aside">
                <div className="ah">{C.demo.previewLabel}</div>
                <div className="preview-tabs">
                  <button className="active">LinkedIn</button>
                  <button>Telegram</button>
                  <button>Threads</button>
                </div>
                <div className="preview-card">
                  <div className="pc-head">
                    <div className="pc-avatar">A</div>
                    <div>
                      <div className="pc-name">Anna Mironova</div>
                      <div className="pc-sub">{C.demo.pcSub}</div>
                    </div>
                  </div>
                  <p className="pc-text">{C.demo.pcText1}</p>
                  <p className="pc-text" style={{ marginTop: 8 }}>{C.demo.pcText2}</p>
                  <div className="pc-actions">
                    <span>184</span>
                    <span>26</span>
                    <span>14</span>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORMS */}
      <section className="platforms-section" id="platforms">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">{C.platforms.eyebrow}</span>
            <h2 className="display-2">{C.platforms.h2}</h2>
            <p className="lede">{C.platforms.lede}</p>
          </div>
          <div className="platforms-grid">
            {platformCards.map((p, i) => (
              <article className="platform-card" key={p.name}>
                <div className="pc-icon">{p.icon}</div>
                <div className="pc-name">{p.name}</div>
                <div className="pc-format">{C.platforms.fmt[i]}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section" id="features">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">{C.features.eyebrow}</span>
            <h2 className="display-2">{C.features.h2}</h2>
          </div>
          <div className="feature-grid">
            {C.features.items.map((f, i) => (
              <article className="feature" key={i}>
                <div className="feature-icon">{featureIcons[i]}</div>
                <div className="feature-body">
                  <h4>{f.title}</h4>
                  <p>{f.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className="testimonial-section">
        <div className="container testimonial">
          <blockquote>{C.testimonial.quote}</blockquote>
          <div className="attribution">
            <div className="av">M</div>
            <div className="at-text">
              <div className="at-name">Marcus Vela</div>
              <div className="at-role">{C.testimonial.role}</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section" id="pricing">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">{C.pricing.eyebrow}</span>
            <h2 className="display-2">{C.pricing.h2}</h2>
          </div>
          <div className="early-access">
            <div className="ea-left">
              <span className="ea-eyebrow">{C.pricing.early.tier}</span>
              <div className="ea-name">{C.pricing.early.name}</div>
              <div className="ea-sub">{C.pricing.early.sub}</div>
            </div>
            <div className="ea-right">
              <div className="ea-amount">
                <span className="num">$29</span>
                <span className="per">/ {C.pricing.perMonth}</span>
              </div>
              <div className="ea-note">{C.pricing.early.note}</div>
              <Link href="/signup" className="price-cta primary">
                {C.pricing.early.cta}
              </Link>
            </div>
          </div>
          <div className="pricing-grid">
            {C.pricing.tiers.map((t, i) => (
              <article className="price-card soon" key={t.tier}>
                <div className="tier">
                  {t.tier}
                  <span className="badge soon-badge">{C.pricing.soon}</span>
                </div>
                <div className="price-name">{t.name}</div>
                <div className="price-sub">{t.sub}</div>
                <div className="price-amount">
                  <span className="num">{prices[i]}</span>
                  <span className="per">/ {C.pricing.perMonth}</span>
                </div>
                <ul>
                  {t.features.map((li, j) => (
                    <li className={i === 0 && j === t.features.length - 1 ? "muted" : undefined} key={li}>
                      {li}
                    </li>
                  ))}
                </ul>
                <span className="price-cta soon-cta" aria-disabled="true">
                  {C.pricing.soon}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section" id="faq">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">{C.faq.eyebrow}</span>
            <h2 className="display-2">{C.faq.h2}</h2>
          </div>
          <div className="faq-grid">
            {C.faq.items.map((item) => (
              <div className="faq" key={item.q}>
                <h4>{item.q}</h4>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final-cta">
        <div className="container">
          <h2>{C.finalCta.h2}</h2>
          <p className="lede">{C.finalCta.lede}</p>
          <div className="ctas">
            <Link href="/signup" className="btn-lg-primary">
              <span>{C.finalCta.startFree}</span>
              <span className="arrow">→</span>
            </Link>
            <Link href="/login" className="btn-lg-ghost">
              {C.finalCta.bookDemo}
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="brand-footer">
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="fb-mark">
                <span className="ftile">
                  <ForkSvg stroke={3.5} bigDot={10} dot={9} />
                </span>
                <span className="fname">
                  Sepi<span className="o">o</span>
                </span>
              </div>
              <p>{C.footer.desc}</p>
            </div>
            {C.footer.cols.map((col, ci) => (
              <div className="footer-col" key={col.title}>
                <h5>{col.title}</h5>
                <ul>
                  {col.links.map((label, li) => {
                    const href = footerHrefs[ci][li];
                    return (
                      <li key={label}>
                        {href.startsWith("/") ? (
                          <Link href={href as Route}>{label}</Link>
                        ) : (
                          <a href={href}>{label}</a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <div className="footer-legal">
            <span>© 2026 Sepio · <a href="https://sepio.app">sepio.app</a></span>
            <span>{C.footer.legalRight}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* Static Fork glyph for the nav + footer tiles (the hero uses the animated
   version inline). Geometry locked by the handoff. */
function ForkSvg({
  stroke,
  bigDot,
  dot,
}: {
  stroke: number;
  bigDot: number;
  dot: number;
}) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="32" cy="100" r="14" fill="#f3ece1" />
      <g stroke="#f3ece1" strokeWidth={stroke} fill="none" strokeLinecap="round" opacity="0.93">
        <path d="M 46 100 C 90 100, 100 100, 118 28" />
        <path d="M 46 100 C 100 100, 110 100, 130 64" />
        <path d="M 46 100 L 168 100" />
        <path d="M 46 100 C 100 100, 110 100, 130 136" />
        <path d="M 46 100 C 90 100, 100 100, 118 172" />
      </g>
      <g fill="#B07B50">
        <circle cx="122" cy="22" r={dot} />
        <circle cx="135" cy="58" r={dot} />
        <circle cx="172" cy="100" r={bigDot} />
        <circle cx="135" cy="142" r={dot} />
        <circle cx="122" cy="178" r={dot} />
      </g>
    </svg>
  );
}
