// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  getBlob,
  putChapter,
  putPage,
  putSeries,
  resetDbCache,
  saveBlob,
  wipeDatabase,
} from "./db";
import { createChapterExport, createSeriesExport } from "./export";

beforeEach(async () => {
  resetDbCache();
  await wipeDatabase();
  resetDbCache();
});

describe("book export", () => {
  it("exports image chapters as CBZ archives", async () => {
    await putSeries({
      schemaVersion: 1,
      id: "series:export",
      title: "Export Test",
      type: "manga",
      addedAt: 1,
      updatedAt: 1,
    });
    await putChapter({
      schemaVersion: 1,
      id: "chapter:export",
      seriesId: "series:export",
      title: "Chapter 1",
      order: 0,
      pageCount: 1,
      sourceName: "source.cbz",
      hash: "export-hash",
      addedAt: 1,
    });
    await putPage({
      schemaVersion: 1,
      id: "page:export",
      chapterId: "chapter:export",
      index: 0,
      storageKey: "chapter:export/0",
      mime: "image/jpeg",
    });
    await saveBlob(
      "chapter:export/0",
      new Blob(["image-bytes"], { type: "image/jpeg" }),
    );

    const exported = await createChapterExport("chapter:export");
    expect(exported.extension).toBe("cbz");
    const entries = unzipSync(
      new Uint8Array(await exported.blob.arrayBuffer()),
    );
    expect(strFromU8(entries["0001.jpg"] ?? new Uint8Array())).toBe(
      "image-bytes",
    );
  });

  it("exports novel chapters as EPUB and series bundles as ZIP", async () => {
    await putSeries({
      schemaVersion: 1,
      id: "series:novel-export",
      title: "Novel Export",
      type: "novel",
      addedAt: 1,
      updatedAt: 1,
    });
    await putChapter({
      schemaVersion: 1,
      id: "chapter:novel-export",
      seriesId: "series:novel-export",
      title: "Opening",
      order: 0,
      pageCount: 1,
      sourceName: "novel.epub",
      hash: "novel-export-hash",
      addedAt: 1,
    });
    await putPage({
      schemaVersion: 1,
      id: "page:novel-export",
      chapterId: "chapter:novel-export",
      index: 0,
      storageKey: "chapter:novel-export/0",
      mime: "text/plain",
    });
    await saveBlob(
      "chapter:novel-export/0",
      new Blob(["A newly exported chapter."], { type: "text/plain" }),
    );

    const epub = await createChapterExport("chapter:novel-export");
    expect(epub.extension).toBe("epub");
    const epubEntries = unzipSync(
      new Uint8Array(await epub.blob.arrayBuffer()),
    );
    expect(strFromU8(epubEntries.mimetype ?? new Uint8Array())).toBe(
      "application/epub+zip",
    );
    expect(
      strFromU8(epubEntries["OEBPS/chapter.xhtml"] ?? new Uint8Array()),
    ).toContain("A newly exported chapter.");

    const seriesZip = await createSeriesExport("series:novel-export");
    const seriesEntries = unzipSync(
      new Uint8Array(await seriesZip.arrayBuffer()),
    );
    expect(Object.keys(seriesEntries)).toContain(
      "001-Novel Export - Opening.epub",
    );
    await expect(getBlob("chapter:novel-export/0")).resolves.toBeDefined();
  });
});
