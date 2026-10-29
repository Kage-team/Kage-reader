import {
  getChapterByHash,
  getSeries,
  listChapters,
  listPages,
  deleteChapterWithContents,
  deleteSeriesWithContents,
  putChapter,
  putPage,
  putSeries,
  saveBlob,
} from "../storage/db";
import type { Chapter, Page, Series } from "../storage/types";
import { hashBlobSignature } from "./hash";
import { parseComicInfoXml } from "./comicInfo";
import {
  deriveChapterTitle,
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

function preferDetectedChapterTitle(
  detectedTitle: string | undefined,
  metadataTitle: string | undefined,
  sourceName: string,
): string | undefined {
  const detected = detectedTitle?.trim();
  const metadata = metadataTitle?.trim();
  const isGeneric = (value: string | undefined) =>
    Boolean(
      value &&
      /^(?:chapter|chap|ch|episode|ep|part|issue)\s*[._#-]*0*\d+\b/i.test(
        value,
      ),
    );

  if (!isGeneric(metadata)) return undefined;
  if (detected && !isGeneric(detected)) return detected;

  const sourceHasChapterMarker =
    /(?:^|[\\/\\])(?:chapter|chap|ch|episode|ep|part|issue)\\s*[._#-]*0*\\d+\\b/i.test(
      sourceName,
    );
  if (!sourceHasChapterMarker) return undefined;

  const sourceTitle = deriveChapterTitle("", sourceName).trim();
  return isGeneric(sourceTitle) ? undefined : sourceTitle;
}

function deriveImportedChapterTitle(
  chapterTitle: string | undefined,
  sourceName: string,
): string | undefined {
  const detected = chapterTitle?.trim();
  if (
    detected &&
    !/^(?:chapter|chap|ch|episode|ep|part|issue)\s*[._#-]*0*\d+\b/i.test(
      detected,
    )
  ) {
    return detected;
  }
  const sourceTitle = deriveChapterTitle("", sourceName).trim();
  return /^(?:chapter|chap|ch|episode|ep|part|issue)\s*[._#-]*0*\d+\b/i.test(
    sourceTitle,
  )
    ? undefined
    : sourceTitle || undefined;
}

async function saveArchiveAsChapter(
  source: ArchiveSource,
  targetSeriesId?: string,
  reportStage?: (message: string, progress?: number) => void,
  targetSeriesTitle?: string,
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
  let existingSeries = await getSeries(seriesId);
  if (targetSeriesId && !existingSeries) {
    throw new Error("The selected series no longer exists.");
  }
  const seriesTitle = targetSeriesTitle ?? (targetSeriesId
    ? (existingSeries?.title ?? derivedSeriesTitle)
    : derivedSeriesTitle);
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
  let legacyOneShotSeriesId: string | undefined;
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
      } else if (
        !targetSeriesId &&
        (!existingSeries || existingSeries.id === legacyOneShotSeriesId) &&
        existingChapter.sourceName === source.name
      ) {
        const previousSeries = await getSeries(existingChapter.seriesId);
        if (
          previousSeries &&
          (!legacyOneShotSeriesId ||
            previousSeries.id === legacyOneShotSeriesId) &&
          /^one[\s._-]*shot$/i.test(previousSeries.title.trim())
        ) {
          const previousSeriesId = previousSeries.id;
          legacyOneShotSeriesId = previousSeriesId;
          existingSeries = previousSeries;
          series = {
            ...previousSeries,
            id: seriesId,
            title: seriesTitle,
            updatedAt: now,
          };
          await putChapter({
            ...existingChapter,
            seriesId,
            order: nextChapterOrder++,
          });
          retainedExistingIds.add(existingChapter.id);
          if ((await listChapters(previousSeriesId)).length === 0) {
            await deleteSeriesWithContents(previousSeriesId);
          }
        }
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
        (comicInfo.title?.trim() &&
        !/^(?:chapter|chap|ch|episode|ep|part|issue)\s*[._#-]*0*\d+\b/i.test(
          comicInfo.title.trim(),
        )
          ? comicInfo.title.trim()
          : undefined) ||
        deriveImportedChapterTitle(chapterGroup.title, source.name) ||
        preferDetectedChapterTitle(
          chapterGroup.title,
          comicInfo.title,
          source.name,
        ) ||
        chapterGroup.title ||
        seriesTitle,
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

function archiveSeriesStem(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/\s*(?:issue|chapter|ch\.?|episode|ep\.?|volume|vol\.?)\s*#?\s*\d+.*$/i, "")
    .replace(/[\s._-]+$/, "")
    .trim();
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

  const archiveStemCounts = new Map<string, number>();
  for (const source of normalizedSources) {
    const stem = archiveSeriesStem(source.name);
    archiveStemCounts.set(stem, (archiveStemCounts.get(stem) ?? 0) + 1);
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
      const stem = archiveSeriesStem(source.name);
      const batchSeriesId =
        !targetSeriesId && (archiveStemCounts.get(stem) ?? 0) > 1
          ? deriveSeriesId(`${stem}.cbz`, { tags: [] })
          : undefined;
      const summary = await saveArchiveAsChapter(
        source,
        targetSeriesId ?? batchSeriesId,
        (message, progress) =>
          onProgress?.({
            ...progressBase,
            state: "working",
            progress,
            message,
          }),
        batchSeriesId ? stem : undefined,
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
