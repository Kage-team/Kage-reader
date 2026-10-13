// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  getBlob,
  getBookmark,
  getProgress,
  getSeries,
  listAllChapters,
  listPages,
  listSeries,
  putBookmark,
  putChapter,
  putPage,
  putProgress,
  putSeries,
  resetDbCache,
  saveBlob,
  wipeDatabase,
} from "./db";
import { createLibraryBackup, restoreLibraryBackup } from "./backup";

beforeEach(async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: () => null,
    get length() {
      return values.size;
    },
  } satisfies Storage);
  resetDbCache();
  await wipeDatabase();
  resetDbCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("library backup", () => {
  it("round-trips records, progress, bookmarks, preferences, and page blobs", async () => {
    const series = {
      schemaVersion: 2,
      id: "series:backup",
      title: "Backup Sample",
      type: "novel" as const,
      coverPageKey: "series:backup/custom-cover",
      summary: "A saved series summary.",
      tags: ["saved"],
      addedAt: 10,
      updatedAt: 20,
    };
    const chapter = {
      schemaVersion: 2,
      id: "chapter:backup",
      seriesId: series.id,
      title: "Chapter 1",
      order: 0,
      pageCount: 1,
      sourceName: "backup.epub",
      hash: "backup-hash",
      addedAt: 20,
    };
    const page = {
      schemaVersion: 2,
      id: "page:backup",
      chapterId: chapter.id,
      index: 0,
      storageKey: "chapter:backup/0",
      mime: "text/plain",
    };

    await putSeries(series);
    await putChapter(chapter);
    await putPage(page);
    await putProgress({
      schemaVersion: 2,
      chapterId: chapter.id,
      pageIndex: 0,
      scrollRatio: 0.4,
      updatedAt: 30,
    });
    await putBookmark({
      schemaVersion: 2,
      chapterId: chapter.id,
      pageIndex: 0,
      createdAt: 30,
    });
    await saveBlob(
      page.storageKey,
      new Blob(["saved page"], { type: page.mime }),
    );
    await saveBlob(
      series.coverPageKey,
      new Blob(["cover"], { type: "image/png" }),
    );

    const backup = await createLibraryBackup();
    expect(backup.type).toBe("application/zip");

    await wipeDatabase();
    await putSeries({ ...series, title: "Older local copy" });
    await putSeries({
      schemaVersion: 2,
      id: "series:local-only",
      title: "Keep local series",
      type: "manga",
      addedAt: 1,
      updatedAt: 1,
    });
    const result = await restoreLibraryBackup(backup);

    expect(result.seriesCount).toBe(1);
    expect(result.chapterCount).toBe(1);
    await expect(listSeries()).resolves.toHaveLength(2);
    await expect(listSeries()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: series.id, title: series.title }),
        expect.objectContaining({
          id: "series:local-only",
          title: "Keep local series",
        }),
      ]),
    );
    await expect(listAllChapters()).resolves.toMatchObject([
      { id: chapter.id },
    ]);
    await expect(listPages(chapter.id)).resolves.toMatchObject([
      { storageKey: page.storageKey },
    ]);
    await expect(getBlob(series.coverPageKey)).resolves.toMatchObject({
      type: "image/png",
    });
    await expect(getSeries(series.id)).resolves.toMatchObject({
      summary: "A saved series summary.",
      coverPageKey: series.coverPageKey,
    });
    await expect(getProgress(chapter.id)).resolves.toMatchObject({
      scrollRatio: 0.4,
    });
    await expect(getBookmark(chapter.id)).resolves.toMatchObject({
      pageIndex: 0,
    });
    await expect((await getBlob(page.storageKey))?.text()).resolves.toBe(
      "saved page",
    );
  });

  it("rejects invalid backups without changing the library", async () => {
    await putSeries({
      schemaVersion: 2,
      id: "series:keep",
      title: "Keep me",
      type: "manga",
      addedAt: 1,
      updatedAt: 1,
    });

    await expect(
      restoreLibraryBackup(new Blob(["not a backup"])),
    ).rejects.toThrow();
    await expect(listSeries()).resolves.toMatchObject([{ id: "series:keep" }]);
  });

  it("rejects inconsistent record references before writing", async () => {
    await putSeries({
      schemaVersion: 2,
      id: "series:keep",
      title: "Keep me",
      type: "manga",
      addedAt: 1,
      updatedAt: 1,
    });
    const invalidManifest = {
      format: "kage-reader-backup",
      version: 1,
      appSchemaVersion: 2,
      createdAt: 1,
      records: {
        series: [],
        chapters: [
          {
            schemaVersion: 2,
            id: "chapter:orphan",
            seriesId: "series:missing",
            title: "Orphan chapter",
            order: 0,
            pageCount: 0,
            sourceName: "orphan.cbz",
            hash: "orphan-hash",
            addedAt: 1,
          },
        ],
        pages: [],
        progress: [],
        bookmarks: [],
      },
      blobs: [],
      preferences: {
        defaultReaderMode: "flip",
        textScale: 100,
        highContrast: false,
      },
    };
    const invalidBackup = new Blob(
      [zipSync({ "manifest.json": strToU8(JSON.stringify(invalidManifest)) })],
      { type: "application/zip" },
    );

    await expect(restoreLibraryBackup(invalidBackup)).rejects.toThrow(
      "inconsistent library records",
    );
    await expect(listSeries()).resolves.toMatchObject([{ id: "series:keep" }]);
    await expect(listAllChapters()).resolves.toEqual([]);
  });
});
