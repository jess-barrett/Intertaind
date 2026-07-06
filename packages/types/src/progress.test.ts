import { describe, expect, it } from "vitest";
import {
  addWatchedEpisode,
  buildBookProgress,
  buildGameProgress,
  buildMovieProgress,
  setEpisodeLog,
  setSeasonLog,
} from "./progress.ts";

describe("buildMovieProgress", () => {
  it("builds a fresh movie progress from null", () => {
    expect(
      buildMovieProgress(null, { watched_on: "2026-06-01", is_rewatch: false })
    ).toEqual({ watched_on: "2026-06-01", is_rewatch: false });
  });

  it("overwrites watched_on and is_rewatch on an existing object", () => {
    expect(
      buildMovieProgress(
        { watched_on: "2020-01-01", is_rewatch: false },
        { watched_on: "2026-06-01", is_rewatch: true }
      )
    ).toEqual({ watched_on: "2026-06-01", is_rewatch: true });
  });

  it("PRESERVES a sibling custom_backdrop_url when setting watched_on", () => {
    expect(
      buildMovieProgress(
        { custom_backdrop_url: "https://cdn/x.jpg", is_rewatch: false },
        { watched_on: "2026-06-01", is_rewatch: true }
      )
    ).toEqual({
      custom_backdrop_url: "https://cdn/x.jpg",
      watched_on: "2026-06-01",
      is_rewatch: true,
    });
  });

  it("does not mutate the input object", () => {
    const existing = { custom_backdrop_url: "https://cdn/x.jpg" };
    buildMovieProgress(existing, { watched_on: "2026-06-01", is_rewatch: true });
    expect(existing).toEqual({ custom_backdrop_url: "https://cdn/x.jpg" });
  });
});

describe("buildBookProgress", () => {
  it("builds a fresh book progress from null with only sub_shelf", () => {
    expect(buildBookProgress(null, { sub_shelf: "finished" })).toEqual({
      sub_shelf: "finished",
    });
  });

  it("includes current_page/total_pages/is_reread when provided", () => {
    expect(
      buildBookProgress(null, {
        sub_shelf: "currently_reading",
        current_page: 42,
        total_pages: 300,
        is_reread: true,
      })
    ).toEqual({
      sub_shelf: "currently_reading",
      current_page: 42,
      total_pages: 300,
      is_reread: true,
    });
  });

  it("emits total_pages even when explicitly null (clearing the override)", () => {
    // Mirrors current-reading-modal: total_pages is always emitted so
    // clearing the field overwrites a previously-saved value.
    expect(
      buildBookProgress(
        { sub_shelf: "currently_reading", total_pages: 300 },
        { sub_shelf: "currently_reading", total_pages: null }
      )
    ).toEqual({ sub_shelf: "currently_reading", total_pages: null });
  });

  it("PRESERVES a sibling custom_cover_url when setting sub_shelf to finished", () => {
    // The headline landmine: finishing a book must not drop its cover.
    expect(
      buildBookProgress(
        {
          sub_shelf: "currently_reading",
          current_page: 100,
          custom_cover_url: "https://cdn/cover.jpg",
        },
        { sub_shelf: "finished" }
      )
    ).toEqual({
      sub_shelf: "finished",
      current_page: 100,
      custom_cover_url: "https://cdn/cover.jpg",
    });
  });

  it("does not mutate the input object", () => {
    const existing = { custom_cover_url: "https://cdn/cover.jpg" };
    buildBookProgress(existing, { sub_shelf: "dnf" });
    expect(existing).toEqual({ custom_cover_url: "https://cdn/cover.jpg" });
  });
});

