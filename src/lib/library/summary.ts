import type { Chapter, Series } from "../storage/types";

export type LibraryEntry = {
  id: string;
  title: string;
  coverPageKey?: string;
  chapterCount: number;
  pageCount: number;
  updatedAt: number;
};

export function buildLibraryEntries(
  seriesList: Series[],
  chapterList: Chapter[],
): LibraryEntry[] {
  const chapterTotals = new Map<string, number>();
  const pageTotals = new Map<string, number>();

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

  return seriesList
    .map((series) => ({
      id: series.id,
      title: series.title,
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
