import type { Chapter, Progress, Series, SeriesType } from "../storage/types";

export type ResumePoint = {
  chapterId: string;
  chapterTitle: string;
  pageIndex: number;
  pageCount: number;
  updatedAt: number;
};

export type LibraryEntry = {
  id: string;
  title: string;
  type: SeriesType;
  tags: string[];
  ageRating?: string;
  isFavorite: boolean;
  resume?: ResumePoint;
  coverPageKey?: string;
  chapterCount: number;
  pageCount: number;
  updatedAt: number;
};

export function buildLibraryEntries(
  seriesList: Series[],
  chapterList: Chapter[],
  progressList: Progress[] = [],
): LibraryEntry[] {
  const chapterTotals = new Map<string, number>();
  const pageTotals = new Map<string, number>();
  const chapterById = new Map(
    chapterList.map((chapter) => [chapter.id, chapter]),
  );
  const resumeBySeries = new Map<string, ResumePoint>();

  for (const chapter of chapterList) {
    chapterTotals.set(
      chapter.seriesId,
      (chapterTotals.get(chapter.seriesId) ?? 0) + 1,
    );
    pageTotals.set(
      chapter.seriesId,
      (pageTotals.get(chapter.seriesId) ?? 0) + chapter.pageCount,
    );
  }

  for (const progress of progressList) {
    const chapter = chapterById.get(progress.chapterId);
    if (!chapter) {
      continue;
    }
    const current = resumeBySeries.get(chapter.seriesId);
    if (!current || progress.updatedAt > current.updatedAt) {
      resumeBySeries.set(chapter.seriesId, {
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        pageIndex: Math.min(
          progress.pageIndex,
          Math.max(chapter.pageCount - 1, 0),
        ),
        pageCount: chapter.pageCount,
        updatedAt: progress.updatedAt,
      });
    }
  }

  return seriesList
    .map((series) => ({
      id: series.id,
      title: series.title,
      type: series.type,
      tags: series.tags ?? [],
      ageRating: series.ageRating,
      isFavorite: series.isFavorite ?? false,
      resume: resumeBySeries.get(series.id),
      coverPageKey: series.coverPageKey,
      chapterCount: chapterTotals.get(series.id) ?? 0,
      pageCount: pageTotals.get(series.id) ?? 0,
      updatedAt: series.updatedAt,
    }))
    .sort((left, right) => {
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      return left.title.localeCompare(right.title);
    });
}

export function filterLibraryEntries(
  entries: LibraryEntry[],
  filters: {
    query?: string;
    type?: SeriesType | "all";
    tag?: string;
    favoriteOnly?: boolean;
    continueOnly?: boolean;
    safeOnly?: boolean;
    adultOnly?: boolean;
  } = {},
): LibraryEntry[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";

  return entries.filter((entry) => {
    const matchesQuery =
      !query ||
      entry.title.toLocaleLowerCase().includes(query) ||
      entry.tags.some((tag) => tag.toLocaleLowerCase().includes(query));
    const matchesType =
      !filters.type ||
      filters.type === "all" ||
      entry.type === filters.type ||
      (filters.type === "manga" && entry.type === "manhwa");
    const matchesTag = !filters.tag || entry.tags.includes(filters.tag);
    const matchesFavorite = !filters.favoriteOnly || entry.isFavorite;
    const matchesContinue = !filters.continueOnly || Boolean(entry.resume);
    const matchesSafe =
      !filters.safeOnly ||
      !/(18\+?|adult|mature|r-?18|nc-?17)/i.test(entry.ageRating ?? "");
    const matchesAdult =
      !filters.adultOnly ||
      /(18\+?|adult|mature|r-?18|nc-?17)/i.test(entry.ageRating ?? "");
    return (
      matchesQuery &&
      matchesType &&
      matchesTag &&
      matchesFavorite &&
      matchesContinue &&
      matchesSafe &&
      matchesAdult
    );
  });
}
