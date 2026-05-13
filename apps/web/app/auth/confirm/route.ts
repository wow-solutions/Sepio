import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Email verification handler. Supabase intermediate-verifies the token,
// then redirects here with one of two flows:
//   - PKCE (default in @supabase/ssr): `?code=...` → exchangeCodeForSession
//   - OTP (legacy / custom templates): `?token_hash=...&type=...` → verifyOtp
// Errors come back as `?error=...&error_description=...`.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/dashboard";

  const errorCode = searchParams.get("error") ?? searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");
  if (errorCode) {
    redirect(
      `/login?error=${encodeURIComponent(errorDescription ?? errorCode)}`,
    );
  }

  const supabase = await createClient();

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(next);
    }
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirect(next);
    }
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/login?error=${encodeURIComponent(
      "Verification link missing required parameters. Try signing up again.",
    )}`,
  );
}
