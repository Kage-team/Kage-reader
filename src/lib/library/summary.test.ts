import { describe, expect, it } from "vitest";
import type { Chapter, Series } from "../storage/types";
import { buildLibraryEntries, filterLibraryEntries } from "./summary";

describe("buildLibraryEntries", () => {
  it("orders series by most recent update and aggregates chapter/page counts", () => {
    const series: Series[] = [
      {
        schemaVersion: 1,
        id: "series:alpha",
        title: "Alpha",
        type: "manga",
        tags: ["adventure", "classic"],
        coverPageKey: "series:alpha/0",
        addedAt: 100,
        updatedAt: 300,
      },
      {
        schemaVersion: 1,
        id: "series:beta",
        title: "Beta",
        type: "novel",
        tags: ["mystery"],
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
        type: "manga",
        tags: ["adventure", "classic"],
        coverPageKey: "series:alpha/0",
        chapterCount: 2,
        pageCount: 22,
        updatedAt: 300,
      },
      {
        id: "series:beta",
        title: "Beta",
        type: "novel",
        tags: ["mystery"],
        coverPageKey: undefined,
        chapterCount: 1,
        pageCount: 8,
        updatedAt: 200,
      },
    ]);
  });

  it("filters by title or tag search, type, and exact tag", () => {
    const entries = buildLibraryEntries(
      [
        {
          schemaVersion: 1,
          id: "series:alpha",
          title: "Alpha",
          type: "manga",
          tags: ["adventure", "classic"],
          addedAt: 1,
          updatedAt: 2,
        },
        {
          schemaVersion: 1,
          id: "series:beta",
          title: "Beta",
          type: "novel",
          tags: ["mystery"],
          addedAt: 1,
          updatedAt: 1,
        },
      ],
      [],
    );

    expect(
      filterLibraryEntries(entries, { query: "ADVENT" }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["series:alpha"]);
    expect(
      filterLibraryEntries(entries, { type: "novel" }).map((entry) => entry.id),
    ).toEqual(["series:beta"]);
    expect(
      filterLibraryEntries(entries, { tag: "classic" }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["series:alpha"]);
  });
});
