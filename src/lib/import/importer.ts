import {
  getChapterByHash,
  getSeries,
  putChapter,
  putPage,
  putSeries,
  saveBlob,
} from "../storage/db";
import type { Chapter, Page, Series } from "../storage/types";
import { hashBlobSignature } from "./hash";
import { parseComicInfoXml } from "./comicInfo";
import {
  deriveSeriesId,
  deriveSeriesTitle,
  groupArchiveEntries,
} from "./grouping";
import { extractArchiveBundleInWorker } from "./worker-client";
import type {
  ArchiveSource,
  ImportProgressEvent,
  ImportRunResult,
  ImportedChapterSummary,
} from "./types";

async function saveArchiveAsChapter(
  source: ArchiveSource,
): Promise<ImportedChapterSummary> {
  const bundle = await extractArchiveBundleInWorker(source);
  const comicInfo = bundle.comicInfoXml
    ? parseComicInfoXml(bundle.comicInfoXml)
    : { tags: [] };
  const imageEntries = bundle.entries.filter((entry) =>
    entry.mime.startsWith("image/"),
  );
  const chapterGroups = groupArchiveEntries(bundle.entries);
  const seriesTitle = deriveSeriesTitle(source.name, comicInfo);
  const seriesId = deriveSeriesId(source.name, comicInfo);
  const now = Date.now();
  let coverPageKey: string | undefined;
  const importedSummaries: ImportedChapterSummary[] = [];
  const existingSeries = await getSeries(seriesId);
  let series: Series = existingSeries ?? {
    schemaVersion: 1,
    id: seriesId,
    title: seriesTitle,
    type: "manga",
    addedAt: now,
    updatedAt: now,
  };

  for (const [order, chapterGroup] of chapterGroups.entries()) {
    const chapterBlob = new Blob(
      chapterGroup.entries.map((entry) => entry.blob),
    );
    const chapterHash = await hashBlobSignature(chapterBlob);
    const existingChapter = await getChapterByHash(chapterHash);
    if (existingChapter) {
      continue;
    }

    const chapterId = `chapter:${chapterHash}`;
    const pageRecords: Page[] = [];
    for (const [index, entry] of chapterGroup.entries.entries()) {
      const storageKey = `${chapterId}/${index}`;
      await saveBlob(storageKey, entry.blob);
      pageRecords.push({
        schemaVersion: 1,
        id: crypto.randomUUID(),
        chapterId,
        index,
        storageKey,
        mime: entry.mime,
      });
    }

    await Promise.all(pageRecords.map((page) => putPage(page)));

    const chapter: Chapter = {
      schemaVersion: 1,
      id: chapterId,
      seriesId,
      title:
        chapterGroups.length === 1
          ? comicInfo.title?.trim() || chapterGroup.title || seriesTitle
          : chapterGroup.title || comicInfo.title?.trim() || seriesTitle,
      order,
      pageCount: chapterGroup.entries.length,
      sourceName: source.name,
      hash: chapterHash,
      addedAt: now,
    };

    await putChapter(chapter);
    importedSummaries.push({
      id: chapterId,
      title: chapter.title,
      pageCount: chapter.pageCount,
      sourceName: source.name,
    });

    if (!coverPageKey) {
      const coverEntry =
        comicInfo.coverPageIndex !== undefined
          ? imageEntries[comicInfo.coverPageIndex]
          : chapterGroup.entries[0];
      if (coverEntry) {
        const pageIndex = chapterGroup.entries.findIndex(
          (entry) => entry.name === coverEntry.name,
        );
        if (pageIndex >= 0) {
          coverPageKey = `${chapterId}/${pageIndex}`;
        }
      }
    }
  }

  const existingSeriesType = existingSeries?.type ?? "manga";
  const existingTags = existingSeries?.tags ?? [];
  const tags = Array.from(
    new Set([...(comicInfo.tags ?? []), ...existingTags]),
  );

  series = {
    ...series,
    schemaVersion: 1,
    title: seriesTitle,
    type: existingSeriesType,
    coverPageKey: coverPageKey ?? series.coverPageKey,
    ageRating: comicInfo.ageRating ?? series.ageRating,
    writer: comicInfo.writer ?? series.writer,
    tags: tags.length > 0 ? tags : undefined,
    updatedAt: now,
  };

  await putSeries(series);

  if (importedSummaries.length === 0) {
    return {
      id: seriesId,
      title: seriesTitle,
      pageCount: 0,
      sourceName: source.name,
    };
  }

  return {
    id: seriesId,
    title: seriesTitle,
    pageCount: importedSummaries.reduce(
      (total, summary) => total + summary.pageCount,
      0,
    ),
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
      if (summary.pageCount > 0) {
        imported.push(summary);
      }
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
