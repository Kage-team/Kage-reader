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

function looksLikeChapterFolder(name: string): boolean {
  return /^(?:chapter|chap|ch|episode|ep|part|issue)[\s._#-]*0*\d+\b/i.test(
    name.trim(),
  );
}

function commonFolderName(paths: string[][]): string | undefined {
  const firstParts = paths
    .map((parts) => parts[0])
    .filter((part): part is string => Boolean(part));
  if (
    firstParts.length === 0 ||
    !firstParts.every((part) => part === firstParts[0])
  ) {
    return undefined;
  }
  return firstParts[0];
}

export async function packageLooseImageSources(
  sources: ArchiveSource[],
): Promise<ArchiveSource[]> {
  const imageGroups = new Map<string, Map<string, ArchiveSource>>();
  const regularSources: ArchiveSource[] = [];
  const imageSources = sources.filter(
    (source) =>
      !ARCHIVE_PATTERN.test(source.name) &&
      IMAGE_EXTENSIONS.has(extensionFor(source.name)),
  );
  const imagePaths = imageSources.map((source) => archiveSafePath(source.name));
  const sharedRoot = commonFolderName(imagePaths);
  const rootFolderName = imageSources[0]?.rootFolderName;
  const rootIsSeries =
    Boolean(rootFolderName) &&
    imageSources.every((source) => source.rootFolderName === rootFolderName) &&
    regularSources.length === 0;
  const firstPartsAreChapters =
    imagePaths.length > 1 &&
    imagePaths.every(
      (parts) => parts.length > 1 && looksLikeChapterFolder(parts[0] ?? ""),
    );
  const preserveFolderPaths =
    firstPartsAreChapters || imagePaths.some((parts) => parts.length > 2);

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
    const title = rootIsSeries
      ? rootFolderName!
      : firstPartsAreChapters
        ? "Loose Images"
        : (sharedRoot ?? (hasFolderPath ? pathParts[0] : "Loose Images"));
    const entries = imageGroups.get(title) ?? new Map<string, ArchiveSource>();
    const entryPath = preserveFolderPaths
      ? sharedRoot && pathParts[0] === sharedRoot
        ? pathParts.slice(1).join("/")
        : pathParts.join("/")
      : `pages/${String(entries.size + 1).padStart(6, "0")}${extensionFor(source.name)}`;
    entries.set(entryPath || source.name, source);
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
