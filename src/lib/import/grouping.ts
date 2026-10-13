import type { ArchiveEntry } from "./types";
import { naturalSort } from "./naturalSort";
import type { ComicInfoMetadata } from "./comicInfo";

export type ChapterGroup = {
  key: string;
  title: string;
  entries: ArchiveEntry[];
};

function normalizeValue(value: string): string {
  return value.normalize("NFKC").trim();
}

function baseNameWithoutExtension(name: string): string {
  const normalized = name.replaceAll("\\", "/");
  const baseName = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dotIndex = baseName.lastIndexOf(".");
  return dotIndex >= 0 ? baseName.slice(0, dotIndex) : baseName;
}

function stripChapterSuffix(name: string): string {
  const patterns = [
    /(?:\s*[-_]\s*)?(?:c|ch|chapter)\s*0*\d+(?:\.\d+)?$/i,
    /(?:\s*[-_]\s*)?(?:vol|volume|v)\s*0*\d+(?:\.\d+)?$/i,
    /(?:\s+)?(?:part|episode|ep)\s*0*\d+(?:\.\d+)?$/i,
  ];

  let result = name;
  for (const pattern of patterns) {
    result = result.replace(pattern, "").trim();
  }

  return result.replace(/[\s._-]+$/u, "").trim();
}

function titleCase(value: string): string {
  return value.replace(/\p{L}[\p{L}\p{N}'’]*/gu, (word) => {
    const [first, ...rest] = word;
    return `${first.toLocaleUpperCase()}${rest.join("").toLocaleLowerCase()}`;
  });
}

export function deriveSeriesTitle(
  sourceName: string,
  comicInfo?: ComicInfoMetadata,
): string {
  const seriesTitle = comicInfo?.series?.trim();
  if (seriesTitle) {
    return seriesTitle;
  }

  const strippedName = stripChapterSuffix(baseNameWithoutExtension(sourceName));
  const readable = (strippedName || baseNameWithoutExtension(sourceName))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return titleCase(readable || baseNameWithoutExtension(sourceName));
}

export function deriveSeriesId(
  sourceName: string,
  comicInfo?: ComicInfoMetadata,
): string {
  return `series:${normalizeValue(deriveSeriesTitle(sourceName, comicInfo)).toLocaleLowerCase()}`;
}

export function deriveChapterTitle(
  chapterKey: string,
  sourceName: string,
  comicInfo?: ComicInfoMetadata,
): string {
  if (chapterKey === "" && comicInfo?.title?.trim()) {
    return comicInfo.title.trim();
  }

  const fallbackTitle = baseNameWithoutExtension(chapterKey || sourceName);
  return (
    stripChapterSuffix(fallbackTitle) ||
    fallbackTitle ||
    baseNameWithoutExtension(sourceName)
  );
}

export function groupArchiveEntries(entries: ArchiveEntry[]): ChapterGroup[] {
  const grouped = new Map<string, ArchiveEntry[]>();

  for (const entry of entries) {
    const normalized = entry.name.replaceAll("\\", "/");
    const lastSlash = normalized.lastIndexOf("/");
    const key = lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
    const bucket = grouped.get(key) ?? [];
    bucket.push(entry);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries())
    .sort(([leftKey], [rightKey]) => naturalSort(leftKey, rightKey))
    .map(([key, chapterEntries]) => ({
      key,
      title: deriveChapterTitle(key, chapterEntries[0]?.name ?? key),
      entries: chapterEntries.sort((left, right) =>
        naturalSort(left.name, right.name),
      ),
    }));
}
