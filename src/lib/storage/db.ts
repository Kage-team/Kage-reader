import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  SCHEMA_VERSION,
  type Chapter,
  type Bookmark,
  type BookmarkInput,
  type LinkedFolder,
  type Meta,
  type Page,
  type Progress,
  type Series,
} from "./types";

const DB_NAME = "kage-reader";
const OPFS_ROOT = "kage-reader-blobs";

interface KageDB extends DBSchema {
  meta: { key: string; value: Meta };
  series: {
    key: string;
    value: Series;
    indexes: { "by-updated": number; "by-title": string };
  };
  chapters: {
    key: string;
    value: Chapter;
    indexes: { "by-series": string; "by-hash": string };
  };
  pages: {
    key: string;
    value: Page;
    indexes: { "by-chapter": string };
  };
  progress: { key: string; value: Progress };
  bookmarks: { key: string; value: BookmarkInput };
  readerBookmarks: {
    key: string;
    value: Bookmark;
    indexes: { "by-chapter": string };
  };
  folderLinks: { key: string; value: LinkedFolder };
  blobs: {
    key: string;
    value: { key: string; blob: ArrayBuffer; type: string };
  };
}

let dbPromise: Promise<IDBPDatabase<KageDB>> | null = null;
let opfsDirectoryPromise: Promise<FileSystemDirectoryHandle | null> | null =
  null;

export function openKageDb(): Promise<IDBPDatabase<KageDB>> {
  if (!dbPromise) {
    dbPromise = openDB<KageDB>(DB_NAME, SCHEMA_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("meta");
          const series = db.createObjectStore("series", { keyPath: "id" });
          series.createIndex("by-updated", "updatedAt");
          series.createIndex("by-title", "title");
          const chapters = db.createObjectStore("chapters", { keyPath: "id" });
          chapters.createIndex("by-series", "seriesId");
          chapters.createIndex("by-hash", "hash");
          const pages = db.createObjectStore("pages", { keyPath: "id" });
          pages.createIndex("by-chapter", "chapterId");
          db.createObjectStore("progress", { keyPath: "chapterId" });
          db.createObjectStore("blobs", { keyPath: "key" });
        }
        if (oldVersion < 2) {
          db.createObjectStore("bookmarks", { keyPath: "chapterId" });
        }
        if (oldVersion < 3) {
          const readerBookmarks = db.createObjectStore("readerBookmarks", {
            keyPath: "id",
          });
          readerBookmarks.createIndex("by-chapter", "chapterId");
        }
        if (oldVersion < 4) {
          db.createObjectStore("folderLinks", { keyPath: "id" });
        }
      },
    }).then(async (db) => {
      const legacyBookmarks = await db.getAll("bookmarks");
      for (const legacyBookmark of legacyBookmarks) {
        const id = `legacy:${legacyBookmark.chapterId}`;
        if (!(await db.get("readerBookmarks", id))) {
          await db.put("readerBookmarks", {
            ...legacyBookmark,
            id,
            note: "",
            schemaVersion: SCHEMA_VERSION,
          });
        }
      }

      const existing = await db.get("meta", "singleton");
      if (!existing) {
        await db.put("meta", { schemaVersion: SCHEMA_VERSION }, "singleton");
      } else if (existing.schemaVersion > SCHEMA_VERSION) {
        throw new Error(
          `Unsupported schema ${existing.schemaVersion}; current schema is ${SCHEMA_VERSION}.`,
        );
      } else if (existing.schemaVersion < SCHEMA_VERSION) {
        await db.put(
          "meta",
          { ...existing, schemaVersion: SCHEMA_VERSION },
          "singleton",
        );
      }
      return db;
    });
  }
  return dbPromise;
}

/** Test-only: drop the cached connection. */
export function resetDbCache(): void {
  dbPromise = null;
  opfsDirectoryPromise = null;
}

type NavigatorWithStorage = Navigator & {
  storage?: {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  };
};

function getBlobFileName(key: string): string {
  return encodeURIComponent(key);
}

async function getOpfsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const storage = (globalThis.navigator as NavigatorWithStorage | undefined)
    ?.storage;
  if (!storage?.getDirectory) {
    return null;
  }

  if (!opfsDirectoryPromise) {
    opfsDirectoryPromise = storage.getDirectory().catch(() => null);
  }

  return opfsDirectoryPromise;
}

