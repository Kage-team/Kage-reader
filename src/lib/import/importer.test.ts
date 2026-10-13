// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importArchiveSources } from "./importer";
import { listAllChapters, listSeries } from "../storage/db";

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

  // @ts-expect-error Node runtime module is available in Vitest.
  const { join } = await import("node:path");
  // @ts-expect-error Node runtime module is available in Vitest.
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(join(cwd, "fixtures", name));
  return {
    name,
    blob: new Blob([bytes], { type: "application/zip" }),
  };
}

describe("importer metadata and grouping", () => {
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
        (chapter) => chapter.seriesId === novelSeries?.id && chapter.pageCount > 0,
      ),
    ).toBe(true);
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
});
