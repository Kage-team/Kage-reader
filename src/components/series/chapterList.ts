import type { Chapter } from "../../lib/storage/types";

export function getChapterDisplayTitle(chapter: Chapter, fallbackNumber?: number): string {
  const title = chapter.title.trim();
  const number = chapter.number ?? fallbackNumber;
  if (!title || /^((chapter|chap|ch|episode|ep)\s*[._#-]*\d+(?:\.\d+)?)$/i.test(title)) {
    return number !== undefined ? `Chapter ${number}` : "Untitled chapter";
  }
  return title;
}

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
      const leftNumber = left.number ?? Number.POSITIVE_INFINITY;
      const rightNumber = right.number ?? Number.POSITIVE_INFINITY;
      const numberDifference = leftNumber - rightNumber;
      if (Number.isFinite(numberDifference) && numberDifference !== 0) {
        return mode === "newest" || mode === "descending" ? -numberDifference : numberDifference;
      }
      const leftOrder = left.order ?? 0;
      const rightOrder = right.order ?? 0;
      return mode === "newest" || mode === "descending"
        ? rightOrder - leftOrder
        : leftOrder - rightOrder;
    });
}