async function writeBlobToOpfs(key: string, blob: Blob): Promise<boolean> {
  const root = await getOpfsDirectory();
  if (!root) {
    return false;
  }

  try {
    const directory = await root.getDirectoryHandle(OPFS_ROOT, {
      create: true,
    });
    const fileHandle = await directory.getFileHandle(getBlobFileName(key), {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

async function readBlobFromOpfs(key: string): Promise<Blob | undefined> {
  const root = await getOpfsDirectory();
  if (!root) {
    return undefined;
  }

  try {
    const directory = await root.getDirectoryHandle(OPFS_ROOT);
    const fileHandle = await directory.getFileHandle(getBlobFileName(key));
    return await fileHandle.getFile();
  } catch {
    return undefined;
  }
}

async function deleteBlobFromOpfs(key: string): Promise<void> {
  const root = await getOpfsDirectory();
  if (!root) {
    return;
  }

  try {
    const directory = await root.getDirectoryHandle(OPFS_ROOT);
    await directory.removeEntry(getBlobFileName(key));
  } catch {
    // Ignore missing files and unsupported environments.
  }
}

export async function getMeta(): Promise<Meta> {
  const db = await openKageDb();
  const meta = await db.get("meta", "singleton");
  return meta ?? { schemaVersion: SCHEMA_VERSION };
}

export async function putMeta(meta: Meta): Promise<void> {
  const db = await openKageDb();
  await db.put("meta", { ...meta, schemaVersion: SCHEMA_VERSION }, "singleton");
}

export async function saveBlob(key: string, blob: Blob): Promise<void> {
  const storedInOpfs = await writeBlobToOpfs(key, blob);
  const db = await openKageDb();

  if (storedInOpfs) {
    await db.delete("blobs", key);
    return;
  }

  const bytes = await new Response(blob).arrayBuffer();
  await db.put("blobs", { key, blob: bytes, type: blob.type });
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const opfsBlob = await readBlobFromOpfs(key);
  if (opfsBlob) {
    return opfsBlob;
  }

  const db = await openKageDb();
  const record = await db.get("blobs", key);
  if (!record) {
    return undefined;
  }

  return new Blob([record.blob], { type: record.type });
}

export async function deleteBlob(key: string): Promise<void> {
  await deleteBlobFromOpfs(key);
  const db = await openKageDb();
  await db.delete("blobs", key);
}

export async function putSeries(series: Series): Promise<void> {
  const db = await openKageDb();
  await db.put("series", { ...series, schemaVersion: SCHEMA_VERSION });
}

export async function getSeries(id: string): Promise<Series | undefined> {
  const db = await openKageDb();
  return db.get("series", id);
}

export async function listSeries(): Promise<Series[]> {
  const db = await openKageDb();
  return db.getAll("series");
}

export async function deleteSeriesRecord(id: string): Promise<void> {
  const db = await openKageDb();
  await db.delete("series", id);
}

export async function deleteSeriesWithContents(
  seriesId: string,
): Promise<void> {
  const db = await openKageDb();
  const chapters = await db.getAllFromIndex("chapters", "by-series", seriesId);
  const pagesByChapter = await Promise.all(
    chapters.map((chapter) =>
      db.getAllFromIndex("pages", "by-chapter", chapter.id),
    ),
  );
  const pages = pagesByChapter.flat();
  const bookmarksByChapter = await Promise.all(
    chapters.map((chapter) =>
      db.getAllFromIndex("readerBookmarks", "by-chapter", chapter.id),
    ),
  );
  const series = await db.get("series", seriesId);
  const transaction = db.transaction(
    [
      "series",
      "chapters",
      "pages",
      "progress",
      "blobs",
      "bookmarks",
      "readerBookmarks",
    ],
    "readwrite",
  );
  const operations: Promise<unknown>[] = [
    transaction.objectStore("series").delete(seriesId),
  ];

  for (const [index, chapter] of chapters.entries()) {
    operations.push(
      transaction.objectStore("chapters").delete(chapter.id),
      transaction.objectStore("progress").delete(chapter.id),
      transaction.objectStore("bookmarks").delete(chapter.id),
    );
    for (const bookmark of bookmarksByChapter[index]) {
      operations.push(
        transaction.objectStore("readerBookmarks").delete(bookmark.id),
      );
    }
  }
  for (const page of pages) {
    operations.push(
      transaction.objectStore("pages").delete(page.id),
      transaction.objectStore("blobs").delete(page.storageKey),
    );
  }

  await Promise.all(operations);
  await transaction.done;
  await Promise.all(pages.map((page) => deleteBlobFromOpfs(page.storageKey)));
  if (
    series?.coverPageKey &&
    !pages.some((page) => page.storageKey === series.coverPageKey)
  ) {
    await deleteBlob(series.coverPageKey);
  }
}

export async function putChapter(chapter: Chapter): Promise<void> {
  const db = await openKageDb();
  await db.put("chapters", { ...chapter, schemaVersion: SCHEMA_VERSION });
}

export async function getChapter(id: string): Promise<Chapter | undefined> {
  const db = await openKageDb();
  return db.get("chapters", id);
}

export async function getChapterByHash(
  hash: string,
): Promise<Chapter | undefined> {
  const db = await openKageDb();
  return db.getFromIndex("chapters", "by-hash", hash);
}

function getChapterReadingPosition(chapter: Chapter): {
  volume: number;
  category: number;
  number?: number;
} {
  const title = `${chapter.title} ${chapter.sourceName}`.toLocaleLowerCase();
  const chapterMatches = Array.from(
    chapter.sourceName.matchAll(
      /(?:^|[^a-z0-9])(?:chapter|chap|ch|episode|ep|c)\s*[._#-]*0*(\d+(?:\.\d+)?)(?=$|[^0-9])/gi,
    ),
  );
  const titleChapterMatch = chapter.title.match(
    /\b(?:chapter|chap|ch|episode|ep|c)\s*[._#-]*0*(\d+(?:\.\d+)?)/i,
  );
  const chapterNumber =
    chapter.number ??
    (chapterMatches.length > 0
      ? Number(chapterMatches[chapterMatches.length - 1]?.[1])
      : titleChapterMatch?.[1]
        ? Number(titleChapterMatch[1])
        : undefined);
  const number =
    chapterNumber !== undefined && Number.isFinite(chapterNumber)
      ? chapterNumber
      : undefined;
  const volumeMatches = Array.from(
    chapter.sourceName.matchAll(
      /(?:^|[^a-z0-9])(?:volume|vol|v)\s*[._#-]*0*(\d+(?:\.\d+)?)(?=$|[^0-9])/gi,
    ),
  );
  const parsedVolume = volumeMatches.length
    ? Number(volumeMatches[volumeMatches.length - 1]?.[1])
    : undefined;
  const volume = chapter.volume ?? parsedVolume;

  return {
    volume: volume !== undefined && Number.isFinite(volume) ? volume : 1,
    category: /\b(prologue|prelude)\b/i.test(title)
      ? 0
      : /\b(epilogue|afterword)\b/i.test(title)
        ? 3
        : number !== undefined
          ? 1
          : 2,
    number,
  };
}

function compareChaptersForReading(left: Chapter, right: Chapter): number {
  const leftPosition = getChapterReadingPosition(left);
  const rightPosition = getChapterReadingPosition(right);
  return (
    leftPosition.volume - rightPosition.volume ||
    leftPosition.category - rightPosition.category ||
    (leftPosition.number ?? 0) - (rightPosition.number ?? 0) ||
    left.order - right.order ||
    left.addedAt - right.addedAt ||
    left.title.localeCompare(right.title)
  );
}

export async function listChapters(seriesId: string): Promise<Chapter[]> {
  const db = await openKageDb();
  const rows = await db.getAllFromIndex("chapters", "by-series", seriesId);
  return rows.sort(compareChaptersForReading);
}

export async function listAllChapters(): Promise<Chapter[]> {
  const db = await openKageDb();
  return db.getAll("chapters");
}

export async function deleteChapterRecord(id: string): Promise<void> {
  const db = await openKageDb();
  await db.delete("chapters", id);
}

export async function deleteChapterWithContents(id: string): Promise<void> {
  const db = await openKageDb();
  const chapter = await db.get("chapters", id);
  if (!chapter) return;

  const pages = await db.getAllFromIndex("pages", "by-chapter", id);
  const bookmarks = await db.getAllFromIndex(
    "readerBookmarks",
    "by-chapter",
    id,
  );
  const series = await db.get("series", chapter.seriesId);
  const transaction = db.transaction(
    ["chapters", "pages", "progress", "bookmarks", "readerBookmarks", "blobs"],
    "readwrite",
  );
  const operations: Promise<unknown>[] = [
    transaction.objectStore("chapters").delete(id),
    transaction.objectStore("progress").delete(id),
    transaction.objectStore("bookmarks").delete(id),
    ...bookmarks.map((bookmark) =>
      transaction.objectStore("readerBookmarks").delete(bookmark.id),
    ),
  ];

  for (const page of pages) {
    operations.push(
      transaction.objectStore("pages").delete(page.id),
      transaction.objectStore("blobs").delete(page.storageKey),
    );
  }

  await Promise.all(operations);
  await transaction.done;
  await Promise.all(pages.map((page) => deleteBlobFromOpfs(page.storageKey)));

  if (
    series?.coverPageKey &&
    pages.some((page) => page.storageKey === series.coverPageKey)
  ) {
    await putSeries({
      ...series,
      coverPageKey: undefined,
      updatedAt: Date.now(),
    });
  }
}

export async function putPage(page: Page): Promise<void> {
  const db = await openKageDb();
  await db.put("pages", { ...page, schemaVersion: SCHEMA_VERSION });
}

export async function listPages(chapterId: string): Promise<Page[]> {
  const db = await openKageDb();
  const rows = await db.getAllFromIndex("pages", "by-chapter", chapterId);
  return rows.sort((a, b) => a.index - b.index);
}

export async function listAllPages(): Promise<Page[]> {
  const db = await openKageDb();
  return db.getAll("pages");
}

export async function deletePageRecord(id: string): Promise<void> {
  const db = await openKageDb();
  await db.delete("pages", id);
}

export async function putProgress(progress: Progress): Promise<void> {
  const db = await openKageDb();
  await db.put("progress", { ...progress, schemaVersion: SCHEMA_VERSION });
}

export async function getProgress(
  chapterId: string,
): Promise<Progress | undefined> {
  const db = await openKageDb();
  return db.get("progress", chapterId);
}

export async function listProgress(): Promise<Progress[]> {
  const db = await openKageDb();
  return db.getAll("progress");
}

export async function deleteProgress(chapterId: string): Promise<void> {
  const db = await openKageDb();
  await db.delete("progress", chapterId);
}

export async function putBookmark(bookmark: BookmarkInput): Promise<Bookmark> {
  const db = await openKageDb();
  const record: Bookmark = {
    ...bookmark,
    id: bookmark.id ?? globalThis.crypto.randomUUID(),
    note: bookmark.note ?? "",
    schemaVersion: SCHEMA_VERSION,
  };
  await db.put("readerBookmarks", record);
  return record;
}

export async function getBookmark(
  chapterId: string,
): Promise<Bookmark | undefined> {
  const db = await openKageDb();
  const bookmarks = await db.getAllFromIndex(
    "readerBookmarks",
    "by-chapter",
    chapterId,
  );
  return bookmarks.sort((left, right) => left.createdAt - right.createdAt)[0];
}

export async function getBookmarksForChapter(
  chapterId: string,
): Promise<Bookmark[]> {
  const db = await openKageDb();
  return db.getAllFromIndex("readerBookmarks", "by-chapter", chapterId);
}

export async function listBookmarks(): Promise<Bookmark[]> {
  const db = await openKageDb();
  return db.getAll("readerBookmarks");
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await openKageDb();
  await db.delete("readerBookmarks", id);
}

export async function getLinkedFolder(): Promise<LinkedFolder | undefined> {
  const db = await openKageDb();
  return db.get("folderLinks", "primary");
}

export async function putLinkedFolder(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openKageDb();
  await db.put("folderLinks", {
    id: "primary",
    handle,
    linkedAt: Date.now(),
  });
}

export async function deleteLinkedFolder(): Promise<void> {
  const db = await openKageDb();
  await db.delete("folderLinks", "primary");
}

export async function clearLibraryData(): Promise<void> {
  const db = await openKageDb();
  const transaction = db.transaction(
    [
      "series",
      "chapters",
      "pages",
      "progress",
      "bookmarks",
      "readerBookmarks",
      "folderLinks",
      "blobs",
    ],
    "readwrite",
  );
  await Promise.all([
    transaction.objectStore("series").clear(),
    transaction.objectStore("chapters").clear(),
    transaction.objectStore("pages").clear(),
    transaction.objectStore("progress").clear(),
    transaction.objectStore("bookmarks").clear(),
    transaction.objectStore("readerBookmarks").clear(),
    transaction.objectStore("folderLinks").clear(),
    transaction.objectStore("blobs").clear(),
  ]);
  await transaction.done;

  const root = await getOpfsDirectory();
  if (root) {
    try {
      await root.removeEntry(OPFS_ROOT, { recursive: true });
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") {
        throw error;
      }
    }
  }
}

export async function wipeDatabase(): Promise<void> {
  const db = await openKageDb();
  await Promise.all([
    db.clear("series"),
    db.clear("chapters"),
    db.clear("pages"),
    db.clear("progress"),
    db.clear("blobs"),
    db.clear("bookmarks"),
    db.clear("readerBookmarks"),
    db.clear("folderLinks"),
  ]);
  await db.put("meta", { schemaVersion: SCHEMA_VERSION }, "singleton");
}
