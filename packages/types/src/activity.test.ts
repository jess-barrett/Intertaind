import { describe, expect, it } from "vitest";
import {
  addedToShelfActivity,
  favoriteActivity,
  rateActivity,
  recommendActivity,
  removeActivity,
  resolveTrackActivity,
  reviewActivity,
  type TrackSnapshot,
} from "./activity.ts";

const prior = (over: Partial<TrackSnapshot> = {}): TrackSnapshot => ({
  status: "want",
  rating: null,
  review: null,
  is_favorite: false,
  progress: null,
  ...over,
});

describe("resolveTrackActivity", () => {
  it("first-time want → added_to_shelf", () => {
    const a = resolveTrackActivity({ prior: null, status: "want" });
    expect(a).toEqual({
      activity_type: "added_to_shelf",
      metadata: { status: "want" },
    });
  });

  it("first-time completed → completed", () => {
    const a = resolveTrackActivity({ prior: null, status: "completed" });
    expect(a?.activity_type).toBe("completed");
    expect(a?.metadata.status).toBe("completed");
  });

  it("first-time with a review → reviewed (+ review metadata)", () => {
    const a = resolveTrackActivity({
      prior: null,
      status: "completed",
      review: "Loved it",
      rating: 8,
    });
    expect(a?.activity_type).toBe("reviewed");
    expect(a?.metadata.review_text).toBe("Loved it");
    expect(a?.metadata.review_length).toBe(8);
    expect(a?.metadata.rating).toBe(8);
  });

  it("existing row, status moved (no rating/review) → status_changed", () => {
    const a = resolveTrackActivity({
      prior: prior({ status: "want" }),
      status: "in_progress",
    });
    expect(a?.activity_type).toBe("status_changed");
  });

  it("existing row, game sub_status moved → status_changed", () => {
    const a = resolveTrackActivity({
      prior: prior({ status: "in_progress", progress: { sub_status: "playing" } }),
      status: "in_progress",
      progress: { sub_status: "shelved" },
    });
    expect(a?.activity_type).toBe("status_changed");
    expect(a?.metadata.sub_status).toBe("shelved");
  });

  it("silent metadata edit (same status, only hours changed) → null", () => {
    const a = resolveTrackActivity({
      prior: prior({ status: "completed", progress: { hours_played: 10 } }),
      status: "completed",
      progress: { hours_played: 12 },
    });
    expect(a).toBeNull();
  });

  it("editing an existing review's text → null (not newly added)", () => {
    const a = resolveTrackActivity({
      prior: prior({ status: "completed", review: "old" }),
      status: "completed",
      review: "new text",
    });
    expect(a).toBeNull();
  });

  it("newly-added review on an existing row → reviewed", () => {
    const a = resolveTrackActivity({
      prior: prior({ status: "completed", review: "" }),
      status: "completed",
      review: "first thoughts",
    });
    expect(a?.activity_type).toBe("reviewed");
  });

  it("clearing a rating on an existing row → logs (added_to_shelf) with the change", () => {
    const a = resolveTrackActivity({
      prior: prior({ status: "want", rating: 8 }),
      status: "want",
      rating: null,
    });
    expect(a).not.toBeNull();
  });

  it("override wins (logged_season) and always logs", () => {
    const a = resolveTrackActivity({
      prior: prior({ status: "in_progress" }),
      status: "in_progress",
      override: { activity_type: "logged_season", metadata: { season: 2 } },
    });
    expect(a?.activity_type).toBe("logged_season");
    expect(a?.metadata.season).toBe(2);
  });

  it("carries TV position + favorite into metadata", () => {
    const a = resolveTrackActivity({
      prior: null,
      status: "in_progress",
      is_favorite: true,
      progress: { current_season: 2, current_episode: 5 },
    });
    expect(a?.metadata.current_season).toBe(2);
    expect(a?.metadata.current_episode).toBe(5);
    expect(a?.metadata.is_favorite).toBe(true);
  });
});

describe("by-id activity builders", () => {
  it("rateActivity: value → rated, null → null", () => {
    expect(rateActivity(9)).toEqual({ activity_type: "rated", metadata: { rating: 9 } });
    expect(rateActivity(null)).toBeNull();
  });

  it("reviewActivity → reviewed with length + text", () => {
    expect(reviewActivity("hi")).toEqual({
      activity_type: "reviewed",
      metadata: { review_length: 2, review_text: "hi" },
    });
  });

  it("favoriteActivity: true → favorited, false → null", () => {
    expect(favoriteActivity(true)).toEqual({ activity_type: "favorited", metadata: {} });
    expect(favoriteActivity(false)).toBeNull();
  });

  it("removeActivity → removed with previous_status", () => {
    expect(removeActivity("completed")).toEqual({
      activity_type: "removed",
      metadata: { previous_status: "completed" },
    });
  });

  it("addedToShelfActivity → added_to_shelf with status", () => {
    expect(addedToShelfActivity("want")).toEqual({
      activity_type: "added_to_shelf",
      metadata: { status: "want" },
    });
  });

  it("recommendActivity → recommended with source/target + titles + has_note", () => {
    expect(
      recommendActivity({
        sourceMediaId: "s1",
        recommendedMediaId: "t1",
        sourceTitle: "Heat",
        recommendedTitle: "Collateral",
        hasNote: true,
        note: "Both are heists",
        sourceCoverUrl: "http://x/heat.jpg",
        sourceMediaType: "movie",
      }),
    ).toEqual({
      activity_type: "recommended",
      metadata: {
        source_media_id: "s1",
        recommended_media_id: "t1",
        source_title: "Heat",
        recommended_title: "Collateral",
        has_note: true,
        note: "Both are heists",
        source_cover_url: "http://x/heat.jpg",
        source_media_type: "movie",
      },
    });
  });
});
