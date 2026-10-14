// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteBlob,
  deleteBookmark,
  clearLibraryData,
  getBookmark,
  getBookmarksForChapter,
  getLinkedFolder,
  getProgress,
  getBlob,
  getSeries,
  listChapters,
  listAllChapters,
  listBookmarks,
  listPages,
  listProgress,
  listSeries,
  openKageDb,
  putChapter,
  putBookmark,
  putLinkedFolder,
  putPage,
  putProgress,
  putSeries,
  resetDbCache,
  saveBlob,
  deleteSeriesWithContents,
  deleteLinkedFolder,
  wipeDatabase,
} from "./db";

beforeEach(async () => {
  resetDbCache();
  await wipeDatabase();
  resetDbCache();
});

describe("blob storage", () => {
  it("round-trips through IndexedDB when OPFS is unavailable", async () => {
    const key = "series/chapter/page-1";
    const blob = new Blob(["hello world"], { type: "text/plain" });

    await saveBlob(key, blob);

    const stored = await getBlob(key);
    expect(stored).toBeDefined();
    expect(stored?.size).toBe(blob.size);
    expect(stored?.type).toBe(blob.type);

    const storedBytes = new Uint8Array(await stored!.arrayBuffer());
    const expectedBytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(storedBytes)).toEqual(Array.from(expectedBytes));

    await deleteBlob(key);
    await expect(getBlob(key)).resolves.toBeUndefined();
  });

  it("deletes a series and its stored chapter content", async () => {
    const series = {
      schemaVersion: 1,
      id: "series:remove",
      title: "Remove me",
      type: "manga" as const,
      addedAt: 1,
      updatedAt: 1,
    };
    const unrelatedSeries = {
      ...series,
      id: "series:keep",
      title: "Keep me",
    };
    const chapter = {
      schemaVersion: 1,
      id: "chapter:remove",
      seriesId: series.id,
      title: "Chapter 1",
      order: 0,
      pageCount: 1,
      sourceName: "remove.cbz",
      hash: "remove-hash",
      addedAt: 1,
    };
    const page = {
      schemaVersion: 1,
      id: "page:remove",
      chapterId: chapter.id,
      index: 0,
      storageKey: "chapter:remove/0",
      mime: "text/plain",
    };

    await putSeries(series);
    await putSeries(unrelatedSeries);
    await putChapter(chapter);
    await putPage(page);
    await putProgress({
      schemaVersion: 1,
      chapterId: chapter.id,
      pageIndex: 0,
      scrollRatio: 0,
      updatedAt: 1,
    });
    await putBookmark({
      schemaVersion: 2,
      chapterId: chapter.id,
      pageIndex: 0,
      createdAt: 1,
    });
    await saveBlob(page.storageKey, new Blob(["page"]));

    await deleteSeriesWithContents(series.id);

    await expect(getSeries(series.id)).resolves.toBeUndefined();
    await expect(listSeries()).resolves.toEqual([
      { ...unrelatedSeries, schemaVersion: 4 },
    ]);
    await expect(listChapters(series.id)).resolves.toEqual([]);
    await expect(listPages(chapter.id)).resolves.toEqual([]);
    await expect(getProgress(chapter.id)).resolves.toBeUndefined();
    await expect(getBookmark(chapter.id)).resolves.toBeUndefined();
    await expect(getBlob(page.storageKey)).resolves.toBeUndefined();
  });

  it("orders chapters numerically instead of by import order", async () => {
    const seriesId = "series:chapter-order";
    const chapters = [
      {
        schemaVersion: 1,
        id: "chapter:135",
        seriesId,
        title: "Chapter 135",
        number: 135,
        order: 0,
        pageCount: 1,
        sourceName: "berserk.cbz",
        hash: "chapter-135",
        addedAt: 1,
      },
      {
        schemaVersion: 1,
        id: "chapter:3",
        seriesId,
        title: "Chapter 3",
        number: 3,
        order: 1,
        pageCount: 1,
        sourceName: "vinland.cbz",
        hash: "chapter-3",
        addedAt: 2,
      },
      {
        schemaVersion: 1,
        id: "chapter:1",
        seriesId,
        title: "Chapter 1",
        number: 1,
        order: 2,
        pageCount: 1,
        sourceName: "vinland.cbz",
        hash: "chapter-1",
        addedAt: 3,
      },
      {
        schemaVersion: 1,
        id: "chapter:prologue",
        seriesId,
        title: "Prologue",
        number: 135,
        order: 3,
        pageCount: 1,
        sourceName: "berserk.cbz",
        hash: "chapter-prologue",
        addedAt: 4,
      },
    ];
    for (const chapter of chapters) await putChapter(chapter);

    await expect(listChapters(seriesId)).resolves.toMatchObject([
      { title: "Prologue" },
      { title: "Chapter 1" },
      { title: "Chapter 3" },
      { title: "Chapter 135" },
    ]);

    const volumeSeriesId = "series:volume-order";
    await putChapter({
      schemaVersion: 1,
      id: "volume:2-chapter:1",
      seriesId: volumeSeriesId,
      title: "Chapter 1",
      number: 1,
      volume: 2,
      order: 0,
      pageCount: 1,
      sourceName: "volume-2.cbz",
      hash: "volume-2-chapter-1",
      addedAt: 1,
    });
    await putChapter({
      schemaVersion: 1,
      id: "volume:1-chapter:3",
      seriesId: volumeSeriesId,
      title: "Chapter 3",
      number: 3,
      volume: 1,
      order: 1,
      pageCount: 1,
      sourceName: "volume-1.cbz",
      hash: "volume-1-chapter-3",
      addedAt: 2,
    });

    await expect(listChapters(volumeSeriesId)).resolves.toMatchObject([
      { title: "Chapter 3", volume: 1 },
      { title: "Chapter 1", volume: 2 },
    ]);
  });

  it("derives chapter order from archive names when chapter metadata is missing", async () => {
    const seriesId = "series:filename-chapters";
    await putChapter({
      schemaVersion: 1,
      id: "chapter:filename-135",
      seriesId,
      title: "Page 001",
      order: 0,
      pageCount: 1,
      sourceName: "Berserk-ch.135.cbz",
      hash: "filename-chapter-135",
      addedAt: 1,
    });
    await putChapter({
      schemaVersion: 1,
      id: "chapter:filename-1",
      seriesId,
      title: "Page 001",
      order: 1,
      pageCount: 1,
      sourceName: "Berserk-c001.cbz",
      hash: "filename-chapter-1",
      addedAt: 2,
    });

    await expect(listChapters(seriesId)).resolves.toMatchObject([
      { id: "chapter:filename-1" },
      { id: "chapter:filename-135" },
    ]);
  });

  it("persists and removes a page bookmark", async () => {
    const firstBookmark = {
      schemaVersion: 2,
      chapterId: "chapter:bookmark",
      pageIndex: 3,
      createdAt: 20,
    };
    const secondBookmark = {
      ...firstBookmark,
      pageIndex: 8,
      createdAt: 30,
      note: "A favorite scene",
    };

    const savedBookmark = await putBookmark(firstBookmark);
    await putBookmark(secondBookmark);
    await expect(
      getBookmarksForChapter(firstBookmark.chapterId),
    ).resolves.toHaveLength(2);
    await expect(getBookmark(firstBookmark.chapterId)).resolves.toMatchObject({
      pageIndex: 3,
      note: "",
    });

    await deleteBookmark(savedBookmark.id);
    await expect(
      getBookmarksForChapter(firstBookmark.chapterId),
    ).resolves.toMatchObject([{ pageIndex: 8, note: "A favorite scene" }]);
  });

  it("migrates legacy chapter bookmarks into the multi-bookmark store", async () => {
    const chapterId = "chapter:legacy-bookmark";
    const db = await openKageDb();
    await db.put("bookmarks", {
      schemaVersion: 2,
      chapterId,
      pageIndex: 4,
      createdAt: 25,
    });

    resetDbCache();
    const migrated = await listBookmarks();
    expect(migrated).toMatchObject([
      {
        id: `legacy:${chapterId}`,
        chapterId,
        pageIndex: 4,
        createdAt: 25,
        note: "",
        schemaVersion: 4,
      },
    ]);

    resetDbCache();
    await expect(listBookmarks()).resolves.toEqual(migrated);
  });

  it("persists and removes a linked folder handle", async () => {
    const handle = {
      kind: "directory",
      name: "Comics",
    } as FileSystemDirectoryHandle;

    await putLinkedFolder(handle);
    await expect(getLinkedFolder()).resolves.toMatchObject({
      id: "primary",
      handle: { name: "Comics", kind: "directory" },
    });

    await deleteLinkedFolder();
    await expect(getLinkedFolder()).resolves.toBeUndefined();
  });

  it("clears all library records and stored page blobs", async () => {
    const chapterId = "chapter:clear";
    const storageKey = `${chapterId}/0`;
    await putSeries({
      schemaVersion: 2,
      id: "series:clear",
      title: "Clear me",
      type: "manga",
      addedAt: 1,
      updatedAt: 1,
    });
    await putChapter({
      schemaVersion: 2,
      id: chapterId,
      seriesId: "series:clear",
      title: "Chapter 1",
      order: 0,
      pageCount: 1,
      sourceName: "clear.cbz",
      hash: "clear-hash",
      addedAt: 1,
    });
    await putPage({
      schemaVersion: 2,
      id: "page:clear",
      chapterId,
      index: 0,
      storageKey,
      mime: "text/plain",
    });
    await putProgress({
      schemaVersion: 2,
      chapterId,
      pageIndex: 0,
      scrollRatio: 0,
      updatedAt: 1,
    });
    await putBookmark({
      schemaVersion: 2,
      chapterId,
      pageIndex: 0,
      createdAt: 1,
    });
    await saveBlob(storageKey, new Blob(["page"]));

    await clearLibraryData();

    await expect(listSeries()).resolves.toEqual([]);
    await expect(listAllChapters()).resolves.toEqual([]);
    await expect(listPages(chapterId)).resolves.toEqual([]);
    await expect(listProgress()).resolves.toEqual([]);
    await expect(listBookmarks()).resolves.toEqual([]);
    await expect(getBlob(storageKey)).resolves.toBeUndefined();
  });
});
