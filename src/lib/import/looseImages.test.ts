// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractArchiveEntries } from "./archive";
import { packageLooseImageSources } from "./looseImages";

describe("packageLooseImageSources", () => {
  it("groups loose images by their top-level directory and preserves archives", async () => {
    const sources = [
      { name: "Series A/Chapter 1/page_1.jpg", blob: new Blob(["one"]) },
      { name: "Series A/Chapter 1/page_2.jpg", blob: new Blob(["two"]) },
      { name: "Series A/Chapter 2/page_1.jpg", blob: new Blob(["three"]) },
      { name: "existing.cbz", blob: new Blob(["archive"]) },
    ];

    const packaged = await packageLooseImageSources(sources);

    expect(packaged.map((source) => source.name)).toEqual([
      "existing.cbz",
      "Series A.cbz",
    ]);
    const entries = await extractArchiveEntries(packaged[1]!);
    expect(entries.map((entry) => entry.name)).toEqual([
      "Chapter 1/page_1.jpg",
      "Chapter 1/page_2.jpg",
      "Chapter 2/page_1.jpg",
    ]);
  });

  it("collects standalone images into one readable chapter archive", async () => {
    const packaged = await packageLooseImageSources([
      { name: "page_1.png", blob: new Blob(["one"]) },
      { name: "page_2.png", blob: new Blob(["two"]) },
    ]);

    expect(packaged).toHaveLength(1);
    expect(packaged[0]?.name).toBe("Loose Images.cbz");
    await expect(extractArchiveEntries(packaged[0]!)).resolves.toHaveLength(2);
  });
});
