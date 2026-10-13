import type { ArchiveEntry } from "./types";
import { naturalSort } from "./naturalSort";
import type { ComicInfoMetadata } from "./comicInfo";

export type ChapterGroup = {
  key: string;
  title: string;
  entries: ArchiveEntry[];
  number?: number;
  volume?: number;
};

type ChapterMarker = {
  key: string;
  title: string;
  number?: number;
  volume?: number;
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

  const fallbackTitle = baseNameWithoutExtension(
    (chapterKey || sourceName).replaceAll("\\", "/").split("/").pop() ?? "",
  );
  if (/^\d+(?:\.\d+)?$/u.test(fallbackTitle)) {
    return `Chapter ${fallbackTitle}`;
  }
  return (
    fallbackTitle
      .replace(/[_-]+/g, " ")
      .replace(/^(chapter|chap|ch|episode|ep|part)(\d)/i, "$1 $2")
      .trim() || baseNameWithoutExtension(sourceName)
  );
}

function canonicalNumber(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : value;
}

function chapterMarker(name: string): ChapterMarker | undefined {
  const normalized = name.replaceAll("\\", "/");
  const parts = normalized.split("/");
  let volume: string | undefined;
  let chapter: string | undefined;
  let issue: string | undefined;

  for (const part of parts) {
    volume ??= part.match(
      /(?:^|[^a-z0-9])(?:volume|vol|v)\s*[._#-]*0*(\d+(?:\.\d+)?)(?=$|[^0-9])/i,
    )?.[1];
    chapter ??= part.match(
      /(?:^|[^a-z0-9])(?:chapter|chap|ch|episode|ep|part)\s*[._#-]*0*(\d+(?:\.\d+)?)(?=$|[^0-9])/i,
    )?.[1];
    issue ??= part.match(
      /(?:^|[^a-z0-9])#\s*0*(\d+(?:\.\d+)?)(?=$|[^0-9])/i,
    )?.[1];
  }

  if (!chapter && !issue && !volume) return undefined;
  const volumeKey = volume ? `volume:${canonicalNumber(volume)}` : "";
  const chapterKey = chapter
    ? `chapter:${canonicalNumber(chapter)}`
    : issue
      ? `issue:${canonicalNumber(issue)}`
      : "";
  const number = chapter ?? issue;
  const title = /\bprologue\b/i.test(normalized)
    ? "Prologue"
    : /\bprelude\b/i.test(normalized)
      ? "Prelude"
      : chapter
        ? `Chapter ${canonicalNumber(chapter)}`
        : issue
          ? `Issue ${canonicalNumber(issue)}`
          : `Volume ${canonicalNumber(volume ?? "")}`;

  return {
    key: [volumeKey, chapterKey].filter(Boolean).join("/"),
    title,
    number: number ? Number(number) : undefined,
    volume: volume ? Number(volume) : undefined,
  };
}

function numericFilenameChapter(name: string): ChapterMarker | undefined {
  const baseName = baseNameWithoutExtension(name);
  const match = baseName.match(/(?:^|[^0-9])(\d{1,4})[-_. ]+(\d{1,4})$/u);
  if (!match) return undefined;

  const number = Number(match[1]);
  return {
    key: `chapter:${number}`,
    title: `Chapter ${number}`,
    number,
  };
}

function groupByParent(entries: ArchiveEntry[]): ChapterGroup[] {
  const grouped = new Map<string, ArchiveEntry[]>();

  for (const entry of entries) {
    const normalized = entry.name.replaceAll("\\", "/");
    const lastSlash = normalized.lastIndexOf("/");
    const key = lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
    const bucket = grouped.get(key) ?? [];
    bucket.push(entry);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries()).map(([key, chapterEntries]) => ({
    key,
    title: deriveChapterTitle(key, chapterEntries[0]?.name ?? key),
    entries: chapterEntries,
  }));
}

function groupByMarkers(
  entries: ArchiveEntry[],
  getMarker: (entry: ArchiveEntry) => ChapterMarker | undefined,
): ChapterGroup[] | undefined {
  const marked = new Map<
    string,
    { marker: ChapterMarker; entries: ArchiveEntry[] }
  >();
  const unmarked: ArchiveEntry[] = [];

  for (const entry of entries) {
    const marker = getMarker(entry);
    if (!marker) {
      unmarked.push(entry);
      continue;
    }
    const group = marked.get(marker.key) ?? { marker, entries: [] };
    group.entries.push(entry);
    marked.set(marker.key, group);
  }

  if (marked.size < 2) return undefined;

  const groups: ChapterGroup[] = Array.from(marked.values()).map(
    ({ marker, entries: chapterEntries }) => ({
      key: marker.key,
      title: marker.title,
      number: marker.number,
      volume: marker.volume,
      entries: chapterEntries,
    }),
  );
  groups.push(...groupByParent(unmarked));
  return groups;
}

export function groupArchiveEntries(
  entries: ArchiveEntry[],
  isNovel = false,
): ChapterGroup[] {
  if (entries.length === 0) return [];

  if (isNovel) {
    const textEntries = entries.filter(
      (entry) =>
        entry.mime.startsWith("text/") || /(?:html|xml)/i.test(entry.mime),
    );
    if (textEntries.length > 1) {
      const textSet = new Set(textEntries);
      const groups = textEntries.map((entry) => ({
        key: entry.name,
        title: deriveChapterTitle("", entry.name),
        entries: [entry],
      }));
      const mediaEntries = entries.filter((entry) => !textSet.has(entry));
      if (mediaEntries.length > 0) {
        groups[0]?.entries.push(...mediaEntries);
      }
      return groups;
    }
  }

  const explicitGroups = groupByMarkers(entries, (entry) =>
    chapterMarker(entry.name),
  );
  if (explicitGroups) return sortGroups(explicitGroups);

  const parentGroups = groupByParent(entries);
  if (parentGroups.length > 1) return sortGroups(parentGroups);

  const numericGroups = groupByMarkers(entries, (entry) =>
    numericFilenameChapter(entry.name),
  );
  return sortGroups(numericGroups ?? parentGroups);
}

function sortGroups(groups: ChapterGroup[]): ChapterGroup[] {
  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.sort((left, right) =>
        naturalSort(left.name, right.name),
      ),
    }))
    .sort((left, right) => naturalSort(left.key, right.key));
}
