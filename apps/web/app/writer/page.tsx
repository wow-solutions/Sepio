import Link from "next/link";
import { getBrandFromRequest } from "@/lib/get-brand";
import { WriterClient } from "./writer-client";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function WriterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { brand } = await getBrandFromRequest(params);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Writer · {brand.name}</h1>
          <p className="text-xs text-slate-500">
            Generate → Pangram check → review → save.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Dashboard
        </Link>
      </header>

      <WriterClient brandId={brand.id} brandName={brand.name} />
    </main>
  );
}
