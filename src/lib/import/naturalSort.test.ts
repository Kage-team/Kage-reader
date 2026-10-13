import { describe, expect, it } from "vitest";
import { naturalSort } from "./naturalSort";

describe("naturalSort", () => {
  it("orders embedded numbers naturally and ignores case", () => {
    expect(["page_10", "Page_2", "page_1"].sort(naturalSort)).toEqual([
      "page_1",
      "Page_2",
      "page_10",
    ]);
  });

  it("handles chapter titles with numeric suffixes", () => {
    expect(["Chapter 10", "chapter 1", "chapter 2"].sort(naturalSort)).toEqual([
      "chapter 1",
      "chapter 2",
      "Chapter 10",
    ]);
  });
});
