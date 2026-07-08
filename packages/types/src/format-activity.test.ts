import { describe, expect, it } from "vitest";
import { formatActivity, type ActivityLike } from "./format-activity.ts";
import type { ActivityType, MediaType } from "./index.ts";

/** Build a minimal ActivityLike row for a test case. */
function row(
  activity_type: ActivityType | string,
  media_type: MediaType | null,
  title: string | null,
  metadata: Record<string, unknown> | null = null
): ActivityLike {
  return {
    activity_type,
    metadata,
    media: media_type == null ? null : { title, media_type },
  };
}

describe("formatActivity", () => {
  describe("added_to_shelf", () => {
    it("want reads as 'Added X to {Watchlist}' (movie)", () => {
      expect(
        formatActivity(row("added_to_shelf", "movie", "Heat", { status: "want" }))
      ).toBe("Added Heat to Watchlist");
    });
    it("want reads as 'Added X to TBR' (book)", () => {
      expect(
        formatActivity(row("added_to_shelf", "book", "Dune", { status: "want" }))
      ).toBe("Added Dune to TBR");
    });
    it("non-want reads as 'Added X to Shelf as {label}'", () => {
      expect(
        formatActivity(
          row("added_to_shelf", "tv_show", "The Wire", { status: "in_progress" })
        )
      ).toBe("Added The Wire to Shelf as Currently Watching");
    });
    it("game prefers the sub_status label over the tracking status", () => {
      expect(
        formatActivity(
          row("added_to_shelf", "video_game", "Hades", {
            status: "on_hold",
            sub_status: "retired",
          })
        )
      ).toBe("Added Hades to Shelf as Retired");
    });
  });

  describe("completed", () => {
    it("movie → Watched", () => {
      expect(formatActivity(row("completed", "movie", "Heat"))).toBe(
        "Added Heat to Shelf as Watched"
      );
    });
    it("book without rating → Read", () => {
      expect(formatActivity(row("completed", "book", "Dune"))).toBe(
        "Added Dune to Shelf as Read"
      );
    });
    it("book with rating → Finished", () => {
      expect(
        formatActivity(row("completed", "book", "Dune", { rating: 8 }))
      ).toBe("Added Dune to Shelf as Finished");
    });
    it("game uses its sub_status label, else Played", () => {
      expect(
        formatActivity(
          row("completed", "video_game", "Hades", { sub_status: "completed" })
        )
      ).toBe("Added Hades to Shelf as Completed");
      expect(formatActivity(row("completed", "video_game", "Hades"))).toBe(
        "Added Hades to Shelf as Played"
      );
    });
    it("falls back to 'Finished X' when media type is unknown", () => {
      expect(formatActivity(row("completed", null, null))).toBe(
        "Finished Untitled"
      );
    });
  });

  describe("status_changed", () => {
    it("non-game reads 'Moved X to {label}' from to_status", () => {
      expect(
        formatActivity(
          row("status_changed", "book", "Dune", { to_status: "in_progress" })
        )
      ).toBe("Moved Dune to Reading");
    });
    it("game reads 'Changed X Status to {sub_status label}'", () => {
      expect(
        formatActivity(
          row("status_changed", "video_game", "Hades", { sub_status: "shelved" })
        )
      ).toBe("Changed Hades Status to Shelved");
    });
  });

  it("reviewed → 'Reviewed X'", () => {
    expect(formatActivity(row("reviewed", "movie", "Heat"))).toBe(
      "Reviewed Heat"
    );
  });

  it("rated → 'Rated X'", () => {
    expect(formatActivity(row("rated", "movie", "Heat"))).toBe("Rated Heat");
  });

  it("favorited → 'Loved X'", () => {
    expect(formatActivity(row("favorited", "book", "Dune"))).toBe("Loved Dune");
  });

  describe("started_reading", () => {
    it("first read → 'Started Reading X'", () => {
      expect(formatActivity(row("started_reading", "book", "Dune"))).toBe(
        "Started Reading Dune"
      );
    });
    it("reread → 'Started Rereading X'", () => {
      expect(
        formatActivity(row("started_reading", "book", "Dune", { is_reread: true }))
      ).toBe("Started Rereading Dune");
    });
  });

  describe("removed", () => {
    it("game → 'Removed X from Shelf'", () => {
      expect(formatActivity(row("removed", "video_game", "Hades"))).toBe(
        "Removed Hades from Shelf"
      );
    });
    it("non-game with previous_status names the section", () => {
      expect(
        formatActivity(
          row("removed", "movie", "Heat", { previous_status: "want" })
        )
      ).toBe("Removed Heat from Watchlist");
    });
    it("non-game without previous_status → 'Removed X'", () => {
      expect(formatActivity(row("removed", "movie", "Heat"))).toBe(
        "Removed Heat"
      );
    });
  });

  it("logged_episode → 'Finished Season S Episode E of X'", () => {
    expect(
      formatActivity(
        row("logged_episode", "tv_show", "The Wire", { season: 1, episode: 3 })
      )
    ).toBe("Finished Season 1 Episode 3 of The Wire");
  });

  describe("logged_season", () => {
    it("with rating → 'Rated X Season S'", () => {
      expect(
        formatActivity(
          row("logged_season", "tv_show", "The Wire", { season: 2, rating: 9 })
        )
      ).toBe("Rated The Wire Season 2");
    });
    it("without rating → 'Watched Season S of X'", () => {
      expect(
        formatActivity(
          row("logged_season", "tv_show", "The Wire", { season: 2 })
        )
      ).toBe("Watched Season 2 of The Wire");
    });
  });

  it("added_to_top uses the metadata media_type plural", () => {
    expect(
      formatActivity(
        row("added_to_top", "movie", "Heat", { media_type: "movie" })
      )
    ).toBe("Added Heat to Top Movies");
  });

  it("removed_from_top falls back to the row media type", () => {
    expect(formatActivity(row("removed_from_top", "book", "Dune"))).toBe(
      "Removed Dune from Top Books"
    );
  });

  describe("recommended", () => {
    it("with a source title → 'Intertaind X for fans of Y'", () => {
      expect(
        formatActivity(
          row("recommended", "movie", "Heat", { source_title: "Collateral" })
        )
      ).toBe("Intertaind Heat for fans of Collateral");
    });
    it("without a source title → 'Intertaind X as a pairing'", () => {
      expect(formatActivity(row("recommended", "movie", "Heat"))).toBe(
        "Intertaind Heat as a pairing"
      );
    });
  });

  describe("list activities", () => {
    it("created_list", () => {
      expect(
        formatActivity(row("created_list", null, null, { title: "Noir Essentials" }))
      ).toBe("Created the list Noir Essentials");
    });
    it("liked_list", () => {
      expect(
        formatActivity(row("liked_list", null, null, { title: "Noir Essentials" }))
      ).toBe("Liked the list Noir Essentials");
    });
    it("saved_list falls back to 'an untitled list'", () => {
      expect(formatActivity(row("saved_list", null, null))).toBe(
        "Saved the list an untitled list"
      );
    });
  });

  it("unknown activity_type falls back to 'Updated X'", () => {
    expect(formatActivity(row("teleported", "movie", "Heat"))).toBe(
      "Updated Heat"
    );
  });

  it("uses 'Untitled' when the media title is missing", () => {
    expect(formatActivity(row("favorited", "movie", null))).toBe(
      "Loved Untitled"
    );
  });
});
