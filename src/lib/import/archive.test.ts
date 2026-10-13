// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractArchiveEntries } from "./archive";

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

  // @ts-expect-error Node runtime module is available in Vitest.
  const { join } = await import("node:path");
  // @ts-expect-error Node runtime module is available in Vitest.
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
});
