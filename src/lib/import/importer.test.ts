// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { importArchiveSources } from "./importer";
import {
  getBlob,
  getSeries,
  listAllChapters,
  listPages,
  listSeries,
  putChapter,
  putPage,
  putSeries,
  saveBlob,
} from "../storage/db";
import { deriveSeriesId } from "./grouping";

type XmlNodeLike = {
  textContent?: string | null;
  getAttribute(name: string): string | null;
};

class ComicInfoDocument {
  constructor(private readonly xml: string) {}

  querySelector(selector: string): XmlNodeLike | null {
    if (selector === "parsererror") {
      return null;
    }

    const parts = selector.split(">").map((part) => part.trim());
    const tagName = parts[parts.length - 1];
    if (tagName === "Page") {
      const pages = this.querySelectorAll("ComicInfo > Pages > Page");
      return pages[0] ?? null;
    }

    const match = this.xml.match(
      new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"),
    );
    if (!match) {
      return null;
    }

    return {
      textContent: match[1].trim(),
      getAttribute: () => null,
    };
  }

  querySelectorAll(selector: string): XmlNodeLike[] {
    if (selector !== "ComicInfo > Pages > Page") {
      return [];
    }

    const pagesBlock =
      this.xml.match(/<Pages[^>]*>([\s\S]*?)<\/Pages>/i)?.[1] ?? "";
    const nodes: XmlNodeLike[] = [];
    const pagePattern = /<Page\b([^>]*)\/?>(?:<\/Page>)?/gi;
    for (const match of pagesBlock.matchAll(pagePattern)) {
      const attributes = new Map<string, string>();
      const attributePattern = /(\w+)=(?:"([^"]*)"|'([^']*)')/g;
      for (const attributeMatch of match[1].matchAll(attributePattern)) {
        attributes.set(
          attributeMatch[1],
          attributeMatch[2] ?? attributeMatch[3] ?? "",
        );
      }

      nodes.push({
        textContent: null,
        getAttribute: (name: string) => attributes.get(name) ?? null,
      });
    }

    return nodes;
  }
}

class ComicInfoDomParser {
  parseFromString(xml: string): ComicInfoDocument {
    return new ComicInfoDocument(xml);
  }
}

const previousDomParser = (globalThis as { DOMParser?: unknown }).DOMParser;

beforeAll(() => {
  (globalThis as { DOMParser?: unknown }).DOMParser = ComicInfoDomParser;
});

afterAll(() => {
  (globalThis as { DOMParser?: unknown }).DOMParser = previousDomParser;
});

async function loadFixture(
  name: string,
): Promise<{ name: string; blob: Blob }> {
  const processInfo = globalThis as { process?: { cwd: () => string } };
  const cwd = processInfo.process?.cwd();
  if (!cwd) {
    throw new Error("Missing working directory in test runtime");
  }

  const { join } = await import("node:path");
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(join(cwd, "fixtures", name));
  return {
    name,
    blob: new Blob([bytes], { type: "application/zip" }),
  };
}

