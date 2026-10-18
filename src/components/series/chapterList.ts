import type { Chapter } from "../../lib/storage/types";

export type ChapterSortMode =
  | "oldest"
  | "newest"
  | "unread"
  | "completed"
  | "ascending"
  | "descending";

export function filterAndSortChapters(
  chapters: Chapter[],
  query: string,
  mode: ChapterSortMode,
  completedIds: Set<string> = new Set(),
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
      if (mode === "unread" || mode === "completed") {
        const leftCompleted = completedIds.has(left.id);
        const rightCompleted = completedIds.has(right.id);
        if (leftCompleted !== rightCompleted) {
          const completedFirst = mode === "completed";
          return completedFirst
            ? Number(rightCompleted) - Number(leftCompleted)
            : Number(leftCompleted) - Number(rightCompleted);
        }
      }
      const leftOrder = left.order ?? left.number ?? 0;
      const rightOrder = right.order ?? right.number ?? 0;
      return mode === "newest" || mode === "descending"
        ? rightOrder - leftOrder
        : leftOrder - rightOrder;
    });
}
