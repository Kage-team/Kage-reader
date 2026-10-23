import { describe, expect, it } from "vitest";
import { collectLinkedFolderSources } from "./linkedFolder";

function fileHandle(name: string, contents: string): FileSystemFileHandle {
  return {
    kind: "file",
    name,
    getFile: async () => new File([contents], name),
  } as FileSystemFileHandle;
}

function directoryHandle(
  name: string,
  entries: Array<[string, FileSystemHandle]>,
): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    async *entries() {
      yield* entries;
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("collectLinkedFolderSources", () => {
  it("collects supported files recursively with relative paths", async () => {
    const chapter = directoryHandle("chapter", [
      ["page-01.jpg", fileHandle("page-01.jpg", "image")],
      ["notes.exe", fileHandle("notes.exe", "ignored")],
    ]);
    const root = directoryHandle("library", [
      ["chapter", chapter],
      ["book.epub", fileHandle("book.epub", "book")],
    ]);

    const sources = await collectLinkedFolderSources(root);

    expect(sources.map((source) => source.name)).toEqual([
      "chapter/page-01.jpg",
      "book.epub",
    ]);
    expect(sources[0]?.blob.size).toBe(5);
    expect(sources[0]?.rootFolderName).toBe("library");
  });
});