describe("buildGameProgress", () => {
  it("builds a fresh game progress from null with only sub_status", () => {
    expect(buildGameProgress(null, { sub_status: "played" })).toEqual({
      sub_status: "played",
    });
  });

  it("includes hours_played when provided", () => {
    expect(
      buildGameProgress(null, { sub_status: "playing", hours_played: 12.5 })
    ).toEqual({ sub_status: "playing", hours_played: 12.5 });
  });

  it("omits hours_played when not provided (mirrors game-modal)", () => {
    expect(buildGameProgress(null, { sub_status: "completed" })).toEqual({
      sub_status: "completed",
    });
    expect(
      buildGameProgress(null, { sub_status: "completed" })
    ).not.toHaveProperty("hours_played");
  });

  it("PRESERVES a sibling custom_backdrop_url when setting sub_status", () => {
    expect(
      buildGameProgress(
        { sub_status: "playing", custom_backdrop_url: "https://cdn/b.jpg" },
        { sub_status: "completed", hours_played: 40 }
      )
    ).toEqual({
      sub_status: "completed",
      hours_played: 40,
      custom_backdrop_url: "https://cdn/b.jpg",
    });
  });

  it("does not mutate the input object", () => {
    const existing = { custom_backdrop_url: "https://cdn/b.jpg" };
    buildGameProgress(existing, { sub_status: "shelved" });
    expect(existing).toEqual({ custom_backdrop_url: "https://cdn/b.jpg" });
  });
});

describe("addWatchedEpisode", () => {
  it("creates watched_episodes with the season array when starting from null", () => {
    expect(addWatchedEpisode(null, 1, 3)).toEqual({
      watched_episodes: { "1": [3] },
    });
  });

  it("adds to an existing season array, dedupes and sorts", () => {
    expect(
      addWatchedEpisode(
        { watched_episodes: { "1": [3, 1] } },
        1,
        2
      )
    ).toEqual({ watched_episodes: { "1": [1, 2, 3] } });
  });

  it("creates a new season array while PRESERVING an untouched other season", () => {
    expect(
      addWatchedEpisode({ watched_episodes: { "2": [1, 2] } }, 1, 1)
    ).toEqual({ watched_episodes: { "2": [1, 2], "1": [1] } });
  });

  it("dedupes when the episode is already watched", () => {
    expect(
      addWatchedEpisode({ watched_episodes: { "1": [1, 2, 3] } }, 1, 2)
    ).toEqual({ watched_episodes: { "1": [1, 2, 3] } });
  });

  it("PRESERVES other seasons' watched episodes", () => {
    expect(
      addWatchedEpisode(
        { watched_episodes: { "1": [1, 2, 3], "2": [1] } },
        2,
        2
      )
    ).toEqual({ watched_episodes: { "1": [1, 2, 3], "2": [1, 2] } });
  });

  it("PRESERVES episode_logs and custom_backdrop_url siblings", () => {
    expect(
      addWatchedEpisode(
        {
          current_season: 1,
          current_episode: 5,
          watched_episodes: { "1": [1] },
          episode_logs: { "1": { "1": { rating: 8, review: "good" } } },
          custom_backdrop_url: "https://cdn/b.jpg",
        },
        1,
        2
      )
    ).toEqual({
      current_season: 1,
      current_episode: 5,
      watched_episodes: { "1": [1, 2] },
      episode_logs: { "1": { "1": { rating: 8, review: "good" } } },
      custom_backdrop_url: "https://cdn/b.jpg",
    });
  });

  it("does not mutate the input object or its nested arrays", () => {
    const existing = { watched_episodes: { "1": [1] } };
    addWatchedEpisode(existing, 1, 2);
    expect(existing).toEqual({ watched_episodes: { "1": [1] } });
  });
});

