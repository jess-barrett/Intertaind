import { describe, expect, it } from "vitest";
import { tmdbImageUrl, bookCoverUrl, igdbImageUrl } from "./images.ts";
import type { GoogleBooksVolume } from "./types.ts";

describe("tmdbImageUrl", () => {
  it("builds a w500 URL by default", () => {
    expect(tmdbImageUrl("/poster.jpg")).toBe(
      "https://image.tmdb.org/t/p/w500/poster.jpg"
    );
  });

  it("accepts a custom size", () => {
    expect(tmdbImageUrl("/backdrop.jpg", "original")).toBe(
      "https://image.tmdb.org/t/p/original/backdrop.jpg"
    );
  });

  it("returns null for a null path", () => {
    expect(tmdbImageUrl(null)).toBeNull();
  });
});

describe("igdbImageUrl", () => {
  it("builds a t_cover_big URL by default", () => {
    expect(igdbImageUrl("co1wyy")).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg"
    );
  });

  it("accepts a custom size", () => {
    expect(igdbImageUrl("ar4l4", "t_1080p")).toBe(
      "https://images.igdb.com/igdb/image/upload/t_1080p/ar4l4.jpg"
    );
  });
});

describe("bookCoverUrl", () => {
  function volume(
    imageLinks: NonNullable<
      GoogleBooksVolume["volumeInfo"]["imageLinks"]
    > | undefined,
    viewability?: "NO_PAGES" | "PARTIAL" | "ALL_PAGES" | "UNKNOWN"
  ): GoogleBooksVolume {
    return {
      id: "vol1",
      volumeInfo: { title: "Some Book", imageLinks },
      ...(viewability ? { accessInfo: { viewability } } : {}),
    };
  }

  it("returns null when imageLinks is missing", () => {
    expect(bookCoverUrl(volume(undefined))).toBeNull();
  });

  it("returns null when imageLinks has no URLs", () => {
    expect(bookCoverUrl(volume({}))).toBeNull();
  });

  it("prefers extraLarge over all other sizes", () => {
    const url = bookCoverUrl(
      volume({
        smallThumbnail: "https://x/smallThumbnail",
        thumbnail: "https://x/thumbnail",
        small: "https://x/small",
        medium: "https://x/medium",
        large: "https://x/large",
        extraLarge: "https://x/extraLarge",
      })
    );
    expect(url).toBe("https://x/extraLarge");
  });

  it("falls back through large -> medium -> small -> thumbnail -> smallThumbnail", () => {
    expect(
      bookCoverUrl(
        volume({ smallThumbnail: "https://x/st", thumbnail: "https://x/t" })
      )
    ).toBe("https://x/t");
    expect(
      bookCoverUrl(volume({ smallThumbnail: "https://x/st" }))
    ).toBe("https://x/st");
    expect(
      bookCoverUrl(volume({ medium: "https://x/m", small: "https://x/s" }))
    ).toBe("https://x/m");
    expect(
      bookCoverUrl(volume({ large: "https://x/l", medium: "https://x/m" }))
    ).toBe("https://x/l");
    expect(
      bookCoverUrl(volume({ small: "https://x/s", thumbnail: "https://x/t" }))
    ).toBe("https://x/s");
  });

  it("rewrites http:// to https://", () => {
    expect(
      bookCoverUrl(volume({ thumbnail: "http://books.google.com/cover" }))
    ).toBe("https://books.google.com/cover");
  });

  it("strips edge=curl along with its leading ampersand", () => {
    expect(
      bookCoverUrl(
        volume({
          thumbnail:
            "https://books.google.com/books/content?id=abc&zoom=1&edge=curl&source=gbs_api",
        })
      )
    ).toBe("https://books.google.com/books/content?id=abc&zoom=1&source=gbs_api");
  });

  it("leaves a dangling '?&' when edge=curl is the first query param", () => {
    // Characterization: the regex only consumes a LEADING '&', so a
    // first-position edge=curl leaves '?&' behind.
    expect(
      bookCoverUrl(
        volume({
          thumbnail: "https://books.google.com/c?edge=curl&zoom=1",
        })
      )
    ).toBe("https://books.google.com/c?&zoom=1");
  });

  it("upgrades zoom to 3 when viewability is PARTIAL", () => {
    expect(
      bookCoverUrl(volume({ thumbnail: "https://x/c?zoom=1" }, "PARTIAL"))
    ).toBe("https://x/c?zoom=3");
  });

  it("upgrades zoom to 3 when viewability is ALL_PAGES", () => {
    expect(
      bookCoverUrl(volume({ thumbnail: "https://x/c?zoom=5" }, "ALL_PAGES"))
    ).toBe("https://x/c?zoom=3");
  });

  it("does not upgrade zoom when viewability is NO_PAGES", () => {
    expect(
      bookCoverUrl(volume({ thumbnail: "https://x/c?zoom=1" }, "NO_PAGES"))
    ).toBe("https://x/c?zoom=1");
  });

  it("does not upgrade zoom when viewability is UNKNOWN", () => {
    expect(
      bookCoverUrl(volume({ thumbnail: "https://x/c?zoom=1" }, "UNKNOWN"))
    ).toBe("https://x/c?zoom=1");
  });

  it("is a no-op for PARTIAL viewability when the URL has no zoom param", () => {
    expect(
      bookCoverUrl(volume({ medium: "https://x/m?id=abc" }, "PARTIAL"))
    ).toBe("https://x/m?id=abc");
  });

  it("does not upgrade zoom when accessInfo is missing", () => {
    expect(bookCoverUrl(volume({ thumbnail: "https://x/c?zoom=1" }))).toBe(
      "https://x/c?zoom=1"
    );
  });

  it("applies https rewrite, edge=curl strip, and zoom upgrade together", () => {
    expect(
      bookCoverUrl(
        volume(
          {
            thumbnail:
              "http://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api",
          },
          "PARTIAL"
        )
      )
    ).toBe(
      "https://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=3&source=gbs_api"
    );
  });
});
