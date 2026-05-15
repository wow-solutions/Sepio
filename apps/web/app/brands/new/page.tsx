import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandWizard } from "./wizard";

export const metadata = {
  title: "New brand — Quoteworthy",
};

export default async function NewBrandPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground inline-block mb-4"
        >
          ← Dashboard
        </Link>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Add a brand</h1>
          <p className="text-sm text-muted-foreground mt-1">
            One brand = one set of voice rules, customer language, SEO topics,
            and connected social accounts. You can add more brands later.
          </p>
        </header>
        <BrandWizard />
      </div>
    </main>
  );
}
