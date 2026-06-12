import { describe, expect, it } from "vitest";
import {
  normalizeTMDBMovie,
  normalizeTMDBTV,
  normalizeGoogleBook,
  normalizeOLBook,
  normalizeIGDBGame,
} from "./normalize.ts";
import type {
  TMDBMovie,
  TMDBTVShow,
  GoogleBooksVolume,
  IGDBGame,
  OLBookSearchDoc,
} from "./types.ts";

describe("normalizeTMDBMovie", () => {
  const raw: TMDBMovie = {
    id: 603,
    title: "The Matrix",
    overview: "A hacker learns the truth.",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    release_date: "1999-03-31",
    genre_ids: [28, 878],
    vote_average: 8.2,
    vote_count: 24000,
  };

  it("maps core fields and builds TMDB image URLs", () => {
    const result = normalizeTMDBMovie(raw);
    expect(result.media_type).toBe("movie");
    expect(result.title).toBe("The Matrix");
    expect(result.description).toBe("A hacker learns the truth.");
    expect(result.cover_image_url).toBe(
      "https://image.tmdb.org/t/p/w500/poster.jpg"
    );
    expect(result.backdrop_url).toBe(
      "https://image.tmdb.org/t/p/original/backdrop.jpg"
    );
    expect(result.release_date).toBe("1999-03-31");
    expect(result.metadata).toEqual({
      genre_ids: [28, 878],
      vote_average: 8.2,
    });
    expect(result.external_ids).toEqual({ tmdb_id: 603 });
  });

  it("nulls empty descriptions", () => {
    expect(normalizeTMDBMovie({ ...raw, overview: "" }).description).toBeNull();
  });

  it("nulls cover when poster_path is null", () => {
    expect(
      normalizeTMDBMovie({ ...raw, poster_path: null }).cover_image_url
    ).toBeNull();
  });

  it("nulls backdrop when backdrop_path is null", () => {
    expect(
      normalizeTMDBMovie({ ...raw, backdrop_path: null }).backdrop_url
    ).toBeNull();
  });

  it("nulls empty release_date", () => {
    expect(
      normalizeTMDBMovie({ ...raw, release_date: "" }).release_date
    ).toBeNull();
  });
});

describe("normalizeTMDBTV", () => {
  const raw: TMDBTVShow = {
    id: 1396,
    name: "Breaking Bad",
    overview: "A chemistry teacher turns to crime.",
    poster_path: "/bb-poster.jpg",
    backdrop_path: "/bb-backdrop.jpg",
    first_air_date: "2008-01-20",
    genre_ids: [18, 80],
    vote_average: 8.9,
    vote_count: 12000,
  };

  it("maps name to title and first_air_date to release_date", () => {
    const result = normalizeTMDBTV(raw);
    expect(result.media_type).toBe("tv_show");
    expect(result.title).toBe("Breaking Bad");
    expect(result.description).toBe("A chemistry teacher turns to crime.");
    expect(result.cover_image_url).toBe(
      "https://image.tmdb.org/t/p/w500/bb-poster.jpg"
    );
    expect(result.backdrop_url).toBe(
      "https://image.tmdb.org/t/p/original/bb-backdrop.jpg"
    );
    expect(result.release_date).toBe("2008-01-20");
    expect(result.metadata).toEqual({
      genre_ids: [18, 80],
      vote_average: 8.9,
    });
    expect(result.external_ids).toEqual({ tmdb_id: 1396 });
  });

  it("nulls empty overview and first_air_date", () => {
    const result = normalizeTMDBTV({ ...raw, overview: "", first_air_date: "" });
    expect(result.description).toBeNull();
    expect(result.release_date).toBeNull();
  });
});

