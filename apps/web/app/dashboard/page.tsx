import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signout } from "./actions";

type PageProps = {
  searchParams: Promise<{ brand?: string }>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const { brand: highlightId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("display_name, plan_tier, plan_status, trial_ends_at")
    .eq("id", user.id)
    .single();

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name, slug, industry, primary_language, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const list = brands ?? [];

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Quoteworthy</h1>
          <p className="text-xs text-slate-500">
            {account?.display_name ?? user.email}
            {" · "}
            <span className="text-emerald-400">
              {account?.plan_tier ?? "trial"}
            </span>
          </p>
        </div>
        <form action={signout}>
          <button className="text-sm text-slate-400 hover:text-white">
            Sign out
          </button>
        </form>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold">Your brands</h2>
            <p className="text-sm text-slate-400 mt-1">
              {list.length === 0
                ? "Add a brand to start generating posts."
                : `${list.length} brand${list.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <Link
            href="/brands/new"
            className="rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            + Add brand
          </Link>
        </div>

        {list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 p-10 text-center">
            <p className="text-slate-300 mb-2">No brands yet.</p>
            <p className="text-sm text-slate-500 mb-6">
              The brand wizard collects voice, tone, customer language and SEO
              topics. Takes ~3 minutes.
            </p>
            <Link
              href="/brands/new"
              className="inline-block rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 transition-colors"
            >
              Create your first brand
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {list.map((b) => {
              const isNew = highlightId === b.id;
              return (
                <li
                  key={b.id}
                  className={`rounded-lg border p-5 transition-colors ${
                    isNew
                      ? "border-emerald-500 bg-emerald-950/20"
                      : "border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h3 className="font-semibold text-white">{b.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {b.industry ? `${b.industry} · ` : ""}
                        {b.primary_language.toUpperCase()}
                      </p>
                    </div>
                    {isNew && (
                      <span className="text-[10px] uppercase tracking-wider text-emerald-400 border border-emerald-700 px-2 py-0.5 rounded">
                        New
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-4">
                    <Link
                      href={`/writer?brand=${b.id}`}
                      className="text-sm rounded bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 transition-colors"
                    >
                      Writer →
                    </Link>
                    <span
                      className="text-xs text-slate-600 cursor-not-allowed"
                      title="Sprint 1A next block"
                    >
                      Posts (soon)
                    </span>
                    <span
                      className="text-xs text-slate-600 cursor-not-allowed"
                      title="Sprint 1A next block"
                    >
                      Settings (soon)
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
