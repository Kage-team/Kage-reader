import type { ReaderMode } from "../storage/types";

const PREFERENCES_KEY = "kage-reader:preferences";
const READER_MODES: ReaderMode[] = ["flip", "webtoon", "novel"];
const READING_DIRECTIONS: ReadingDirection[] = ["ltr", "rtl"];

export type ReadingDirection = "ltr" | "rtl";
export type NovelFontFamily =
  | "literary"
  | "modern"
  | "editorial"
  | "legible"
  | "mono";
export type NovelReadingTheme =
  | "oled"
  | "midnight"
  | "paper"
  | "sepia"
  | "forest"
  | "slate";
export type NovelTextAlignment = "left" | "justify";
export type NovelColumnWidth = "narrow" | "standard" | "wide" | "full";
export type ReaderPageFit = "screen" | "width" | "height";
export type ReaderTapBehavior = "controls" | "toggle-controls" | "page-turn";
const NOVEL_FONT_FAMILIES: NovelFontFamily[] = [
  "literary",
  "modern",
  "editorial",
  "legible",
  "mono",
];
const NOVEL_READING_THEMES: NovelReadingTheme[] = [
  "oled",
  "midnight",
  "paper",
  "sepia",
  "forest",
  "slate",
];
const NOVEL_COLUMN_WIDTHS: NovelColumnWidth[] = [
  "narrow",
  "standard",
  "wide",
  "full",
];

export type ColorTheme =
  | "oled"
  | "midnight"
  | "parchment"
  | "forest"
  | "cyber"
  | "crimson";
export type AccentColor = "pure" | "jade" | "cyber" | "electric" | "cobalt";

const COLOR_THEMES: ColorTheme[] = [
  "oled",
  "midnight",
  "parchment",
  "forest",
  "cyber",
  "crimson",
];
const ACCENT_COLORS: AccentColor[] = [
  "pure",
  "jade",
  "cyber",
  "electric",
  "cobalt",
];

export type Preferences = {
  defaultReaderMode: ReaderMode;
  defaultReadingDirection: ReadingDirection;
  textScale: number;
  novelFontFamily: NovelFontFamily;
  novelFontSize: number;
  novelLineSpacing: number;
  novelTextAlignment: NovelTextAlignment;
  novelParagraphIndent: boolean;
  novelParagraphGap: number;
  novelColumnWidth: NovelColumnWidth;
  novelReadingTheme: NovelReadingTheme;
  highContrast: boolean;
  theme: ColorTheme;
  accent: AccentColor;
  safeMode: boolean;
  readerWidth: number;
  comicPageGap: number;
  comicInfiniteScroll: boolean;
  novelInfiniteScroll: boolean;
  immersiveMode: boolean;
  readerAutoHide: boolean;
  readerAutoHideDelay: number;
  readerPageFit: ReaderPageFit;
  readerZoom: number;
  disableZoomOut: boolean;
  readerTapBehavior: ReaderTapBehavior;
};

export const DEFAULT_PREFERENCES: Preferences = {
  defaultReaderMode: "flip",
  defaultReadingDirection: "ltr",
  textScale: 100,
  novelFontFamily: "literary",
  novelFontSize: 18,
  novelLineSpacing: 1.8,
  novelTextAlignment: "left",
  novelParagraphIndent: false,
  novelParagraphGap: 16,
  novelColumnWidth: "wide",
  novelReadingTheme: "oled",
  highContrast: false,
  theme: "oled",
  accent: "pure",
  safeMode: true,
  readerWidth: 1600,
  comicPageGap: 0,
  comicInfiniteScroll: true,
  novelInfiniteScroll: true,
  immersiveMode: false,
  readerAutoHide: true,
  readerAutoHideDelay: 2500,
  readerPageFit: "screen",
  readerZoom: 100,
  disableZoomOut: false,
  readerTapBehavior: "controls",
};

function isReaderMode(value: unknown): value is ReaderMode {
  return (
    typeof value === "string" && READER_MODES.includes(value as ReaderMode)
  );
}

