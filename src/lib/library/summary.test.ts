import { describe, expect, it } from "vitest";
import type { Chapter, Series } from "../storage/types";
import { buildLibraryEntries } from "./summary";

describe("buildLibraryEntries", () => {
  it("orders series by most recent update and aggregates chapter/page counts", () => {
    const series: Series[] = [
      {
        schemaVersion: 1,
        id: "series:alpha",
        title: "Alpha",
        type: "manga",
        coverPageKey: "series:alpha/0",
        addedAt: 100,
        updatedAt: 300,
      },
      {
        schemaVersion: 1,
        id: "series:beta",
        title: "Beta",
        type: "manga",
        addedAt: 80,
        updatedAt: 200,
      },
    ];

    const chapters: Chapter[] = [
      {
        schemaVersion: 1,
        id: "chapter:alpha-1",
        seriesId: "series:alpha",
        title: "Alpha 1",
        order: 0,
        pageCount: 10,
        sourceName: "alpha.cbz",
        hash: "hash-a",
        addedAt: 120,
      },
      {
        schemaVersion: 1,
        id: "chapter:alpha-2",
        seriesId: "series:alpha",
        title: "Alpha 2",
        order: 1,
        pageCount: 12,
        sourceName: "alpha.cbz",
        hash: "hash-b",
        addedAt: 180,
      },
      {
        schemaVersion: 1,
        id: "chapter:beta-1",
        seriesId: "series:beta",
        title: "Beta 1",
        order: 0,
        pageCount: 8,
        sourceName: "beta.cbz",
        hash: "hash-c",
        addedAt: 170,
      },
    ];

    expect(buildLibraryEntries(series, chapters)).toEqual([
      {
        id: "series:alpha",
        title: "Alpha",
        coverPageKey: "series:alpha/0",
        chapterCount: 2,
        pageCount: 22,
        updatedAt: 300,
      },
      {
        id: "series:beta",
        title: "Beta",
        coverPageKey: undefined,
        chapterCount: 1,
        pageCount: 8,
        updatedAt: 200,
      },
    ]);
  });
});
