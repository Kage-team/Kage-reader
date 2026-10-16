import { describe, expect, it } from "vitest";
import { searchTextDocuments } from "./search";

describe("searchTextDocuments", () => {
  it("finds case-insensitive matches across text pages with context", () => {
    const results = searchTextDocuments(
      [
        {
          chapterId: "chapter:one",
          chapterTitle: "Chapter One",
          pageIndex: 0,
          text: "A quiet evening. The silver moon rose over the hills.",
        },
        {
          chapterId: "chapter:two",
          chapterTitle: "Chapter Two",
          pageIndex: 3,
          text: "The SILVER moon appeared again.",
        },
      ],
      " silver moon ",
    );

    expect(results).toMatchObject([
      {
        chapterId: "chapter:one",
        chapterTitle: "Chapter One",
        pageIndex: 0,
        excerpt: "A quiet evening. The silver moon rose over the hills.",
      },
      {
        chapterId: "chapter:two",
        pageIndex: 3,
        excerpt: "The SILVER moon appeared again.",
      },
    ]);
  });

  it("returns no results for an empty query and respects the result limit", () => {
    const documents = [
      {
        chapterId: "chapter:one",
        chapterTitle: "Chapter One",
        pageIndex: 0,
        text: "echo echo echo",
      },
    ];

    expect(searchTextDocuments(documents, " ")).toEqual([]);
    expect(searchTextDocuments(documents, "echo", 2)).toHaveLength(2);
  });
});
