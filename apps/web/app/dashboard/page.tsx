import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signout } from "./actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("display_name, plan_tier, plan_status, trial_ends_at")
    .eq("id", user.id)
    .single();

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

      <section className="max-w-2xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold mb-2">
          Welcome, {account?.display_name ?? user.email}.
        </h2>
        <p className="text-slate-400 mb-8">
          You are signed in. Brand wizard, post generator, and LinkedIn
          publishing land in Sprint 1.
        </p>

        <div className="rounded-lg border border-slate-800 p-5 mb-4">
          <h3 className="font-medium mb-1">Sprint 0 — what works now</h3>
          <ul className="text-sm text-slate-400 list-disc list-inside space-y-1">
            <li>Sign up, email verification, log in, log out</li>
            <li>Account row auto-created in Postgres via auth trigger</li>
            <li>Row-Level Security enforces tenant isolation</li>
          </ul>
        </div>

        <div className="rounded-lg border border-slate-800 p-5">
          <h3 className="font-medium mb-1">Coming in Sprint 1</h3>
          <ul className="text-sm text-slate-400 list-disc list-inside space-y-1">
            <li>Brand-onboarding wizard (3-10 client brands per account)</li>
            <li>Per-brand LinkedIn OAuth (awaiting Community Management API approval)</li>
            <li>AI post generation with Princeton GEO factors</li>
            <li>Human-in-the-loop approval + scheduling</li>
            <li>Lemon Squeezy billing</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
