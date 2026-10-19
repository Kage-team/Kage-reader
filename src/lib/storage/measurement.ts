import { listAllChapters, listAllPages, listBookmarks, listProgress, listSeries, getBlob } from "./db";

export type StorageBreakdown = {
  metadataBytes: number;
  pageBytes: number;
  coverBytes: number;
  bookmarkBytes: number;
  progressBytes: number;
  backupBytes: number;
};

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export async function measureStorageBreakdown(lastBackupBytes = 0): Promise<StorageBreakdown> {
  const [series, chapters, pages, bookmarks, progress] = await Promise.all([
    listSeries(), listAllChapters(), listAllPages(), listBookmarks(), listProgress(),
  ]);
  const blobSizes = await Promise.all(pages.map(async (page) => (await getBlob(page.storageKey))?.size ?? 0));
  const covers = new Set(series.map((item) => item.coverPageKey).filter((key): key is string => Boolean(key)));
  const coverSizes = await Promise.all([...covers].map(async (key) => (await getBlob(key))?.size ?? 0));
  return {
    metadataBytes: jsonBytes(series) + jsonBytes(chapters),
    pageBytes: blobSizes.reduce((sum, size) => sum + size, 0),
    coverBytes: coverSizes.reduce((sum, size) => sum + size, 0),
    bookmarkBytes: jsonBytes(bookmarks),
    progressBytes: jsonBytes(progress),
    backupBytes: lastBackupBytes,
  };
}
