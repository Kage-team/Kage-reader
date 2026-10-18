import type { Chapter } from "../../lib/storage/types";

export type ChapterSortDirection = "ascending" | "descending";

export function filterAndSortChapters(
  chapters: Chapter[],
  query: string,
  direction: ChapterSortDirection,
): Chapter[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return chapters
    .filter((chapter) => {
      if (!normalizedQuery) return true;
      return `${chapter.title} ${chapter.number ?? ""} ${chapter.volume ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    })
    .slice()
    .sort((left, right) => {
      const leftOrder = left.order ?? left.number ?? 0;
      const rightOrder = right.order ?? right.number ?? 0;
      return direction === "ascending"
        ? leftOrder - rightOrder
        : rightOrder - leftOrder;
    });
}
