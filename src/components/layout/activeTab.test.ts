import { describe, expect, it } from "vitest";
import { getActiveTab } from "./activeTab";

describe("getActiveTab", () => {
  it.each([
    ["Root library", "/", "", "library"],
    ["Library", "/", "?view=all", "library"],
    ["Continue", "/", "?view=continue", "library"],
    ["Favorites", "/", "?view=favorites", "library"],
    ["Queue", "/", "?view=queue", "library"],
    ["Adult vault", "/", "?view=adult", "library"],
    ["Insights", "/", "?view=insights", "library"],
    ["Activity", "/", "?view=history", "activity"],
    ["Add", "/import", "", "add"],
    ["More", "/settings", "", "more"],
  ])("maps %s to one tab", (_label, pathname, search, expected) => {
    expect(getActiveTab(pathname, search)).toBe(expected);
  });
});
