import { AsyncUnzipInflate, strFromU8, strToU8, Unzip, zipSync } from "fflate";
import {
  getBlob,
  listAllChapters,
  listBookmarks,
  listPages,
  listProgress,
  listSeries,
  putBookmark,
  putChapter,
  putPage,
  putProgress,
  putSeries,
  saveBlob,
} from "./db";
import {
  SCHEMA_VERSION,
  type Bookmark,
  type Chapter,
  type Page,
  type Progress,
  type Series,
  type SeriesType,
  type ReaderMode,
} from "./types";
import {
  getPreferences,
  savePreferences,
  type Preferences,
} from "../preferences/preferences";

const BACKUP_FORMAT = "kage-reader-backup";
const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 1024 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 1024 * 1024 * 1024;

type BackupBlob = { storageKey: string; entry: string; type: string };

type BackupManifest = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  appSchemaVersion: number;
  createdAt: number;
  records: {
    series: Series[];
    chapters: Chapter[];
    pages: Page[];
    progress: Progress[];
    bookmarks: Bookmark[];
  };
  blobs: BackupBlob[];
  preferences: Preferences;
};

export type BackupRestoreResult = {
  seriesCount: number;
  chapterCount: number;
  pageCount: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string";
}

function hasFiniteNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "number" && Number.isFinite(value[key]);
}

function isSeriesType(value: unknown): value is SeriesType {
  return ["manga", "manhwa", "manhua", "oel", "novel"].includes(
    value as string,
  );
}

function isReaderMode(value: unknown): value is ReaderMode {
  return ["flip", "webtoon", "novel"].includes(value as string);
}

function isReadingDirection(value: unknown): value is "ltr" | "rtl" {
  return value === "ltr" || value === "rtl";
}

function isSeries(value: unknown): value is Series {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    isSeriesType(value.type) &&
    Number.isInteger(value.schemaVersion) &&
    hasFiniteNumber(value, "addedAt") &&
    hasFiniteNumber(value, "updatedAt") &&
    (value.tags === undefined ||
      (Array.isArray(value.tags) &&
        value.tags.every((tag) => typeof tag === "string"))) &&
    (value.summary === undefined || typeof value.summary === "string") &&
    (value.preferredMode === undefined || isReaderMode(value.preferredMode)) &&
    (value.preferredDirection === undefined ||
      isReadingDirection(value.preferredDirection))
  );
}

function isChapter(value: unknown): value is Chapter {
  if (!isObject(value)) return false;
  return (
    hasString(value, "id") &&
    hasString(value, "seriesId") &&
    hasString(value, "title") &&
    Number.isInteger(value.schemaVersion) &&
    Number.isInteger(value.order) &&
    Number.isInteger(value.pageCount) &&
    (value.pageCount as number) >= 0 &&
    hasString(value, "sourceName") &&
    hasString(value, "hash") &&
    hasFiniteNumber(value, "addedAt")
  );
}

function isPage(value: unknown): value is Page {
  if (!isObject(value)) return false;
  return (
    hasString(value, "id") &&
    hasString(value, "chapterId") &&
    Number.isInteger(value.schemaVersion) &&
    Number.isInteger(value.index) &&
    (value.index as number) >= 0 &&
    hasString(value, "storageKey") &&
    hasString(value, "mime")
  );
}

function isProgress(value: unknown): value is Progress {
  if (!isObject(value)) return false;
  return (
    hasString(value, "chapterId") &&
    Number.isInteger(value.schemaVersion) &&
    Number.isInteger(value.pageIndex) &&
    (value.pageIndex as number) >= 0 &&
    hasFiniteNumber(value, "scrollRatio") &&
    (value.scrollRatio as number) >= 0 &&
    (value.scrollRatio as number) <= 1 &&
    hasFiniteNumber(value, "updatedAt")
  );
}

function isBookmark(value: unknown): value is Bookmark {
  if (!isObject(value)) return false;
  return (
    hasString(value, "chapterId") &&
    Number.isInteger(value.schemaVersion) &&
    Number.isInteger(value.pageIndex) &&
    (value.pageIndex as number) >= 0 &&
    hasFiniteNumber(value, "createdAt")
  );
}

function isBackupBlob(value: unknown): value is BackupBlob {
  if (!isObject(value)) return false;
  return (
    typeof value.storageKey === "string" &&
    typeof value.entry === "string" &&
    /^blobs\/\d+\.bin$/.test(value.entry) &&
    typeof value.type === "string"
  );
}

function hasUniqueIds<T>(values: T[], getId: (value: T) => string): boolean {
  const ids = values.map(getId);
  return new Set(ids).size === ids.length;
}

