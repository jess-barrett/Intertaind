import { describe, it, expect } from "vitest";
import {
  mergeCredits, filterCredits, sortCredits, decadeToYearRange,
  genreNames, type PersonCreditInput,
} from "./filmography";

const credit = (o: Partial<PersonCreditInput>): PersonCreditInput => ({
  media_tmdb_id: 1, media_type: "movie", title: "T", release_date: "2000-01-01",
  poster_path: null, overview: "", character: "C", billing_order: 0, job: null,
  department: null, credit_type: "cast", vote_average: 5, vote_count: 10,
  genre_ids: [], media_item_id: null, ...o,
});

describe("mergeCredits", () => {
  it("dedupes cast+crew of one title into one card collecting roles", () => {
    const m = mergeCredits([
      credit({ media_tmdb_id: 9, credit_type: "cast", character: "Hero" }),
      credit({ media_tmdb_id: 9, credit_type: "crew", job: "Director", character: null }),
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].roles.sort()).toEqual(["Actor", "Director"]);
    expect(m[0].character).toBe("Hero");
  });
  it("keeps the lowest billing order across duplicate cast rows", () => {
    expect(mergeCredits([
      credit({ media_tmdb_id: 9, billing_order: 5 }),
      credit({ media_tmdb_id: 9, billing_order: 2 }),
    ])[0].order).toBe(2);
  });
  it("buckets crew jobs and drops unknown jobs", () => {
    const m = mergeCredits([
      credit({ media_tmdb_id: 1, credit_type: "crew", job: "Screenplay", character: null }),
      credit({ media_tmdb_id: 2, credit_type: "crew", job: "Best Boy", character: null }),
    ]);
    expect(m.find((c) => c.id === 1)?.roles).toContain("Writer");
    expect(m.find((c) => c.id === 2)).toBeUndefined();
  });
  it("parses year and keys by type-id", () => {
    const m = mergeCredits([credit({ media_tmdb_id: 7, media_type: "tv", release_date: "1994-09-01" })])[0];
    expect(m.year).toBe(1994); expect(m.key).toBe("tv-7");
  });
});

describe("filterCredits", () => {
  const merged = mergeCredits([
    credit({ media_tmdb_id: 1, release_date: "2021-01-01", genre_ids: [28] }),
    credit({ media_tmdb_id: 2, media_type: "tv", release_date: "1965-01-01", genre_ids: [18] }),
  ]);
  it("filters by type", () => expect(filterCredits(merged, { type: "tv" })).toHaveLength(1));
  it("filters by decade older", () =>
    expect(filterCredits(merged, { decade: "older" }).map((c) => c.id)).toEqual([2]));
  it("filters by genre name", () =>
    expect(filterCredits(merged, { genre: "Action" }).map((c) => c.id)).toEqual([1]));
  it("excludes null-year credits when decade set", () =>
    expect(filterCredits(mergeCredits([credit({ media_tmdb_id: 3, release_date: null })]), { decade: "2020s" })).toHaveLength(0));
});

describe("sortCredits", () => {
  it("popular = vote_count desc", () => {
    const m = mergeCredits([credit({ media_tmdb_id: 1, vote_count: 5 }), credit({ media_tmdb_id: 2, vote_count: 50 })]);
    expect(sortCredits(m, "popular").map((c) => c.id)).toEqual([2, 1]);
  });
  it("alpha = title asc", () => {
    const m = mergeCredits([credit({ media_tmdb_id: 1, title: "Zed" }), credit({ media_tmdb_id: 2, title: "Alpha" })]);
    expect(sortCredits(m, "alpha").map((c) => c.id)).toEqual([2, 1]);
  });
  it("release_asc puts empty dates last (ascending otherwise)", () => {
    const m = mergeCredits([
      credit({ media_tmdb_id: 1, release_date: null }),
      credit({ media_tmdb_id: 2, release_date: "1990-01-01" }),
      credit({ media_tmdb_id: 3, release_date: "2010-01-01" }),
    ]);
    expect(sortCredits(m, "release_asc").map((c) => c.id)).toEqual([2, 3, 1]);
  });
  it("billing = order asc, then vote_count desc as tiebreak", () => {
    const m = mergeCredits([
      credit({ media_tmdb_id: 1, billing_order: 0, vote_count: 5 }),
      credit({ media_tmdb_id: 2, billing_order: 0, vote_count: 50 }),
      credit({ media_tmdb_id: 3, billing_order: 3, vote_count: 999 }),
    ]);
    // order 0 beats order 3 (id 3 last despite the huge vote_count); within
    // order 0 the higher vote_count wins.
    expect(sortCredits(m, "billing").map((c) => c.id)).toEqual([2, 1, 3]);
  });
});

describe("decadeToYearRange", () => {
  it("maps decades + older + nonsense", () => {
    expect(decadeToYearRange("2010s")).toEqual([2010, 2019]);
    expect(decadeToYearRange("older")).toEqual([0, 1969]);
    expect(decadeToYearRange("nonsense")).toBeNull();
  });
});

describe("genreNames", () => {
  it("resolves known, drops unknown", () => expect(genreNames([28, 999999])).toEqual(["Action"]));
});