describe("setEpisodeLog", () => {
  it("sets the episode log AND marks the episode watched (from null)", () => {
    expect(setEpisodeLog(null, 1, 3, { rating: 8, review: "great" })).toEqual({
      watched_episodes: { "1": [3] },
      episode_logs: { "1": { "3": { rating: 8, review: "great" } } },
    });
  });

  it("stores a null rating verbatim", () => {
    expect(setEpisodeLog(null, 2, 1, { rating: null, review: "" })).toEqual({
      watched_episodes: { "2": [1] },
      episode_logs: { "2": { "1": { rating: null, review: "" } } },
    });
  });

  it("PRESERVES other episode logs in the same season and other seasons", () => {
    expect(
      setEpisodeLog(
        {
          watched_episodes: { "1": [1], "2": [1] },
          episode_logs: {
            "1": { "1": { rating: 6, review: "a" } },
            "2": { "1": { rating: 7, review: "b" } },
          },
        },
        1,
        2,
        { rating: 9, review: "c" }
      )
    ).toEqual({
      watched_episodes: { "1": [1, 2], "2": [1] },
      episode_logs: {
        "1": {
          "1": { rating: 6, review: "a" },
          "2": { rating: 9, review: "c" },
        },
        "2": { "1": { rating: 7, review: "b" } },
      },
    });
  });

  it("PRESERVES custom_backdrop_url and current_season/episode siblings", () => {
    expect(
      setEpisodeLog(
        {
          current_season: 1,
          current_episode: 2,
          watched_episodes: { "1": [1] },
          custom_backdrop_url: "https://cdn/b.jpg",
        },
        1,
        2,
        { rating: 8 }
      )
    ).toEqual({
      current_season: 1,
      current_episode: 2,
      watched_episodes: { "1": [1, 2] },
      episode_logs: { "1": { "2": { rating: 8 } } },
      custom_backdrop_url: "https://cdn/b.jpg",
    });
  });

  it("does not mutate the input object or nested structures", () => {
    const existing = {
      watched_episodes: { "1": [1] },
      episode_logs: { "1": { "1": { rating: 6, review: "a" } } },
    };
    setEpisodeLog(existing, 1, 2, { rating: 9, review: "c" });
    expect(existing).toEqual({
      watched_episodes: { "1": [1] },
      episode_logs: { "1": { "1": { rating: 6, review: "a" } } },
    });
  });
});

describe("setSeasonLog", () => {
  it("sets the season entry from null", () => {
    expect(
      setSeasonLog(null, 1, { rating: 8, review: "loved it", completed: true })
    ).toEqual({ seasons: { "1": { rating: 8, review: "loved it", completed: true } } });
  });

  it("PRESERVES other seasons' entries", () => {
    expect(
      setSeasonLog(
        {
          seasons: {
            "1": { rating: 7, review: "a", completed: true },
          },
        },
        2,
        { rating: 9, review: "b", completed: true }
      )
    ).toEqual({
      seasons: {
        "1": { rating: 7, review: "a", completed: true },
        "2": { rating: 9, review: "b", completed: true },
      },
    });
  });

  it("PRESERVES watched_episodes/episode_logs/custom_backdrop_url siblings", () => {
    expect(
      setSeasonLog(
        {
          current_season: 1,
          watched_episodes: { "1": [1, 2] },
          episode_logs: { "1": { "1": { rating: 8, review: "x" } } },
          custom_backdrop_url: "https://cdn/b.jpg",
        },
        1,
        { rating: 10, review: "finale", completed: true }
      )
    ).toEqual({
      current_season: 1,
      watched_episodes: { "1": [1, 2] },
      episode_logs: { "1": { "1": { rating: 8, review: "x" } } },
      custom_backdrop_url: "https://cdn/b.jpg",
      seasons: { "1": { rating: 10, review: "finale", completed: true } },
    });
  });

  it("overwrites an existing entry for the same season", () => {
    expect(
      setSeasonLog(
        { seasons: { "1": { rating: 5, review: "meh", completed: false } } },
        1,
        { rating: 8, review: "rewatch", completed: true }
      )
    ).toEqual({
      seasons: { "1": { rating: 8, review: "rewatch", completed: true } },
    });
  });

  it("does not mutate the input object", () => {
    const existing = {
      seasons: { "1": { rating: 7, review: "a", completed: true } },
    };
    setSeasonLog(existing, 2, { rating: 9, review: "b", completed: true });
    expect(existing).toEqual({
      seasons: { "1": { rating: 7, review: "a", completed: true } },
    });
  });
});