describe("normalizeGoogleBook", () => {
  const raw: GoogleBooksVolume = {
    id: "zNnJDwAAQBAJ",
    volumeInfo: {
      title: "The Name of the Wind",
      authors: ["Patrick Rothfuss"],
      publisher: "DAW Books",
      publishedDate: "2007-03-27",
      description: "The tale of Kvothe.",
      pageCount: 662,
      categories: ["Fiction"],
      imageLinks: {
        thumbnail:
          "http://books.google.com/books/content?id=zNnJDwAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api",
      },
      industryIdentifiers: [
        { type: "ISBN_10", identifier: "0756404746" },
        { type: "ISBN_13", identifier: "9780756404741" },
      ],
    },
    accessInfo: { viewability: "PARTIAL" },
  };

  it("maps core fields", () => {
    const result = normalizeGoogleBook(raw);
    expect(result.media_type).toBe("book");
    expect(result.title).toBe("The Name of the Wind");
    expect(result.description).toBe("The tale of Kvothe.");
    expect(result.release_date).toBe("2007-03-27");
    expect(result.backdrop_url).toBeNull();
    expect(result.metadata).toEqual({
      authors: ["Patrick Rothfuss"],
      page_count: 662,
      publisher: "DAW Books",
      categories: ["Fiction"],
    });
    expect(result.external_ids).toEqual({
      google_books_id: "zNnJDwAAQBAJ",
      isbn_13: "9780756404741",
    });
  });

  it("builds cover via bookCoverUrl (https rewrite + zoom upgrade)", () => {
    expect(normalizeGoogleBook(raw).cover_image_url).toBe(
      "https://books.google.com/books/content?id=zNnJDwAAQBAJ&printsec=frontcover&img=1&zoom=3&source=gbs_api"
    );
  });

  it("appends subtitle to the title with a colon", () => {
    const result = normalizeGoogleBook({
      ...raw,
      volumeInfo: { ...raw.volumeInfo, subtitle: "The Kingkiller Chronicle" },
    });
    expect(result.title).toBe(
      "The Name of the Wind: The Kingkiller Chronicle"
    );
  });

  it("omits isbn_13 when no ISBN_13 identifier is present", () => {
    const result = normalizeGoogleBook({
      ...raw,
      volumeInfo: {
        ...raw.volumeInfo,
        industryIdentifiers: [{ type: "ISBN_10", identifier: "0756404746" }],
      },
    });
    expect(result.external_ids).toEqual({ google_books_id: "zNnJDwAAQBAJ" });
  });

  it("defaults missing optional fields", () => {
    const result = normalizeGoogleBook({
      id: "thin",
      volumeInfo: { title: "Thin Record" },
    });
    expect(result.description).toBeNull();
    expect(result.cover_image_url).toBeNull();
    expect(result.release_date).toBeNull();
    expect(result.metadata).toEqual({
      authors: [],
      page_count: null,
      publisher: null,
      categories: [],
    });
  });

  describe("publishedDate padding (toFullDate)", () => {
    it("pads a year-only date to YYYY-01-01", () => {
      const result = normalizeGoogleBook({
        ...raw,
        volumeInfo: { ...raw.volumeInfo, publishedDate: "1996" },
      });
      expect(result.release_date).toBe("1996-01-01");
    });

    it("pads a year-month date to YYYY-MM-01", () => {
      const result = normalizeGoogleBook({
        ...raw,
        volumeInfo: { ...raw.volumeInfo, publishedDate: "1996-03" },
      });
      expect(result.release_date).toBe("1996-03-01");
    });

    it("passes a full date through unchanged", () => {
      const result = normalizeGoogleBook({
        ...raw,
        volumeInfo: { ...raw.volumeInfo, publishedDate: "1996-03-27" },
      });
      expect(result.release_date).toBe("1996-03-27");
    });

    it("passes non-matching formats through unchanged", () => {
      const result = normalizeGoogleBook({
        ...raw,
        volumeInfo: { ...raw.volumeInfo, publishedDate: "March 1996" },
      });
      expect(result.release_date).toBe("March 1996");
    });
  });
});

describe("normalizeOLBook", () => {
  const doc: OLBookSearchDoc = {
    workKey: "OL27448W",
    title: "The Lord of the Rings",
    authors: ["J.R.R. Tolkien"],
    firstPublishYear: 1954,
    coverUrl: "https://covers.openlibrary.org/b/id/9255566-L.jpg",
    coverEditionKey: "OL21058613M",
    editionCount: 120,
    ratingsCount: 500,
    ratingsAverage: 4.5,
    wantToReadCount: 3000,
    isbn13: "9780618640157",
    subjects: ["Fantasy", "Hobbits", "Rings", "Quests", "Wizards", "Elves"],
    languages: ["eng"],
  };

  it("maps core fields", () => {
    const result = normalizeOLBook(doc);
    expect(result.media_type).toBe("book");
    expect(result.title).toBe("The Lord of the Rings");
    expect(result.cover_image_url).toBe(
      "https://covers.openlibrary.org/b/id/9255566-L.jpg"
    );
    expect(result.backdrop_url).toBeNull();
    expect(result.release_date).toBe("1954-01-01");
    expect(result.external_ids).toEqual({
      openlibrary_work_id: "OL27448W",
      isbn_13: "9780618640157",
    });
  });

  it("always nulls description and page_count (enrichment comes later)", () => {
    const result = normalizeOLBook(doc);
    expect(result.description).toBeNull();
    expect(result.metadata).toMatchObject({
      page_count: null,
      publisher: null,
    });
  });

  it("keeps only the first 5 subjects as categories", () => {
    expect(normalizeOLBook(doc).metadata).toMatchObject({
      authors: ["J.R.R. Tolkien"],
      categories: ["Fantasy", "Hobbits", "Rings", "Quests", "Wizards"],
    });
  });

  it("appends subtitle to the title with a colon", () => {
    expect(normalizeOLBook({ ...doc, subtitle: "One Volume" }).title).toBe(
      "The Lord of the Rings: One Volume"
    );
  });

  it("nulls release_date when firstPublishYear is null", () => {
    expect(
      normalizeOLBook({ ...doc, firstPublishYear: null }).release_date
    ).toBeNull();
  });

  it("omits isbn_13 when isbn13 is null", () => {
    expect(normalizeOLBook({ ...doc, isbn13: null }).external_ids).toEqual({
      openlibrary_work_id: "OL27448W",
    });
  });
});

