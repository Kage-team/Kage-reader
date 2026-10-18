import { describe, expect, it } from "vitest";
import type { Chapter } from "../../lib/storage/types";
import { filterAndSortChapters } from "./chapterList";

const chapters: Chapter[] = [
  { schemaVersion: 1, id: "c3", seriesId: "s1", title: "Final Signal", number: 3, order: 2, pageCount: 1, sourceName: "test", hash: "h3", addedAt: 3 },
  { schemaVersion: 1, id: "c1", seriesId: "s1", title: "First Light", number: 1, order: 0, pageCount: 1, sourceName: "test", hash: "h1", addedAt: 1 },
  { schemaVersion: 1, id: "c2", seriesId: "s1", title: "Signal in the Rain", number: 2, order: 1, pageCount: 1, sourceName: "test", hash: "h2", addedAt: 2 },
];

describe("filterAndSortChapters", () => {
  it("filters by title and sorts without mutating the source list", () => {
    const result = filterAndSortChapters(chapters, "signal", "ascending");
    expect(result.map((chapter) => chapter.id)).toEqual(["c2", "c3"]);
    expect(chapters.map((chapter) => chapter.id)).toEqual(["c3", "c1", "c2"]);
  });

  it("sorts chapters descending by order", () => {
    expect(filterAndSortChapters(chapters, "", "descending").map((chapter) => chapter.id)).toEqual(["c3", "c2", "c1"]);
  });
});
