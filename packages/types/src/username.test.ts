import { describe, expect, it } from "vitest";
import { USERNAME_REGEX, normalizeUsername, validateUsername } from "./username.ts";

describe("normalizeUsername", () => {
  it("lowercases and trims", () => {
    expect(normalizeUsername("  JessB  ")).toBe("jessb");
  });
});

describe("validateUsername", () => {
  it("accepts a valid lowercase handle", () => {
    expect(validateUsername("jess_b")).toEqual({ ok: true, value: "jess_b" });
  });
  it("normalizes before validating", () => {
    expect(validateUsername("  JessB ")).toEqual({ ok: true, value: "jessb" });
  });
  it("rejects too short", () => {
    expect(validateUsername("ab").ok).toBe(false);
  });
  it("rejects too long (>20)", () => {
    expect(validateUsername("a".repeat(21)).ok).toBe(false);
  });
  it("accepts the exact minimum boundary (length 3)", () => {
    expect(validateUsername("abc")).toEqual({ ok: true, value: "abc" });
  });
  it("accepts the exact maximum boundary (length 20)", () => {
    expect(validateUsername("a".repeat(20))).toEqual({ ok: true, value: "a".repeat(20) });
  });
  it("rejects empty and whitespace-only input", () => {
    expect(validateUsername("").ok).toBe(false);
    expect(validateUsername("   ").ok).toBe(false);
  });
  it("rejects illegal characters", () => {
    expect(validateUsername("jess.barrett").ok).toBe(false);
    expect(validateUsername("jess-b").ok).toBe(false);
  });
  it("returns a human message on failure", () => {
    const r = validateUsername("a");
    if (r.ok) throw new Error("expected failure");
    expect(r.error).toMatch(/3.*20/);
  });
  it("exposes the regex for callers that want inline checks", () => {
    expect(USERNAME_REGEX.test("good_1")).toBe(true);
  });
});
