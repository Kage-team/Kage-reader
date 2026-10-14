import { describe, expect, it } from "vitest";
import type { Chapter, Progress, Series } from "../storage/types";
import { buildLibraryEntries, filterLibraryEntries } from "./summary";

describe("buildLibraryEntries", () => {
  it("orders series by most recent update and aggregates chapter/page counts", () => {
    const series: Series[] = [
      {
        schemaVersion: 1,
        id: "series:alpha",
        title: "Alpha",
        type: "manga",
        isFavorite: true,
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
        ageRating: undefined,
        tags: ["adventure", "classic"],
        isFavorite: true,
        resume: undefined,
        coverPageKey: "series:alpha/0",
        chapterCount: 2,
        pageCount: 22,
        updatedAt: 300,
      },
      {
        id: "series:beta",
        title: "Beta",
        type: "novel",
        ageRating: undefined,
        tags: ["mystery"],
        isFavorite: false,
        resume: undefined,
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
        {
          schemaVersion: 1,
          id: "series:gamma",
          title: "Gamma",
          type: "manhwa",
          tags: [],
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
      filterLibraryEntries(entries, { type: "manga" }).map((entry) => entry.id),
    ).toEqual(["series:alpha", "series:gamma"]);
    expect(
      filterLibraryEntries(entries, { tag: "classic" }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["series:alpha"]);
  });

  it("derives favorites and the latest resume point for discovery views", () => {
    const series: Series[] = [
      {
        schemaVersion: 2,
        id: "series:reading",
        title: "Currently Reading",
        type: "manga",
        isFavorite: true,
        addedAt: 1,
        updatedAt: 2,
      },
    ];
    const chapters: Chapter[] = [
      {
        schemaVersion: 2,
        id: "chapter:reading-1",
        seriesId: "series:reading",
        title: "Chapter 1",
        order: 0,
        pageCount: 10,
        sourceName: "reading.cbz",
        hash: "reading-1",
        addedAt: 1,
      },
      {
        schemaVersion: 2,
        id: "chapter:reading-2",
        seriesId: "series:reading",
        title: "Chapter 2",
        order: 1,
        pageCount: 8,
        sourceName: "reading.cbz",
        hash: "reading-2",
        addedAt: 2,
      },
    ];
    const progress: Progress[] = [
      {
        schemaVersion: 2,
        chapterId: "chapter:reading-1",
        pageIndex: 2,
        scrollRatio: 0,
        updatedAt: 10,
      },
      {
        schemaVersion: 2,
        chapterId: "chapter:reading-2",
        pageIndex: 30,
        scrollRatio: 0,
        updatedAt: 20,
      },
    ];

    const entries = buildLibraryEntries(series, chapters, progress);
    expect(entries[0]?.resume).toEqual({
      chapterId: "chapter:reading-2",
      chapterTitle: "Chapter 2",
      pageIndex: 7,
      pageCount: 8,
      updatedAt: 20,
    });
    expect(filterLibraryEntries(entries, { favoriteOnly: true })).toHaveLength(
      1,
    );
    expect(filterLibraryEntries(entries, { continueOnly: true })).toHaveLength(
      1,
    );
  });

  it("filters mature-rated series in safe mode only", () => {
    const entries = buildLibraryEntries(
      [
        {
          schemaVersion: 2,
          id: "series:safe",
          title: "All ages",
          type: "manga",
          addedAt: 1,
          updatedAt: 1,
        },
        {
          schemaVersion: 2,
          id: "series:mature",
          title: "Mature title",
          type: "manga",
          ageRating: "18+",
          addedAt: 1,
          updatedAt: 1,
        },
      ],
      [],
    );

    expect(
      filterLibraryEntries(entries, { safeOnly: true }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["series:safe"]);
    expect(filterLibraryEntries(entries).map((entry) => entry.id)).toEqual([
      "series:safe",
      "series:mature",
    ]);
    expect(
      filterLibraryEntries(entries, { adultOnly: true }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["series:mature"]);
  });
});
