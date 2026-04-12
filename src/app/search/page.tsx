import SearchClient from "./search-client";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>
}) {
  const { q, type } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-text-primary">Search</h1>
      <SearchClient initialQuery={q ?? ""} initialType={type ?? "all"} />
    </div>
  );
}
