// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteBlob,
  getProgress,
  getBlob,
  getSeries,
  listChapters,
  listPages,
  listSeries,
  putChapter,
  putPage,
  putProgress,
  putSeries,
  resetDbCache,
  saveBlob,
  deleteSeriesWithContents,
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
    await saveBlob(page.storageKey, new Blob(["page"]));

    await deleteSeriesWithContents(series.id);

    await expect(getSeries(series.id)).resolves.toBeUndefined();
    await expect(listSeries()).resolves.toEqual([unrelatedSeries]);
    await expect(listChapters(series.id)).resolves.toEqual([]);
    await expect(listPages(chapter.id)).resolves.toEqual([]);
    await expect(getProgress(chapter.id)).resolves.toBeUndefined();
    await expect(getBlob(page.storageKey)).resolves.toBeUndefined();
  });
});