describe("importer metadata and grouping", () => {
  it("reports per-file progress from extraction through completion", async () => {
    const progressValues: number[] = [];
    await importArchiveSources([await loadFixture("meta.cbz")], (event) =>
      progressValues.push(event.progress ?? -1),
    );

    expect(progressValues).toContain(0);
    expect(
      progressValues.some((progress) => progress > 0 && progress < 100),
    ).toBe(true);
    expect(progressValues.at(-1)).toBe(100);
  });

  it("parses ComicInfo metadata and cover art", async () => {
    const result = await importArchiveSources([await loadFixture("meta.cbz")]);

    expect(result.imported).toHaveLength(1);

    const series = await listSeries();
    expect(series).toHaveLength(1);
    expect(series[0]?.title).toBe("Kage Sample");
    expect(series[0]?.type).toBe("manga");
    expect(series[0]?.writer).toBe("A. Reader");
    expect(series[0]?.tags).toEqual(["alpha", "beta"]);
    expect(series[0]?.ageRating).toBe("18+");
    expect(series[0]?.coverPageKey).toBeDefined();

    const chapters = await listAllChapters();
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.title).toBe("Opening Move");
    expect(chapters[0]?.pageCount).toBe(4);
  });

  it("groups filename fallbacks into one series", async () => {
    const result = await importArchiveSources([
      await loadFixture("series-name-c001.cbz"),
      await loadFixture("series-name-vol01.cbz"),
    ]);

    expect(result.imported).toHaveLength(2);

    const series = await listSeries();
    expect(series).toHaveLength(1);
    expect(series[0]?.title).toBe("Series Name");

    const chapters = await listAllChapters();
    expect(chapters).toHaveLength(2);
    expect(new Set(chapters.map((chapter) => chapter.seriesId)).size).toBe(1);
  });

  it("uses the containing folder as the series title for one-shot archives", async () => {
    const mangaTitle = "Kimi wa Mada Torikago no Naka";
    const source = await loadFixture("ok.cbz");
    const result = await importArchiveSources([
      { ...source, name: `${mangaTitle}/Oneshot.cbz` },
    ]);

    expect(result.imported[0]?.title).toBe(mangaTitle);
    await expect(
      getSeries(deriveSeriesId(`${mangaTitle}/Oneshot.cbz`)),
    ).resolves.toMatchObject({
      title: mangaTitle,
    });
  });

  it("repairs a previously imported one-shot series on re-import", async () => {
    const mangaTitle = "Kimi wa Mada Torikago no Naka";
    const archive = zipSync({
      "Chapter 1/page.jpg": new Uint8Array([1, 2, 3]),
      "Chapter 2/page.jpg": new Uint8Array([4, 5, 6]),
    });
    const source = {
      name: "Oneshot.cbz",
      blob: new Blob([archive], { type: "application/zip" }),
    };
    await importArchiveSources([source]);

    const [previousSeries] = await listSeries();
    const previousChapters = await listAllChapters();
    if (!previousSeries || previousChapters.length !== 2) {
      throw new Error("Expected the legacy one-shot import");
    }
    expect(previousSeries.title).toBe("Oneshot");
    await putSeries({ ...previousSeries, title: "Oneshot" });
    await Promise.all(
      previousChapters.map((chapter) =>
        putChapter({
          ...chapter,
          sourceName: `${mangaTitle}/Oneshot.cbz`,
        }),
      ),
    );
    expect(
      (await listAllChapters()).every(
        (chapter) => chapter.sourceName === `${mangaTitle}/Oneshot.cbz`,
      ),
    ).toBe(true);
    expect(previousSeries.id).not.toBe(
      deriveSeriesId(`${mangaTitle}/Oneshot.cbz`),
    );

    const result = await importArchiveSources([
      { ...source, name: `${mangaTitle}/Oneshot.cbz` },
    ]);

    expect(result.imported).toHaveLength(0);
    expect(result.errors).toEqual([]);
    expect(await listSeries()).toMatchObject([
      {
        id: deriveSeriesId(`${mangaTitle}/Oneshot.cbz`),
        title: mangaTitle,
      },
    ]);
    await expect(listAllChapters()).resolves.toMatchObject([
      ...previousChapters.map((chapter) => ({
        id: chapter.id,
        seriesId: deriveSeriesId(`${mangaTitle}/Oneshot.cbz`),
      })),
    ]);
  });

  it("accepts EPUB novels alongside comic archives", async () => {
    const result = await importArchiveSources([await loadFixture("book.epub")]);

    expect(result.imported).toHaveLength(1);

    const series = await listSeries();
    const novelSeries = series.find((entry) => entry.type === "novel");
    expect(novelSeries?.title).toBe("Sample EPUB");
    expect(novelSeries?.type).toBe("novel");

    const chapters = await listAllChapters();
    expect(
      chapters.some(
        (chapter) =>
          chapter.seriesId === novelSeries?.id && chapter.pageCount > 0,
      ),
    ).toBe(true);
  });

  it("uses the OPF-declared image for a novel series cover", async () => {
    const epub = zipSync({
      "META-INF/container.xml": new TextEncoder().encode(
        '<container><rootfile full-path="OEBPS/package.opf"/></container>',
      ),
      "OEBPS/package.opf": new TextEncoder().encode(
        '<package><metadata><meta name="cover" content="cover-image"/></metadata><manifest><item id="cover-image" href="cover.jpg" media-type="image/jpeg"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest></package>',
      ),
      "OEBPS/cover.jpg": new Uint8Array([255, 216, 255, 217]),
      "OEBPS/chapter.xhtml": new TextEncoder().encode(
        "<html><body><p>Chapter text</p></body></html>",
      ),
    });

    await importArchiveSources([
      {
        name: "Novel with cover.epub",
        blob: new Blob([epub], { type: "application/epub+zip" }),
      },
    ]);

    const novel = (await listSeries()).find((entry) => entry.type === "novel");
    const chapter = (await listAllChapters()).find(
      (entry) => entry.seriesId === novel?.id,
    );
    const chapterPages = chapter ? await listPages(chapter.id) : [];
    const coverPage = chapterPages.find(
      (page) => `${page.chapterId}/${page.index}` === novel?.coverPageKey,
    );

    expect(coverPage?.mime).toBe("image/jpeg");
  });

  it("skips duplicate reimports", async () => {
    const source = await loadFixture("ok.cbz");

    const firstRun = await importArchiveSources([source]);
    const secondRun = await importArchiveSources([source]);

    expect(firstRun.imported).toHaveLength(1);
    expect(secondRun.imported).toHaveLength(0);

    const chapters = await listAllChapters();
    expect(chapters).toHaveLength(1);
  });

  it("reports import stages after opening an archive", async () => {
    const events: Array<{ state: string; message?: string }> = [];
    await importArchiveSources([await loadFixture("ok.cbz")], (event) => {
      events.push(event);
    });

    expect(events[0]?.message).toMatch(/Opening archive/);
    expect(
      events.some((event) =>
        /detecting chapters|Saving chapter/.test(event.message ?? ""),
      ),
    ).toBe(true);
    expect(events.at(-1)?.state).toBe("saved");
  });

  it("marks unprocessed sources cancelled when the queue is cancelled", async () => {
    const source = await loadFixture("ok.cbz");
    const controller = new AbortController();
    controller.abort();
    const events: Array<{ state: string; index: number }> = [];

    await importArchiveSources(
      [source, { ...source, name: "second.cbz" }],
      (event) => events.push(event),
      undefined,
      { signal: controller.signal },
    );

    expect(events).toMatchObject([
      { state: "cancelled", index: 1 },
      { state: "cancelled", index: 2 },
    ]);
    expect(await listAllChapters()).toEqual([]);
  });

  it("appends a new archive to the selected series and preserves its title", async () => {
    await importArchiveSources([await loadFixture("series-name-c001.cbz")]);
    const [series] = await listSeries();
    if (!series) throw new Error("Expected imported series");

    await putSeries({ ...series, title: "My Deadpool Shelf" });
    const appended = await importArchiveSources(
      [await loadFixture("meta.cbz")],
      undefined,
      series.id,
    );

    expect(appended.imported).toHaveLength(1);
    await expect(getSeries(series.id)).resolves.toMatchObject({
      title: "My Deadpool Shelf",
    });
    const chapters = await listAllChapters();
    expect(chapters).toHaveLength(2);
    expect(chapters.map((chapter) => chapter.seriesId)).toEqual([
      series.id,
      series.id,
    ]);
    expect(chapters.map((chapter) => chapter.order).sort()).toEqual([0, 1]);
  });

  it("replaces a previously merged chapter when its source now splits into chapters", async () => {
    const sourceName = "Repairable Series.zip";
    const seriesId = deriveSeriesId(sourceName);
    const legacyChapterId = "chapter:legacy-merged";
    const legacyStorageKey = `${legacyChapterId}/0`;
    await putSeries({
      schemaVersion: 2,
      id: seriesId,
      title: "Repairable Series",
      type: "manga",
      addedAt: 1,
      updatedAt: 1,
    });
    await putChapter({
      schemaVersion: 2,
      id: legacyChapterId,
      seriesId,
      title: "Chapter 33",
      order: 0,
      pageCount: 1,
      sourceName,
      hash: "legacy-merged-hash",
      addedAt: 1,
    });
    await putPage({
      schemaVersion: 2,
      id: "legacy-page",
      chapterId: legacyChapterId,
      index: 0,
      storageKey: legacyStorageKey,
      mime: "image/png",
    });
    await saveBlob(legacyStorageKey, new Blob(["old merged page"]));

    const archive = zipSync({
      "Series Chapter 1 page 001.png": new Uint8Array([1, 2]),
      "Series Chapter 1 page 002.png": new Uint8Array([3, 4]),
      "Series Chapter 2 page 001.png": new Uint8Array([5, 6]),
      "Series Chapter 2 page 002.png": new Uint8Array([7, 8]),
    });
    await importArchiveSources(
      [
        {
          name: sourceName,
          blob: new Blob([archive], { type: "application/zip" }),
        },
      ],
      undefined,
      seriesId,
    );

    const chapters = await listAllChapters();
    expect(chapters).toHaveLength(2);
    expect(chapters.every((chapter) => chapter.seriesId === seriesId)).toBe(
      true,
    );
    await expect(listPages(legacyChapterId)).resolves.toEqual([]);
    await expect(getBlob(legacyStorageKey)).resolves.toBeUndefined();
    expect(chapters.map((chapter) => chapter.order).sort()).toEqual([0, 1]);
  });
});
