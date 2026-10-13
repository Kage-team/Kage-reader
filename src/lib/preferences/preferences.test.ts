// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  getPreferences,
  savePreferences,
} from "./preferences";

function createStorage(initialValue?: string): Storage {
  let value = initialValue ?? null;
  return {
    getItem: () => value,
    setItem: (_key, nextValue) => {
      value = nextValue;
    },
    removeItem: () => {
      value = null;
    },
    clear: () => {
      value = null;
    },
    key: () => null,
    get length() {
      return value === null ? 0 : 1;
    },
  };
}

describe("preferences", () => {
  it("returns defaults when no saved preferences exist", () => {
    expect(getPreferences(createStorage())).toEqual(DEFAULT_PREFERENCES);
  });

  it("persists validated reader preferences", () => {
    const storage = createStorage();
    const updated = savePreferences(
      {
        ...DEFAULT_PREFERENCES,
        defaultReaderMode: "novel",
        defaultReadingDirection: "rtl",
        textScale: 113,
        novelFontFamily: "modern",
        novelFontSize: 22,
        novelLineSpacing: 2.1,
        novelTextAlignment: "justify",
        novelParagraphIndent: true,
        novelParagraphGap: 28,
        novelColumnWidth: "standard",
        novelReadingTheme: "paper",
        highContrast: true,
        theme: "forest",
        accent: "jade",
        safeMode: false,
        readerWidth: 1088,
        comicPageGap: 7,
        comicInfiniteScroll: false,
        novelInfiniteScroll: false,
        immersiveMode: true,
      },
      storage,
    );

    expect(updated).toEqual({
      ...DEFAULT_PREFERENCES,
      defaultReaderMode: "novel",
      defaultReadingDirection: "rtl",
      textScale: 115,
      novelFontFamily: "modern",
      novelFontSize: 22,
      novelLineSpacing: 2.1,
      novelTextAlignment: "justify",
      novelParagraphIndent: true,
      novelParagraphGap: 28,
      novelColumnWidth: "standard",
      novelReadingTheme: "paper",
      highContrast: true,
      theme: "forest",
      accent: "jade",
      safeMode: false,
      readerWidth: 1100,
      comicPageGap: 8,
      comicInfiniteScroll: false,
      novelInfiniteScroll: false,
      immersiveMode: true,
    });
    expect(getPreferences(storage)).toEqual(updated);
  });

  it("falls back safely for malformed or out-of-range values", () => {
    const storage = createStorage(
      JSON.stringify({ defaultReaderMode: "invalid", textScale: 500 }),
    );

    expect(getPreferences(storage)).toEqual({
      ...DEFAULT_PREFERENCES,
      textScale: 150,
    });
  });
});
