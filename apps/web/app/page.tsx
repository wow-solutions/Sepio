import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between border-b border-slate-900">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">Quoteworthy</span>
          <span className="text-xs text-emerald-500 border border-emerald-900 rounded px-2 py-0.5">
            pre-alpha
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <a
            href="https://github.com/wow-solutions/Quoteworthy"
            className="text-slate-400 hover:text-white"
          >
            GitHub
          </a>
          <Link href="/login" className="text-slate-400 hover:text-white">
            Log in
          </Link>
          <Link
            href="/signup"
            className="bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-1.5 text-white"
          >
            Sign up
          </Link>
        </nav>
      </header>

      <section className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center">
          <h1 className="text-5xl font-semibold tracking-tight mb-4">
            Content AI wants to{" "}
            <span className="text-emerald-400">quote.</span>
          </h1>
          <p className="text-lg text-slate-400 mb-8">
            Open-source content automation for marketing consultants
            managing 3-10 client brands. Optimized for AI search engines —
            content that ChatGPT, Perplexity, and Google AI Overviews
            actually cite.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className="bg-emerald-600 hover:bg-emerald-500 rounded px-5 py-2.5 text-white font-medium"
            >
              Start 14-day trial
            </Link>
            <a
              href="https://github.com/wow-solutions/Quoteworthy"
              className="border border-slate-700 hover:border-slate-500 rounded px-5 py-2.5 text-white"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <footer className="px-6 py-6 text-xs text-slate-500 text-center border-t border-slate-900">
        Apache 2.0 ·{" "}
        <a
          href="https://github.com/wow-solutions/Quoteworthy/blob/main/docs/privacy.md"
          className="hover:text-slate-300"
        >
          Privacy
        </a>{" "}
        ·{" "}
        <a
          href="https://github.com/wow-solutions/Quoteworthy/blob/main/docs/terms.md"
          className="hover:text-slate-300"
        >
          Terms
        </a>
      </footer>
    </main>
  );
}
