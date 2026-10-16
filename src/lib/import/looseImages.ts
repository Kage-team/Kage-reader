import { zipSync } from "fflate";
import type { ArchiveSource } from "./types";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".jfif",
  ".jpe",
  ".svg",
]);
const ARCHIVE_PATTERN =
  /\.(cbz|zip|epub|cbr|rar|7z|cb7|cbt|tar|tgz|gz|bz2|xz)$/i;

function extensionFor(name: string): string {
  const basename = name.replaceAll("\\", "/").split("/").pop() ?? "";
  const dot = basename.lastIndexOf(".");
  return dot < 0 ? "" : basename.slice(dot).toLowerCase();
}

function archiveSafePath(name: string): string[] {
  return name
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..");
}

function safeArchiveTitle(name: string): string {
  const safeName = Array.from(name, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return /[<>:"/\\|?*]/.test(character) || codePoint < 32 ? "_" : character;
  }).join("");
  return safeName.trim() || "Loose Images";
}

export async function packageLooseImageSources(
  sources: ArchiveSource[],
): Promise<ArchiveSource[]> {
  const imageGroups = new Map<string, Map<string, ArchiveSource>>();
  const regularSources: ArchiveSource[] = [];

  for (const source of sources) {
    if (
      ARCHIVE_PATTERN.test(source.name) ||
      !IMAGE_EXTENSIONS.has(extensionFor(source.name))
    ) {
      regularSources.push(source);
      continue;
    }

    const pathParts = archiveSafePath(source.name);
    const hasFolderPath = pathParts.length > 1;
    const title = hasFolderPath ? pathParts[0] : "Loose Images";
    const entryPath = hasFolderPath
      ? pathParts.slice(1).join("/")
      : (pathParts[0] ?? source.name);
    const entries = imageGroups.get(title) ?? new Map<string, ArchiveSource>();
    entries.set(entryPath, source);
    imageGroups.set(title, entries);
  }

  const packedSources = await Promise.all(
    Array.from(imageGroups, async ([title, sourcesByPath]) => {
      const entries: Record<string, Uint8Array> = {};
      for (const [path, source] of sourcesByPath) {
        entries[path] = new Uint8Array(await source.blob.arrayBuffer());
      }
      return {
        name: `${safeArchiveTitle(title)}.cbz`,
        blob: new Blob([zipSync(entries, { level: 0 })], {
          type: "application/zip",
        }),
      };
    }),
  );

  return [...regularSources, ...packedSources];
}