function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function unzipBackup(backup: Blob): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = Object.create(null) as Record<
    string,
    Uint8Array
  >;
  const seenNames = new Set<string>();
  const entryTasks: Promise<void>[] = [];
  let unzippedBytes = 0;
  let failure: Error | undefined;

  const unzipper = new Unzip((file) => {
    if (
      (file.name !== "manifest.json" && !/^blobs\/\d+\.bin$/.test(file.name)) ||
      seenNames.has(file.name)
    ) {
      failure = new Error(
        "Backup contains an unexpected or duplicate ZIP entry.",
      );
      return;
    }
    seenNames.add(file.name);

    const chunks: Uint8Array[] = [];
    entryTasks.push(
      new Promise<void>((resolve) => {
        file.ondata = (error, chunk, final) => {
          if (error) {
            failure = new Error("Backup contains a damaged ZIP entry.");
            resolve();
            return;
          }
          if (failure) {
            resolve();
            return;
          }

          unzippedBytes += chunk.length;
          if (unzippedBytes > MAX_UNZIPPED_BYTES) {
            failure = new Error("Backup exceeds the expanded size limit.");
            resolve();
            return;
          }
          if (chunk.length > 0) {
            chunks.push(chunk.slice());
          }
          if (final) {
            entries[file.name] = joinChunks(chunks);
            resolve();
          }
        };

        try {
          file.start();
        } catch {
          failure = new Error("Backup contains a damaged ZIP entry.");
          resolve();
        }
      }),
    );
  });

  unzipper.register(AsyncUnzipInflate);
  const reader = backup.stream().getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        unzipper.push(value, done);
      }
      if (done || failure) {
        if (failure) await reader.cancel();
        break;
      }
    }
  } catch {
    failure ??= new Error("This file is not a readable Kage Reader backup.");
  } finally {
    reader.releaseLock();
  }

  await Promise.all(entryTasks);
  if (failure) throw failure;
  return entries;
}

function parseManifest(bytes: Uint8Array): BackupManifest {
  const parsed: unknown = JSON.parse(strFromU8(bytes));
  if (!isObject(parsed) || !isObject(parsed.records)) {
    throw new Error("Backup manifest is invalid.");
  }

  const records = parsed.records;
  const validArrays =
    Array.isArray(records.series) &&
    records.series.every(isSeries) &&
    Array.isArray(records.chapters) &&
    records.chapters.every(isChapter) &&
    Array.isArray(records.pages) &&
    records.pages.every(isPage) &&
    Array.isArray(records.progress) &&
    records.progress.every(isProgress) &&
    Array.isArray(records.bookmarks) &&
    records.bookmarks.every(isBookmark);
  if (
    parsed.format !== BACKUP_FORMAT ||
    parsed.version !== BACKUP_VERSION ||
    !Number.isInteger(parsed.appSchemaVersion) ||
    (parsed.appSchemaVersion as number) > SCHEMA_VERSION ||
    !hasFiniteNumber(parsed, "createdAt") ||
    !validArrays ||
    !Array.isArray(parsed.blobs) ||
    !isObject(parsed.preferences) ||
    !isReaderMode(parsed.preferences.defaultReaderMode) ||
    !Number.isFinite(parsed.preferences.textScale) ||
    typeof parsed.preferences.highContrast !== "boolean"
  ) {
    throw new Error("Backup format is unsupported or invalid.");
  }

  const series = records.series as Series[];
  const chapters = records.chapters as Chapter[];
  const pages = records.pages as Page[];
  const progress = records.progress as Progress[];
  const bookmarks = records.bookmarks as Bookmark[];
  const seriesIds = new Set(series.map((record) => record.id));
  const chapterById = new Map(chapters.map((record) => [record.id, record]));
  const pageStorageKeys = new Set(pages.map((record) => record.storageKey));
  const coverStorageKeys = new Set(
    series
      .map((record) => record.coverPageKey)
      .filter((key): key is string => Boolean(key)),
  );
  const validStorageKeys = new Set([...pageStorageKeys, ...coverStorageKeys]);
  const pageCounts = new Map<string, number>();
  for (const page of pages) {
    pageCounts.set(page.chapterId, (pageCounts.get(page.chapterId) ?? 0) + 1);
  }

  if (
    !hasUniqueIds(series, (record) => record.id) ||
    !hasUniqueIds(chapters, (record) => record.id) ||
    !hasUniqueIds(pages, (record) => record.id) ||
    !hasUniqueIds(pages, (record) => record.storageKey) ||
    !hasUniqueIds(pages, (record) => `${record.chapterId}:${record.index}`) ||
    !hasUniqueIds(progress, (record) => record.chapterId) ||
    !hasUniqueIds(bookmarks, (record) => record.chapterId) ||
    chapters.some((record) => !seriesIds.has(record.seriesId)) ||
    pages.some((record) => {
      const chapter = chapterById.get(record.chapterId);
      return !chapter || record.index >= chapter.pageCount;
    }) ||
    chapters.some(
      (record) => (pageCounts.get(record.id) ?? 0) !== record.pageCount,
    ) ||
    progress.some((record) => {
      const chapter = chapterById.get(record.chapterId);
      return !chapter || record.pageIndex >= chapter.pageCount;
    }) ||
    bookmarks.some((record) => {
      const chapter = chapterById.get(record.chapterId);
      return !chapter || record.pageIndex >= chapter.pageCount;
    })
  ) {
    throw new Error("Backup contains inconsistent library records.");
  }

  const blobs = parsed.blobs as unknown[];
  if (
    blobs.length !== validStorageKeys.size ||
    !blobs.every(
      (blob) => isBackupBlob(blob) && validStorageKeys.has(blob.storageKey),
    ) ||
    !hasUniqueIds(blobs as BackupBlob[], (blob) => blob.storageKey) ||
    !hasUniqueIds(blobs as BackupBlob[], (blob) => blob.entry)
  ) {
    throw new Error("Backup page data is incomplete or invalid.");
  }

  return parsed as unknown as BackupManifest;
}

