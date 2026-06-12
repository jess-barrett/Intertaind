import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { searchBookEditions, bookCoverUrl } from "@/lib/api/google-books";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const title = searchParams.get("title")?.trim();
  const author = searchParams.get("author")?.trim() || undefined;

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    const editions = await searchBookEditions(title, author);

    // Dedupe by cover URL (many editions share the exact same image)
    const seen = new Set<string>();
    const covers: {
      volumeId: string;
      coverUrl: string;
      publisher: string | null;
      publishedDate: string | null;
      language: string | null;
    }[] = [];

    for (const v of editions) {
      const url = bookCoverUrl(v);
      if (!url) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      covers.push({
        volumeId: v.id,
        coverUrl: url,
        publisher: v.volumeInfo.publisher ?? null,
        publishedDate: v.volumeInfo.publishedDate ?? null,
        language: v.volumeInfo.language ?? null,
      });
    }

    return NextResponse.json(covers);
  } catch {
    return NextResponse.json({ error: "Cover search failed" }, { status: 500 });
  }
}
