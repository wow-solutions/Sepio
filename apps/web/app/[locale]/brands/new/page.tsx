import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandWizard } from "./wizard";

export async function generateMetadata() {
  const t = await getTranslations("wizard.shell");
  return { title: `${t("title")} — Sepio` };
}

export default async function NewBrandPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("wizard.shell");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground inline-block mb-4"
        >
          {t("backToDashboard")}
        </Link>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("intro")}</p>
        </header>
        <BrandWizard />
      </div>
    </main>
  );
}
