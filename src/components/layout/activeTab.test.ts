import { describe, expect, it } from "vitest";
import { getActiveTab } from "./activeTab";

describe("getActiveTab", () => {
  it.each([
    ["Root library", "/", "", "library"],
    ["Library", "/", "?view=all", "library"],
    ["Continue", "/", "?view=continue", "library"],
    ["Saved", "/", "?view=saved", "saved"],
    ["Favorites", "/", "?view=favorites", "saved"],
    ["Queue", "/", "?view=queue", "saved"],
    ["Adult vault", "/", "?view=adult", "library"],
    ["Insights", "/", "?view=insights", "activity"],
    ["Activity", "/", "?view=history", "activity"],
    ["Add", "/import", "", "add"],
    ["More", "/settings", "", "more"],
  ])("maps %s to one tab", (_label, pathname, search, expected) => {
    expect(getActiveTab(pathname, search)).toBe(expected);
  });
});
