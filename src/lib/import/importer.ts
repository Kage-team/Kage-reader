import {
  getChapterByHash,
  getSeries,
  listChapters,
  listPages,
  deleteChapterWithContents,
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
import { packageLooseImageSources } from "./looseImages";
import { naturalSort } from "./naturalSort";
import type {
  ArchiveSource,
  ImportControl,
  ImportProgressEvent,
  ImportRunResult,
  ImportedChapterSummary,
} from "./types";

async function saveArchiveAsChapter(
  source: ArchiveSource,
  targetSeriesId?: string,
  reportStage?: (message: string, progress?: number) => void,
): Promise<ImportedChapterSummary> {
  const bundle = await extractArchiveBundleInWorker(source, (message) =>
    reportStage?.(message, 2),
  );
  reportStage?.(`Read ${bundle.entries.length} files; detecting chapters…`, 8);
  const comicInfo = bundle.comicInfoXml
    ? parseComicInfoXml(bundle.comicInfoXml)
    : { tags: [] };
  const isNovelArchive =
    /\.epub$/i.test(source.name) ||
    bundle.entries.some((entry) =>
      /\.(xhtml|html|htm|xml|txt|md)$/i.test(entry.name),
    );
  const imageEntries = bundle.entries.filter((entry) =>
    entry.mime.startsWith("image/"),
  );
  const preferredCoverEntry = bundle.coverImageName
    ? imageEntries.find((entry) => entry.name === bundle.coverImageName)
    : undefined;
  const chapterGroups = groupArchiveEntries(bundle.entries, isNovelArchive);
  const derivedSeriesTitle = deriveSeriesTitle(source.name, comicInfo);
  const seriesId = targetSeriesId ?? deriveSeriesId(source.name, comicInfo);
  const now = Date.now();
  let coverPageKey: string | undefined;
  const importedSummaries: ImportedChapterSummary[] = [];
  const existingSeries = await getSeries(seriesId);
  if (targetSeriesId && !existingSeries) {
    throw new Error("The selected series no longer exists.");
  }
  const seriesTitle = targetSeriesId
    ? (existingSeries?.title ?? derivedSeriesTitle)
    : derivedSeriesTitle;
  const existingChapters = await listChapters(seriesId);
  const previousSourceChapters = existingChapters.filter(
    (chapter) => chapter.sourceName === source.name,
  );
  const mayReplaceMergedChapter =
    chapterGroups.length > 1 && previousSourceChapters.length === 1;
  const orderBase = mayReplaceMergedChapter
    ? existingChapters.filter((chapter) => chapter.sourceName !== source.name)
    : existingChapters;
  let nextChapterOrder =
    orderBase.reduce(
      (highestOrder, chapter) => Math.max(highestOrder, chapter.order),
      -1,
    ) + 1;
  const retainedExistingIds = new Set<string>();
  let series: Series = existingSeries ?? {
    schemaVersion: 1,
    id: seriesId,
    title: seriesTitle,
    type: isNovelArchive ? "novel" : "manga",
    addedAt: now,
    updatedAt: now,
  };

  for (const [groupIndex, chapterGroup] of chapterGroups.entries()) {
    const groupProgressStart =
      10 + (84 * groupIndex) / Math.max(chapterGroups.length, 1);
    const groupProgressSpan = 84 / Math.max(chapterGroups.length, 1);
    reportStage?.(
      `Preparing chapter ${groupIndex + 1} of ${chapterGroups.length}: ${chapterGroup.title}`,
      Math.round(groupProgressStart),
    );
    const chapterBlob = new Blob(
      chapterGroup.entries.map((entry) => entry.blob),
    );
    const chapterHash = await hashBlobSignature(chapterBlob);
    const existingChapter = await getChapterByHash(chapterHash);
    if (existingChapter) {
      if (existingChapter.seriesId === seriesId) {
        retainedExistingIds.add(existingChapter.id);
      }
      continue;
    }

    const chapterId = `chapter:${chapterHash}`;
    const pageRecords: Page[] = [];
    for (const [index, entry] of chapterGroup.entries.entries()) {
      if (
        index === 0 ||
        (index + 1) % 10 === 0 ||
        index === chapterGroup.entries.length - 1
      ) {
        reportStage?.(
          `Saving chapter ${groupIndex + 1}/${chapterGroups.length} · page ${index + 1}/${chapterGroup.entries.length}`,
          Math.round(
            groupProgressStart +
              (groupProgressSpan * (index + 1)) /
                Math.max(chapterGroup.entries.length, 1),
          ),
        );
      }
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
      number:
        chapterGroup.number ??
        (chapterGroups.length === 1 && comicInfo.number
          ? Number.parseFloat(comicInfo.number) || undefined
          : undefined),
      volume:
        chapterGroup.volume ??
        (chapterGroups.length === 1 ? comicInfo.volume : undefined),
      order: nextChapterOrder++,
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
        (comicInfo.coverPageIndex !== undefined
          ? imageEntries[comicInfo.coverPageIndex]
          : undefined) ??
        preferredCoverEntry ??
        imageEntries[0];
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

  if (importedSummaries.length > 0 && mayReplaceMergedChapter) {
    const obsoleteChapters = previousSourceChapters.filter(
      (chapter) => !retainedExistingIds.has(chapter.id),
    );
    const obsoletePageKeys = new Set<string>();
    for (const obsolete of obsoleteChapters) {
      for (const page of await listPages(obsolete.id)) {
        obsoletePageKeys.add(page.storageKey);
      }
      await deleteChapterWithContents(obsolete.id);
    }
    if (
      obsoleteChapters.length > 0 &&
      series.coverPageKey &&
      obsoletePageKeys.has(series.coverPageKey)
    ) {
      series = { ...series, coverPageKey };
    }
  }

  reportStage?.("Finishing library records…", 98);
  const existingSeriesType =
    existingSeries?.type ?? (isNovelArchive ? "novel" : "manga");
  const existingTags = existingSeries?.tags ?? [];
  const tags = Array.from(
    new Set([...(comicInfo.tags ?? []), ...existingTags]),
  );

  series = {
    ...series,
    schemaVersion: 1,
    title: targetSeriesId
      ? (existingSeries?.title ?? seriesTitle)
      : seriesTitle,
    type: existingSeriesType,
    coverPageKey: targetSeriesId
      ? (series.coverPageKey ?? coverPageKey)
      : (coverPageKey ?? series.coverPageKey),
    ageRating: comicInfo.ageRating ?? series.ageRating,
    writer: comicInfo.writer ?? series.writer,
    summary: comicInfo.summary ?? series.summary,
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
  return /\.(cbz|zip|epub|cbr|rar|7z|cb7|cbt|tar|tgz|gz|bz2|xz|txt|html|htm|xhtml|md)$/i.test(
    name,
  );
}

export async function importArchiveSources(
  sources: ArchiveSource[],
  onProgress?: (event: ImportProgressEvent) => void,
  targetSeriesId?: string,
  control?: ImportControl,
): Promise<ImportRunResult> {
  const imported: ImportedChapterSummary[] = [];
  const errors: string[] = [];
  const normalizedSources = await packageLooseImageSources(sources);
  if (targetSeriesId) {
    normalizedSources.sort((left, right) => naturalSort(left.name, right.name));
  }

  for (const [index, source] of normalizedSources.entries()) {
    await control?.waitUntilResumed?.();
    const progressBase = {
      fileName: source.name,
      index: index + 1,
      total: normalizedSources.length,
    };

    if (control?.signal?.aborted) {
      for (const [cancelledIndex, cancelledSource] of normalizedSources
        .slice(index)
        .entries()) {
        onProgress?.({
          fileName: cancelledSource.name,
          index: index + cancelledIndex + 1,
          total: normalizedSources.length,
          state: "cancelled",
          progress: 100,
          message: "Cancelled before processing.",
        });
      }
      break;
    }

    if (!isSupportedArchiveName(source.name)) {
      const message = `Unsupported file "${source.name}". Supported formats include CBZ, CBR/RAR, ZIP, 7z, TAR, EPUB, and common image files.`;
      errors.push(message);
      onProgress?.({ ...progressBase, state: "error", progress: 100, message });
      continue;
    }

    onProgress?.({
      ...progressBase,
      state: "working",
      progress: 0,
      message: "Opening archive and extracting locally…",
    });

    try {
      const summary = await saveArchiveAsChapter(
        source,
        targetSeriesId,
        (message, progress) =>
          onProgress?.({
            ...progressBase,
            state: "working",
            progress,
            message,
          }),
      );
      if (summary.pageCount > 0) {
        imported.push(summary);
      }
      onProgress?.({
        ...progressBase,
        state: "saved",
        progress: 100,
        pageCount: summary.pageCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      onProgress?.({ ...progressBase, state: "error", progress: 100, message });
    }
  }

  return { imported, errors };
}
