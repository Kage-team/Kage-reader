import { putChapter, putPage, putSeries, saveBlob } from "../storage/db";
import type { Chapter, Page, Series } from "../storage/types";
import { naturalSort } from "./naturalSort";
import { extractArchiveEntriesInWorker } from "./worker-client";
import type {
  ArchiveSource,
  ImportProgressEvent,
  ImportRunResult,
  ImportedChapterSummary,
} from "./types";

const SOURCE_ENTRY_SIZE = 64 * 1024;

function stripArchiveExtension(name: string): string {
  return name.replace(/\.(cbz|zip)$/i, "");
}

function toSeriesTitle(sourceName: string): string {
  const stripped = stripArchiveExtension(sourceName);
  return (
    stripped.slice(stripped.lastIndexOf("/") + 1) || stripped || sourceName
  );
}

async function hashArchiveSource(source: ArchiveSource): Promise<string> {
  const size = source.blob.size;
  const head = new Uint8Array(
    await source.blob.slice(0, SOURCE_ENTRY_SIZE).arrayBuffer(),
  );
  const tailStart = Math.max(0, size - SOURCE_ENTRY_SIZE);
  const tail = new Uint8Array(await source.blob.slice(tailStart).arrayBuffer());
  const meta = new TextEncoder().encode(`${source.name}:${size}:`);

  const combined = new Uint8Array(meta.length + head.length + tail.length);
  combined.set(meta, 0);
  combined.set(head, meta.length);
  combined.set(tail, meta.length + head.length);

  const digest = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function saveArchiveAsChapter(
  source: ArchiveSource,
): Promise<ImportedChapterSummary> {
  const entries = await extractArchiveEntriesInWorker(source);
  const sortedEntries = [...entries].sort((left, right) =>
    naturalSort(left.name, right.name),
  );

  const seriesId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  const chapterHash = await hashArchiveSource(source);
  const now = Date.now();
  let coverPageKey = "";

  const pageRecords: Page[] = [];
  for (const [index, entry] of sortedEntries.entries()) {
    const storageKey = `${chapterId}/${index}`;
    await saveBlob(storageKey, entry.blob);
    if (!coverPageKey) {
      coverPageKey = storageKey;
    }

    pageRecords.push({
      schemaVersion: 1,
      id: crypto.randomUUID(),
      chapterId,
      index,
      storageKey,
      mime: entry.mime,
    });
  }

  const chapter: Chapter = {
    schemaVersion: 1,
    id: chapterId,
    seriesId,
    title: toSeriesTitle(source.name),
    order: 0,
    pageCount: sortedEntries.length,
    sourceName: source.name,
    hash: chapterHash,
    addedAt: now,
  };

  await Promise.all(pageRecords.map((page) => putPage(page)));

  const series: Series = {
    schemaVersion: 1,
    id: seriesId,
    title: toSeriesTitle(source.name),
    type: "manga",
    coverPageKey: coverPageKey || undefined,
    addedAt: now,
    updatedAt: now,
  };

  await putSeries(series);
  await putChapter(chapter);

  return {
    id: chapterId,
    title: chapter.title,
    pageCount: chapter.pageCount,
    sourceName: source.name,
  };
}

function isSupportedArchiveName(name: string): boolean {
  return /\.(cbz|zip)$/i.test(name);
}

export async function importArchiveSources(
  sources: ArchiveSource[],
  onProgress?: (event: ImportProgressEvent) => void,
): Promise<ImportRunResult> {
  const imported: ImportedChapterSummary[] = [];
  const errors: string[] = [];

  for (const [index, source] of sources.entries()) {
    const progressBase = {
      fileName: source.name,
      index: index + 1,
      total: sources.length,
    };

    if (!isSupportedArchiveName(source.name)) {
      const message = `Unsupported file: ${source.name}`;
      errors.push(message);
      onProgress?.({ ...progressBase, state: "error", message });
      continue;
    }

    onProgress?.({ ...progressBase, state: "working" });

    try {
      const summary = await saveArchiveAsChapter(source);
      imported.push(summary);
      onProgress?.({
        ...progressBase,
        state: "saved",
        pageCount: summary.pageCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      onProgress?.({ ...progressBase, state: "error", message });
    }
  }

  return { imported, errors };
}
