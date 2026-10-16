export type TextSearchDocument = {
  chapterId: string;
  chapterTitle: string;
  pageIndex: number;
  text: string;
};

export type TextSearchResult = TextSearchDocument & {
  excerpt: string;
  matchIndex: number;
};

export function searchTextDocuments(
  documents: TextSearchDocument[],
  query: string,
  maxResults = 100,
): TextSearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery || maxResults <= 0) return [];

  const results: TextSearchResult[] = [];
  for (const document of documents) {
    const normalizedText = document.text.toLocaleLowerCase();
    let matchIndex = normalizedText.indexOf(normalizedQuery);
    while (matchIndex >= 0 && results.length < maxResults) {
      const start = Math.max(0, matchIndex - 55);
      const end = Math.min(
        document.text.length,
        matchIndex + normalizedQuery.length + 75,
      );
      results.push({
        ...document,
        matchIndex,
        excerpt: `${start > 0 ? "..." : ""}${document.text.slice(start, end)}${end < document.text.length ? "..." : ""}`,
      });
      matchIndex = normalizedText.indexOf(normalizedQuery, matchIndex + 1);
    }
    if (results.length >= maxResults) break;
  }
  return results;
}
