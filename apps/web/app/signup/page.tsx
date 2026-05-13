import Link from "next/link";
import { signup } from "./actions";

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SignupPage({ searchParams }: PageProps) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-white mb-1">
          Create your Quoteworthy account
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          14-day trial. No card required.
        </p>

        {error && (
          <div className="mb-4 rounded border border-red-700 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <form action={signup} className="space-y-4">
          <div>
            <label
              htmlFor="display_name"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Your name <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              autoComplete="name"
              className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              At least 8 characters.
            </p>
          </div>
          <button
            type="submit"
            className="w-full rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 transition-colors"
          >
            Create account
          </button>
        </form>

        <p className="text-sm text-slate-400 mt-6 text-center">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Log in
          </Link>
        </p>

        <p className="text-xs text-slate-500 mt-8 text-center">
          By signing up you agree to our{" "}
          <a
            href="https://github.com/wow-solutions/Quoteworthy/blob/main/docs/terms.md"
            className="underline hover:text-slate-400"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href="https://github.com/wow-solutions/Quoteworthy/blob/main/docs/privacy.md"
            className="underline hover:text-slate-400"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}
