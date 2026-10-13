import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  SCHEMA_VERSION,
  type Chapter,
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
      },
    }).then(async (db) => {
      const existing = await db.get("meta", "singleton");
      if (!existing) {
        await db.put("meta", { schemaVersion: SCHEMA_VERSION }, "singleton");
      } else if (existing.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(
          `Unsupported schema ${existing.schemaVersion}; expected ${SCHEMA_VERSION}. Add a migration.`,
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

function rehydrateFallbackBlob(bytes: ArrayBuffer, type: string): Blob {
  const blobPrototype = Blob.prototype as Blob & {
    text?: unknown;
    arrayBuffer?: unknown;
  };

  if (
    typeof blobPrototype.text === "function" &&
    typeof blobPrototype.arrayBuffer === "function"
  ) {
    return {
      size: bytes.byteLength,
      type,
      async text() {
        const textDecoder = new TextDecoder();
        return textDecoder.decode(bytes);
      },
      async arrayBuffer() {
        return bytes;
      },
      slice(start?: number, end?: number, contentType = type) {
        return rehydrateFallbackBlob(bytes.slice(start, end), contentType);
      },
      stream() {
        return new Response(bytes).body ?? new ReadableStream();
      },
      get [Symbol.toStringTag]() {
        return "Blob";
      },
    } as unknown as Blob;
  }

  const textDecoder = new TextDecoder();
  const buffer = bytes.slice(0);

  return {
    size: buffer.byteLength,
    type,
    async text() {
      return textDecoder.decode(buffer.slice(0));
    },
    async arrayBuffer() {
      return buffer.slice(0);
    },
    slice(start?: number, end?: number, contentType = type) {
      return rehydrateFallbackBlob(buffer.slice(start, end), contentType);
    },
    stream() {
      return new Response(buffer.slice(0)).body ?? new ReadableStream();
    },
    get [Symbol.toStringTag]() {
      return "Blob";
    },
  } as unknown as Blob;
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

  return rehydrateFallbackBlob(record.blob, record.type);
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

export async function listChapters(seriesId: string): Promise<Chapter[]> {
  const db = await openKageDb();
  const rows = await db.getAllFromIndex("chapters", "by-series", seriesId);
  return rows.sort((a, b) => a.order - b.order || a.addedAt - b.addedAt);
}

export async function listAllChapters(): Promise<Chapter[]> {
  const db = await openKageDb();
  return db.getAll("chapters");
}

export async function deleteChapterRecord(id: string): Promise<void> {
  const db = await openKageDb();
  await db.delete("chapters", id);
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

export async function wipeDatabase(): Promise<void> {
  const db = await openKageDb();
  await Promise.all([
    db.clear("series"),
    db.clear("chapters"),
    db.clear("pages"),
    db.clear("progress"),
    db.clear("blobs"),
  ]);
  await db.put("meta", { schemaVersion: SCHEMA_VERSION }, "singleton");
}