function isColorTheme(value: unknown): value is ColorTheme {
  return (
    typeof value === "string" && COLOR_THEMES.includes(value as ColorTheme)
  );
}

function isAccentColor(value: unknown): value is AccentColor {
  return (
    typeof value === "string" && ACCENT_COLORS.includes(value as AccentColor)
  );
}

function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PREFERENCES };
  }

  const candidate = value as Partial<Preferences>;
  const textScale = Number(candidate.textScale);
  const novelFontSize = Number(candidate.novelFontSize);
  const novelLineSpacing = Number(candidate.novelLineSpacing);
  const novelParagraphGap = Number(candidate.novelParagraphGap);
  const readerWidth = Number(candidate.readerWidth);

  return {
    defaultReaderMode: isReaderMode(candidate.defaultReaderMode)
      ? candidate.defaultReaderMode
      : DEFAULT_PREFERENCES.defaultReaderMode,
    defaultReadingDirection:
      typeof candidate.defaultReadingDirection === "string" &&
      READING_DIRECTIONS.includes(
        candidate.defaultReadingDirection as ReadingDirection,
      )
        ? (candidate.defaultReadingDirection as ReadingDirection)
        : DEFAULT_PREFERENCES.defaultReadingDirection,
    textScale: Number.isFinite(textScale)
      ? Math.min(150, Math.max(80, Math.round(textScale / 5) * 5))
      : DEFAULT_PREFERENCES.textScale,
    novelFontFamily:
      typeof candidate.novelFontFamily === "string" &&
      NOVEL_FONT_FAMILIES.includes(candidate.novelFontFamily as NovelFontFamily)
        ? (candidate.novelFontFamily as NovelFontFamily)
        : DEFAULT_PREFERENCES.novelFontFamily,
    novelFontSize: Number.isFinite(novelFontSize)
      ? Math.min(30, Math.max(14, Math.round(novelFontSize)))
      : Number.isFinite(textScale) && textScale >= 80 && textScale <= 150
        ? Math.min(30, Math.max(14, Math.round(18 * (textScale / 100))))
        : DEFAULT_PREFERENCES.novelFontSize,
    novelLineSpacing: Number.isFinite(novelLineSpacing)
      ? [1.5, 1.8, 2.1].reduce((closest, value) =>
          Math.abs(value - novelLineSpacing) <
          Math.abs(closest - novelLineSpacing)
            ? value
            : closest,
        )
      : DEFAULT_PREFERENCES.novelLineSpacing,
    novelTextAlignment:
      candidate.novelTextAlignment === "left" ||
      candidate.novelTextAlignment === "justify"
        ? candidate.novelTextAlignment
        : DEFAULT_PREFERENCES.novelTextAlignment,
    novelParagraphIndent:
      typeof candidate.novelParagraphIndent === "boolean"
        ? candidate.novelParagraphIndent
        : DEFAULT_PREFERENCES.novelParagraphIndent,
    novelParagraphGap: Number.isFinite(novelParagraphGap)
      ? Math.min(36, Math.max(0, Math.round(novelParagraphGap / 4) * 4))
      : DEFAULT_PREFERENCES.novelParagraphGap,
    novelColumnWidth:
      typeof candidate.novelColumnWidth === "string" &&
      NOVEL_COLUMN_WIDTHS.includes(
        candidate.novelColumnWidth as NovelColumnWidth,
      )
        ? (candidate.novelColumnWidth as NovelColumnWidth)
        : DEFAULT_PREFERENCES.novelColumnWidth,
    novelReadingTheme:
      typeof candidate.novelReadingTheme === "string" &&
      NOVEL_READING_THEMES.includes(
        candidate.novelReadingTheme as NovelReadingTheme,
      )
        ? (candidate.novelReadingTheme as NovelReadingTheme)
        : DEFAULT_PREFERENCES.novelReadingTheme,
    highContrast:
      typeof candidate.highContrast === "boolean"
        ? candidate.highContrast
        : DEFAULT_PREFERENCES.highContrast,
    theme: isColorTheme(candidate.theme)
      ? candidate.theme
      : DEFAULT_PREFERENCES.theme,
    accent: isAccentColor(candidate.accent)
      ? candidate.accent
      : DEFAULT_PREFERENCES.accent,
    safeMode:
      typeof candidate.safeMode === "boolean"
        ? candidate.safeMode
        : DEFAULT_PREFERENCES.safeMode,
    readerWidth: Number.isFinite(readerWidth)
      ? Math.min(2200, Math.max(720, Math.round(readerWidth / 50) * 50))
      : DEFAULT_PREFERENCES.readerWidth,
    comicPageGap: Number.isFinite(Number(candidate.comicPageGap))
      ? Math.min(
          32,
          Math.max(0, Math.round(Number(candidate.comicPageGap) / 2) * 2),
        )
      : DEFAULT_PREFERENCES.comicPageGap,
    comicInfiniteScroll:
      typeof candidate.comicInfiniteScroll === "boolean"
        ? candidate.comicInfiniteScroll
        : DEFAULT_PREFERENCES.comicInfiniteScroll,
    novelInfiniteScroll:
      typeof candidate.novelInfiniteScroll === "boolean"
        ? candidate.novelInfiniteScroll
        : DEFAULT_PREFERENCES.novelInfiniteScroll,
    immersiveMode:
      typeof candidate.immersiveMode === "boolean"
        ? candidate.immersiveMode
        : DEFAULT_PREFERENCES.immersiveMode,
    readerAutoHide:
      typeof candidate.readerAutoHide === "boolean"
        ? candidate.readerAutoHide
        : DEFAULT_PREFERENCES.readerAutoHide,
    readerAutoHideDelay: Number.isFinite(Number(candidate.readerAutoHideDelay))
      ? Math.min(
          6000,
          Math.max(
            1000,
            Math.round(Number(candidate.readerAutoHideDelay) / 500) * 500,
          ),
        )
      : DEFAULT_PREFERENCES.readerAutoHideDelay,
    readerPageFit:
      candidate.readerPageFit === "screen" ||
      candidate.readerPageFit === "width" ||
      candidate.readerPageFit === "height"
        ? candidate.readerPageFit
        : DEFAULT_PREFERENCES.readerPageFit,
    readerZoom: Number.isFinite(Number(candidate.readerZoom))
      ? Math.min(
          300,
          Math.max(50, Math.round(Number(candidate.readerZoom) / 10) * 10),
        )
      : DEFAULT_PREFERENCES.readerZoom,
    disableZoomOut:
      typeof candidate.disableZoomOut === "boolean"
        ? candidate.disableZoomOut
        : DEFAULT_PREFERENCES.disableZoomOut,
    readerTapBehavior:
      candidate.readerTapBehavior === "controls" ||
      candidate.readerTapBehavior === "toggle-controls" ||
      candidate.readerTapBehavior === "page-turn"
        ? candidate.readerTapBehavior
        : DEFAULT_PREFERENCES.readerTapBehavior,
  };
}

export function getPreferences(
  storage: Storage | undefined = globalThis.localStorage,
): Preferences {
  if (!storage) {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const storedValue = storage.getItem(PREFERENCES_KEY);
    return storedValue
      ? normalizePreferences(JSON.parse(storedValue) as unknown)
      : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(
  preferences: Preferences,
  storage: Storage | undefined = globalThis.localStorage,
): Preferences {
  const normalized = normalizePreferences(preferences);
  try {
    storage?.setItem(PREFERENCES_KEY, JSON.stringify(normalized));
  } catch {
    return normalized;
  }
  return normalized;
}

export function applyPreferencesToDocument(preferences: Preferences): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.accent = preferences.accent;
  document.body.style.filter = preferences.highContrast ? "contrast(1.12)" : "";
}
