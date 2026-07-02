import { describe, expect, it } from "vitest";
import { isValidStars, ratingToStars, starsToRating } from "./rating.ts";

describe("ratingToStars", () => {
  it("converts the DB minimum (1) to half a star", () => {
    expect(ratingToStars(1)).toBe(0.5);
  });
  it("converts a mid value (7) to 3.5 stars", () => {
    expect(ratingToStars(7)).toBe(3.5);
  });
  it("converts the DB maximum (10) to 5 stars", () => {
    expect(ratingToStars(10)).toBe(5.0);
  });
  it("propagates null (unrated)", () => {
    expect(ratingToStars(null)).toBeNull();
  });
  it("clamps out-of-range low values into 1..10 before converting (0 → 0.5 stars)", () => {
    expect(ratingToStars(0)).toBe(0.5);
  });
  it("clamps negative garbage to the minimum (−3 → 0.5 stars)", () => {
    expect(ratingToStars(-3)).toBe(0.5);
  });
  it("clamps out-of-range high values (11 → 5.0 stars)", () => {
    expect(ratingToStars(11)).toBe(5.0);
  });
});

describe("starsToRating", () => {
  it("converts half a star to the DB minimum (1)", () => {
    expect(starsToRating(0.5)).toBe(1);
  });
  it("converts 3.5 stars to 7", () => {
    expect(starsToRating(3.5)).toBe(7);
  });
  it("converts 5 stars to the DB maximum (10)", () => {
    expect(starsToRating(5.0)).toBe(10);
  });
  it("propagates null (unrated)", () => {
    expect(starsToRating(null)).toBeNull();
  });
  it("clamps stars above 5 to the DB maximum (6 → 10)", () => {
    expect(starsToRating(6)).toBe(10);
  });
  it("clamps tiny positive stars to the DB minimum (0.2 → 1)", () => {
    expect(starsToRating(0.2)).toBe(1);
  });
  it("clamps 0 stars to 1 — callers must express 'cleared' as null, not 0", () => {
    expect(starsToRating(0)).toBe(1);
  });
  it("clamps negative stars to the DB minimum", () => {
    expect(starsToRating(-1)).toBe(1);
  });
  it("rounds between-step values to the nearest half-star int (3.3 → 7)", () => {
    // 3.3 * 2 = 6.6 → Math.round → 7
    expect(starsToRating(3.3)).toBe(7);
  });
  it("rounds down when nearer the lower step (3.2 → 6)", () => {
    // 3.2 * 2 = 6.4 → Math.round → 6
    expect(starsToRating(3.2)).toBe(6);
  });
});

describe("round-trips", () => {
  it("survives db → stars → db for every valid DB rating (1..10)", () => {
    for (let db = 1; db <= 10; db++) {
      expect(starsToRating(ratingToStars(db))).toBe(db);
    }
  });
  it("survives stars → db → stars for every valid half-star step", () => {
    for (let stars = 0.5; stars <= 5.0; stars += 0.5) {
      expect(ratingToStars(starsToRating(stars))).toBe(stars);
    }
  });
});

describe("isValidStars", () => {
  it("accepts the minimum (0.5)", () => {
    expect(isValidStars(0.5)).toBe(true);
  });
  it("accepts the maximum (5.0)", () => {
    expect(isValidStars(5.0)).toBe(true);
  });
  it("accepts whole-star values (3)", () => {
    expect(isValidStars(3)).toBe(true);
  });
  it("rejects 0 (cleared is null, not a star value)", () => {
    expect(isValidStars(0)).toBe(false);
  });
  it("rejects values above the maximum (5.5)", () => {
    expect(isValidStars(5.5)).toBe(false);
  });
  it("rejects values between half-star steps (3.25)", () => {
    expect(isValidStars(3.25)).toBe(false);
  });
  it("rejects negatives", () => {
    expect(isValidStars(-0.5)).toBe(false);
  });
});