describe("normalizeIGDBGame", () => {
  const raw: IGDBGame = {
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    summary: "Geralt hunts the Wild Hunt.",
    cover: { image_id: "co1wyy" },
    artworks: [{ image_id: "ar4l4" }],
    screenshots: [{ image_id: "scxyz" }],
    first_release_date: 922838400, // 1999-03-31T00:00:00Z (UTC)
    genres: [{ name: "RPG" }, { name: "Adventure" }],
    platforms: [{ name: "PC" }, { name: "PlayStation 4" }],
    involved_companies: [
      {
        company: { id: 51, name: "CD Projekt RED" },
        developer: true,
        publisher: false,
      },
      {
        company: { id: 52, name: "CD Projekt" },
        developer: false,
        publisher: true,
      },
    ],
    rating: 93,
    rating_count: 2000,
  };

  it("maps core fields", () => {
    const result = normalizeIGDBGame(raw);
    expect(result.media_type).toBe("video_game");
    expect(result.title).toBe("The Witcher 3: Wild Hunt");
    expect(result.description).toBe("Geralt hunts the Wild Hunt.");
    expect(result.cover_image_url).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg"
    );
    expect(result.external_ids).toEqual({ igdb_id: 1942 });
  });

  it("converts the unix first_release_date to a UTC YYYY-MM-DD string", () => {
    expect(normalizeIGDBGame(raw).release_date).toBe("1999-03-31");
  });

  it("nulls release_date when first_release_date is missing", () => {
    expect(
      normalizeIGDBGame({ ...raw, first_release_date: undefined }).release_date
    ).toBeNull();
  });

  it("splits involved_companies into developers and publishers", () => {
    expect(normalizeIGDBGame(raw).metadata).toEqual({
      developers: [{ id: 51, name: "CD Projekt RED" }],
      publishers: [{ id: 52, name: "CD Projekt" }],
      platforms: ["PC", "PlayStation 4"],
      genres: ["RPG", "Adventure"],
    });
  });

  it("dedupes repeated company rows by company id within each role list", () => {
    const result = normalizeIGDBGame({
      ...raw,
      involved_companies: [
        {
          company: { id: 51, name: "CD Projekt RED" },
          developer: true,
          publisher: true,
        },
        {
          company: { id: 51, name: "CD Projekt RED" },
          developer: true,
          publisher: false,
        },
      ],
    });
    expect(result.metadata).toMatchObject({
      developers: [{ id: 51, name: "CD Projekt RED" }],
      publishers: [{ id: 51, name: "CD Projekt RED" }],
    });
  });

  it("prefers artwork over screenshot for the backdrop", () => {
    expect(normalizeIGDBGame(raw).backdrop_url).toBe(
      "https://images.igdb.com/igdb/image/upload/t_1080p/ar4l4.jpg"
    );
  });

  it("falls back to the first screenshot when no artworks exist", () => {
    expect(normalizeIGDBGame({ ...raw, artworks: [] }).backdrop_url).toBe(
      "https://images.igdb.com/igdb/image/upload/t_1080p/scxyz.jpg"
    );
  });

  it("defaults everything when optional fields are absent", () => {
    const result = normalizeIGDBGame({ id: 7, name: "Bare Game" });
    expect(result.description).toBeNull();
    expect(result.cover_image_url).toBeNull();
    expect(result.backdrop_url).toBeNull();
    expect(result.release_date).toBeNull();
    expect(result.metadata).toEqual({
      developers: [],
      publishers: [],
      platforms: [],
      genres: [],
    });
  });

  it("nulls empty summary", () => {
    expect(normalizeIGDBGame({ ...raw, summary: "" }).description).toBeNull();
  });
});