export async function createLibraryBackup(): Promise<Blob> {
  const [series, chapters, progress, bookmarks] = await Promise.all([
    listSeries(),
    listAllChapters(),
    listProgress(),
    listBookmarks(),
  ]);
  const pagesByChapter = await Promise.all(
    chapters.map((chapter) => listPages(chapter.id)),
  );
  const pages = pagesByChapter.flat();
  const pageStorageKeys = new Set(pages.map((page) => page.storageKey));
  const customCoverKeys = series
    .map((record) => record.coverPageKey)
    .filter(
      (key): key is string => key !== undefined && !pageStorageKeys.has(key),
    );
  const storageKeys = [
    ...pages.map((page) => page.storageKey),
    ...customCoverKeys,
  ];
  const entries: Record<string, Uint8Array> = {};
  const blobs: BackupBlob[] = [];
  let totalBlobBytes = 0;

  for (const [index, storageKey] of storageKeys.entries()) {
    const blob = await getBlob(storageKey);
    if (!blob) {
      throw new Error(`Missing stored page data: ${storageKey}`);
    }
    const entry = `blobs/${index}.bin`;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    totalBlobBytes += bytes.byteLength;
    if (totalBlobBytes > MAX_UNZIPPED_BYTES) {
      throw new Error("Library is too large for a single backup file.");
    }
    entries[entry] = bytes;
    blobs.push({ storageKey, entry, type: blob.type });
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appSchemaVersion: SCHEMA_VERSION,
    createdAt: Date.now(),
    records: { series, chapters, pages, progress, bookmarks },
    blobs,
    preferences: getPreferences(),
  };
  entries["manifest.json"] = strToU8(JSON.stringify(manifest));
  const zipped = zipSync(entries, { level: 0 });
  if (zipped.byteLength > MAX_BACKUP_BYTES) {
    throw new Error("Backup file exceeds the maximum supported size.");
  }
  return new Blob([zipped], { type: "application/zip" });
}

export async function restoreLibraryBackup(
  backup: Blob,
): Promise<BackupRestoreResult> {
  if (backup.size === 0 || backup.size > MAX_BACKUP_BYTES) {
    throw new Error("Backup file is empty or too large.");
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = await unzipBackup(backup);
  } catch {
    throw new Error("This file is not a readable Kage Reader backup.");
  }

  const names = Object.keys(unzipped);
  if (names.length > 100_001 || !unzipped["manifest.json"]) {
    throw new Error("Backup archive is incomplete or exceeds the size limit.");
  }

  let manifest: BackupManifest;
  try {
    manifest = parseManifest(unzipped["manifest.json"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not validate backup: ${message}`);
  }

  const expectedEntries = new Set([
    "manifest.json",
    ...manifest.blobs.map((descriptor) => descriptor.entry),
  ]);
  if (
    names.some((name) => !expectedEntries.has(name)) ||
    names.length !== expectedEntries.size
  ) {
    throw new Error("Backup archive has missing or unreferenced entries.");
  }

  for (const descriptor of manifest.blobs) {
    if (!unzipped[descriptor.entry]) {
      throw new Error(`Backup is missing page data: ${descriptor.storageKey}`);
    }
  }

  for (const descriptor of manifest.blobs) {
    await saveBlob(
      descriptor.storageKey,
      new Blob([unzipped[descriptor.entry]], { type: descriptor.type }),
    );
  }
  for (const record of manifest.records.series) await putSeries(record);
  for (const record of manifest.records.chapters) await putChapter(record);
  for (const record of manifest.records.pages) await putPage(record);
  for (const record of manifest.records.progress) await putProgress(record);
  for (const record of manifest.records.bookmarks) await putBookmark(record);
  savePreferences(manifest.preferences);

  return {
    seriesCount: manifest.records.series.length,
    chapterCount: manifest.records.chapters.length,
    pageCount: manifest.records.pages.length,
  };
}
