// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { extractArchiveBundle, extractArchiveEntries } from "./archive";
import { extractWithLibarchive } from "./libarchive";

vi.mock("./libarchive", () => ({
  extractWithLibarchive: vi.fn(),
}));

function createArchiveSource(
  fileName: string,
  bytes: Uint8Array,
): { name: string; blob: Blob } {
  return {
    name: fileName,
    blob: new Blob([bytes], { type: "application/zip" }),
  };
}

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
  return createArchiveSource(name, bytes);
}

describe("archive extraction", () => {
  it("filters junk entries from cbz files", async () => {
    const entries = await extractArchiveEntries(await loadFixture("junk.cbz"));

    expect(entries.map((entry) => entry.name)).toEqual([
      "page_1.png",
      "page_2.png",
      "page_10.png",
    ]);
  });

  it("keeps only supported entries from cbz files", async () => {
    const entries = await extractArchiveEntries(await loadFixture("meta.cbz"));

    expect(entries.map((entry) => entry.name)).toEqual([
      "page_1.png",
      "page_2.png",
      "page_10.png",
      "z_cover.png",
    ]);
    expect(entries.every((entry) => entry.mime.startsWith("image/"))).toBe(
      true,
    );
  });

  it("excludes EPUB package navigation and keeps reading documents", async () => {
    const entries = await extractArchiveEntries(await loadFixture("book.epub"));

    expect(entries.map((entry) => entry.name)).toEqual(["OPS/chapter1.xhtml"]);
  });

  it("extracts nested CBZ issues from a ZIP collection", async () => {
    const issue = zipSync(
      { "page_1.png": new Uint8Array([137, 80, 78, 71]) },
      { level: 6 },
    );
    const collection = zipSync({ "Deadpool 001.cbz": issue }, { level: 6 });
    const bundle = await extractArchiveBundle(
      createArchiveSource("Deadpool collection.zip", collection),
    );

    expect(bundle.entries.map((entry) => entry.name)).toEqual([
      "Deadpool 001/page_1.png",
    ]);
  });

  it("expands multiple nested CBZ chapters in order", async () => {
    const firstChapter = zipSync(
      { "page_1.png": new Uint8Array([1, 2, 3]) },
      { level: 6 },
    );
    const secondChapter = zipSync(
      { "page_1.png": new Uint8Array([4, 5, 6]) },
      { level: 6 },
    );
    const collection = zipSync(
      { "Chapter 2.cbz": secondChapter, "Chapter 1.cbz": firstChapter },
      { level: 6 },
    );

    const bundle = await extractArchiveBundle(
      createArchiveSource("Collection.zip", collection),
    );

    expect(bundle.entries.map((entry) => entry.name)).toEqual([
      "Chapter 1/page_1.png",
      "Chapter 2/page_1.png",
    ]);
  });

  it("extracts stored nested CBZ entries", async () => {
    const chapter = zipSync(
      { "page_1.png": new Uint8Array([1, 2, 3]) },
      { level: 0 },
    );
    const collection = zipSync({ "Chapter 1.cbz": chapter }, { level: 0 });
    const progress: string[] = [];

    const bundle = await extractArchiveBundle(
      createArchiveSource("Collection.zip", collection),
      0,
      (message) => progress.push(message),
    );

    expect(bundle.entries.map((entry) => entry.name)).toEqual([
      "Chapter 1/page_1.png",
    ]);
    expect(
      progress.some((message) => /Extracting page_1\.png/.test(message)),
    ).toBe(true);
  });

  it("reopens the original collection if its extracted nested CBZ is truncated", async () => {
    const intactChapter = zipSync(
      { "page_1.png": new Uint8Array([1, 2, 3]) },
      { level: 6 },
    );
    const collection = zipSync(
      { "Chapter 1.cbz": new Uint8Array([1, 2, 3, 4]) },
      { level: 6 },
    );
    const compatibilityExtract = vi.mocked(extractWithLibarchive);
    let chapterAttempts = 0;
    compatibilityExtract.mockImplementation(async (source) => {
      if (source.name === "Chapter 1.cbz") {
        chapterAttempts += 1;
        if (chapterAttempts === 1) {
          throw new Error("Truncated ZIP file data");
        }
        return [
          { name: "page_1.png", blob: new Blob([new Uint8Array([1, 2, 3])]) },
        ];
      }
      if (source.name === "Collection.zip") {
        return [
          {
            name: "Chapter 1.cbz",
            blob: new Blob([intactChapter]),
          },
        ];
      }
      throw new Error(`Unexpected archive: ${source.name}`);
    });
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("File", class {});

    try {
      const bundle = await extractArchiveBundle(
        createArchiveSource("Collection.zip", collection),
      );

      expect(bundle.entries.map((entry) => entry.name)).toEqual([
        "Chapter 1/page_1.png",
      ]);
      expect(
        compatibilityExtract.mock.calls.map(([source]) => source.name),
      ).toEqual(["Chapter 1.cbz", "Collection.zip", "Chapter 1.cbz"]);
    } finally {
      compatibilityExtract.mockReset();
      vi.unstubAllGlobals();
    }
  });

  it("explains which entries were found when an archive has no readable pages", async () => {
    const archive = zipSync({ "readme.pdf": new Uint8Array([1, 2, 3]) });

    await expect(
      extractArchiveBundle(createArchiveSource("unsupported.zip", archive)),
    ).rejects.toThrow(/readme\.pdf.*Supported pages/);
  });

  it("reports entry scanning and extraction progress", async () => {
    const progress: string[] = [];
    await extractArchiveBundle(await loadFixture("meta.cbz"), 0, (message) => {
      progress.push(message);
    });

    expect(
      progress.some((message) => /Scanning archive entries/.test(message)),
    ).toBe(true);
    expect(progress.some((message) => /Extracting page_/.test(message))).toBe(
      true,
    );
  });
});
