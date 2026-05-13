import Link from "next/link";
import { login } from "./actions";

type PageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const { error, message } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-white mb-1">
          Log in to Quoteworthy
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Content AI wants to quote.
        </p>

        {message && (
          <div className="mb-4 rounded border border-emerald-700 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded border border-red-700 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <form action={login} className="space-y-4">
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
              autoComplete="current-password"
              className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 transition-colors"
          >
            Log in
          </button>
        </form>

        <p className="text-sm text-slate-400 mt-6 text-center">
          No account?{" "}
          <Link
            href="/signup"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
