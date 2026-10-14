import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlignJustify,
  AlignLeft,
  ArrowLeft,
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Expand,
  Grid2X2,
  Eye,
  EyeOff,
  List,
  BookmarkCheck,
  Minimize2,
  Minus,
  PanelsTopLeft,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Type,
  X,
} from "lucide-react";
import { resolveReaderMode } from "../../lib/reader/mode";
import { sanitizeReaderHtml } from "../../lib/reader/html";
import {
  translateAtFocalPoint,
  type ZoomTransform,
} from "../../lib/reader/zoom";
import {
  getPreferences,
  savePreferences,
  type Preferences,
} from "../../lib/preferences/preferences";
import {
  getBlob,
  getBookmarksForChapter,
  getChapter,
  deleteBookmark,
  getProgress,
  getSeries,
  listChapters,
  listBookmarks,
  listPages,
  putBookmark,
  putProgress,
  putSeries,
} from "../../lib/storage/db";
import type {
  Bookmark as BookmarkRecord,
  Chapter,
  Page,
  ReaderMode,
  ReadingDirection,
  SeriesType,
} from "../../lib/storage/types";
import { SCHEMA_VERSION } from "../../lib/storage/types";

const NOVEL_THEME_OPTIONS = [
  { value: "oled", label: "OLED", swatch: "#050505", color: "#f2f0eb" },
  {
    value: "midnight",
    label: "Midnight",
    swatch: "#111827",
    color: "#e7edf7",
  },
  { value: "paper", label: "Paper", swatch: "#f3f0e7", color: "#26251f" },
  { value: "sepia", label: "Sepia", swatch: "#eadcc3", color: "#392e20" },
  { value: "forest", label: "Forest", swatch: "#0b211a", color: "#e2f0e8" },
  { value: "slate", label: "Slate", swatch: "#20242a", color: "#eef0f3" },
] as const;

const NOVEL_FONT_OPTIONS = [
  {
    value: "literary",
    label: "Literary Serif",
    font: 'Georgia, "Times New Roman", serif',
  },
  { value: "modern", label: "Modern Sans", font: '"DM Sans", sans-serif' },
  {
    value: "editorial",
    label: "Editorial Antiqua",
    font: '"Space Grotesk", Georgia, serif',
  },
  {
    value: "legible",
    label: "High Legibility",
    font: 'Verdana, "DM Sans", sans-serif',
  },
  {
    value: "mono",
    label: "Monospace",
    font: 'ui-monospace, "Cascadia Code", monospace',
  },
] as const;

const NOVEL_COLUMN_WIDTHS = {
  narrow: 640,
  standard: 820,
  wide: 1080,
  full: 1800,
} as const;

function isTextMime(mime: string): boolean {
  return (
    mime.startsWith("text/") || mime.includes("html") || mime.includes("xml")
  );
}

function plainTextPreview(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function ReaderPage() {
  const { chapterId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [seriesType, setSeriesType] = useState<SeriesType | null>(null);
  const [seriesChapters, setSeriesChapters] = useState<Chapter[]>([]);
  const [activeNovelChapterId, setActiveNovelChapterId] = useState("");
  const [novelFlowContent, setNovelFlowContent] = useState<
    Array<{ chapter: Chapter; content: string; illustrations: string[] }>
  >([]);
  const [loadedChapterId, setLoadedChapterId] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>(
    () => getPreferences().defaultReadingDirection,
  );
  const [readingDirectionOverride, setReadingDirectionOverride] = useState<
    ReadingDirection | undefined
  >();
  const [pageUrls, setPageUrls] = useState<Array<string | null>>([]);
  const [pageTexts, setPageTexts] = useState<Array<string | null>>([]);
  const [readerMode, setReaderMode] = useState<ReaderMode>("flip");
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [bookmarkDrawerEntries, setBookmarkDrawerEntries] = useState<
    Array<{
      bookmark: BookmarkRecord;
      chapterTitle: string;
      seriesTitle: string;
    }>
  >([]);
  const [isBookmarkDrawerOpen, setIsBookmarkDrawerOpen] = useState(false);
  const [bookmarkError, setBookmarkError] = useState("");
  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const zoomLevel = zoomTransform.scale;
  const [viewportSize, setViewportSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPageGridOpen, setIsPageGridOpen] = useState(false);
  const [isContentsOpen, setIsContentsOpen] = useState(false);
  const [contentsQuery, setContentsQuery] = useState("");
  const [isReaderSettingsOpen, setIsReaderSettingsOpen] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const [isUiVisible, setIsUiVisible] = useState(true);
  const [readerPreferences, setReaderPreferences] = useState<Preferences>(() =>
    getPreferences(),
  );
  const readerRootRef = useRef<HTMLElement>(null);
  const viewerFrameRef = useRef<HTMLDivElement>(null);
  const changeZoomRef = useRef<(nextZoom: number) => void>(() => undefined);
  const pointerPositionsRef = useRef(
    new Map<number, { x: number; y: number }>(),
  );
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreTapUntilRef = useRef(0);
  const pinchStartRef = useRef<{
    distance: number;
    transform: ZoomTransform;
    midpointX: number;
    midpointY: number;
  } | null>(null);
  const lastTouchTapRef = useRef<{ at: number; x: number; y: number } | null>(
    null,
  );
  const pendingTapRef = useRef<number | undefined>(undefined);
  const lastPointerTypeRef = useRef<string | null>(null);
  const comicChapterPrefetchRef = useRef<{
    chapterId: string;
    blobs: Promise<Map<string, Blob | undefined>>;
  } | null>(null);
  const autoAdvancedChapterRef = useRef<string | null>(null);
  const zoomPersistTimerRef = useRef<number | undefined>(undefined);
  const chromeHideTimerRef = useRef<number | undefined>(undefined);
  const novelProgressSavedAtRef = useRef(0);
  const novelScrollRatioRef = useRef(0);

  useEffect(() => {
    setReaderPreferences(getPreferences());
  }, [chapterId]);

  useEffect(() => {
    if (!chapterId) {
      return;
    }

    setIsImmersive(getPreferences().immersiveMode);

    void (async () => {
      const decodedChapterId = decodeURIComponent(chapterId);
      viewerFrameRef.current?.scrollTo({
        top: 0,
        left: 0,
        behavior: "instant",
      });
      setLoadedChapterId(null);
      setCurrentPage(0);
      setBookmarks([]);
      setZoomTransform({ scale: 1, translateX: 0, translateY: 0 });
      const [chapterRecord, pageRows, progress, chapterBookmarks] =
        await Promise.all([
          getChapter(decodedChapterId),
          listPages(decodedChapterId),
          getProgress(decodedChapterId),
          getBookmarksForChapter(decodedChapterId),
        ]);

      setChapter(chapterRecord ?? null);
      setSeriesType(null);
      setPages(pageRows);
      setLoadedChapterId(decodedChapterId);
      novelScrollRatioRef.current = progress?.scrollRatio ?? 0;

      if (chapterRecord) {
        const [seriesRecord, chapterRows] = await Promise.all([
          getSeries(chapterRecord.seriesId),
          listChapters(chapterRecord.seriesId),
        ]);
        setSeriesType(seriesRecord?.type ?? null);
        setSeriesChapters(chapterRows);
        setReaderMode(
          resolveReaderMode(
            seriesRecord?.preferredMode,
            seriesRecord?.type === "novel"
              ? "novel"
              : getPreferences().defaultReaderMode,
          ),
        );
        setReadingDirectionOverride(seriesRecord?.preferredDirection);
        setReadingDirection(
          seriesRecord?.preferredDirection ??
            getPreferences().defaultReadingDirection,
        );
      } else {
        setSeriesType(null);
        setSeriesChapters([]);
        setReadingDirectionOverride(undefined);
        setReadingDirection(getPreferences().defaultReadingDirection);
      }
      setActiveNovelChapterId(decodedChapterId);

      const restoredPageIndex =
        progress &&
        progress.pageIndex >= 0 &&
        progress.pageIndex < pageRows.length
          ? progress.pageIndex
          : 0;
      setBookmarks(chapterBookmarks);
      const routeState = location.state as {
        bookmarkPageIndex?: number;
      } | null;
      const requestedBookmarkPage = routeState?.bookmarkPageIndex;
      const hasRequestedBookmarkPage =
        typeof requestedBookmarkPage === "number" &&
        Number.isInteger(requestedBookmarkPage) &&
        requestedBookmarkPage >= 0 &&
        requestedBookmarkPage < pageRows.length;
      setCurrentPage(
        hasRequestedBookmarkPage ? requestedBookmarkPage : restoredPageIndex,
      );
    })();
  }, [chapterId, location.state]);

  useEffect(() => {
    setZoomTransform({ scale: 1, translateX: 0, translateY: 0 });
    pointerPositionsRef.current.clear();
    swipeStartRef.current = null;
    pinchStartRef.current = null;
    lastTouchTapRef.current = null;
    if (pendingTapRef.current !== undefined) {
      window.clearTimeout(pendingTapRef.current);
      pendingTapRef.current = undefined;
    }
  }, [currentPage, chapterId]);

  useEffect(() => {
    const shouldAutoHide = readerPreferences.readerAutoHide || isImmersive;
    const keepChromeVisible =
      !shouldAutoHide ||
      isReaderSettingsOpen ||
      isPageGridOpen ||
      isBookmarkDrawerOpen ||
      isContentsOpen;
    if (keepChromeVisible) {
      setIsUiVisible(true);
      if (chromeHideTimerRef.current !== undefined) {
        window.clearTimeout(chromeHideTimerRef.current);
        chromeHideTimerRef.current = undefined;
      }
      return;
    }

    if (isImmersive) {
      setIsUiVisible(false);
      return;
    }

    setIsUiVisible(true);
    chromeHideTimerRef.current = window.setTimeout(
      () => setIsUiVisible(false),
      readerPreferences.readerAutoHideDelay,
    );

    return () => {
      if (chromeHideTimerRef.current !== undefined) {
        window.clearTimeout(chromeHideTimerRef.current);
        chromeHideTimerRef.current = undefined;
      }
    };
  }, [
    chapterId,
    isContentsOpen,
    isPageGridOpen,
    isBookmarkDrawerOpen,
    isReaderSettingsOpen,
    isImmersive,
    pages.length,
    readerPreferences.readerAutoHide,
    readerPreferences.readerAutoHideDelay,
  ]);

  useEffect(
    () => () => {
      if (zoomPersistTimerRef.current !== undefined) {
        window.clearTimeout(zoomPersistTimerRef.current);
      }
      if (pendingTapRef.current !== undefined) {
        window.clearTimeout(pendingTapRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      !chapterId ||
      loadedChapterId !== decodeURIComponent(chapterId) ||
      pages.length === 0
    ) {
      setPageUrls([]);
      setPageTexts([]);
      return;
    }

    let isCancelled = false;
    let objectUrls: string[] = [];

    void (async () => {
      const decodedChapterId = decodeURIComponent(chapterId);
      const prefetched =
        comicChapterPrefetchRef.current?.chapterId === decodedChapterId
          ? comicChapterPrefetchRef.current.blobs
          : undefined;
      if (prefetched) comicChapterPrefetchRef.current = null;
      const prefetchedBlobs = prefetched ? await prefetched : undefined;
      const loadedUrls: Array<string | null> = [];
      const loadedTexts: Array<string | null> = [];

      for (const page of pages) {
        const blob =
          prefetchedBlobs?.get(page.storageKey) ??
          (await getBlob(page.storageKey));
        if (!blob) {
          loadedUrls.push(null);
          loadedTexts.push(null);
          continue;
        }

        if (page.mime.startsWith("image/")) {
          const objectUrl = URL.createObjectURL(blob);
          loadedUrls.push(objectUrl);
          loadedTexts.push(null);
          continue;
        }

        loadedUrls.push(null);
        const text = await blob.text();
        loadedTexts.push(
          isTextMime(page.mime) ? sanitizeReaderHtml(text) : text,
        );
      }

      if (isCancelled) {
        loadedUrls
          .filter((url): url is string => Boolean(url))
          .forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      objectUrls = loadedUrls.filter((url): url is string => Boolean(url));
      setPageUrls(loadedUrls);
      setPageTexts(loadedTexts);
    })();

    return () => {
      isCancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [chapterId, loadedChapterId, pages]);

  useEffect(() => {
    if (
      !chapter ||
      readerMode !== "webtoon" ||
      !readerPreferences.comicInfiniteScroll
    ) {
      return;
    }

    const currentChapterIndex = seriesChapters.findIndex(
      (entry) => entry.id === chapter.id,
    );
    const nextChapter = seriesChapters[currentChapterIndex + 1];
    if (
      !nextChapter ||
      comicChapterPrefetchRef.current?.chapterId === nextChapter.id
    ) {
      return;
    }

    const blobs = listPages(nextChapter.id)
      .then(async (chapterPages) => {
        const entries = await Promise.all(
          chapterPages.map(
            async (page) =>
              [page.storageKey, await getBlob(page.storageKey)] as const,
          ),
        );
        return new Map(entries);
      })
      .catch(() => new Map<string, Blob | undefined>());
    comicChapterPrefetchRef.current = { chapterId: nextChapter.id, blobs };
  }, [
    chapter,
    readerMode,
    readerPreferences.comicInfiniteScroll,
    seriesChapters,
  ]);

  useEffect(() => {
    if (
      readerMode !== "novel" ||
      !readerPreferences.novelInfiniteScroll ||
      seriesChapters.length === 0
    ) {
      setNovelFlowContent([]);
      return;
    }

    let isCancelled = false;
    const objectUrls: string[] = [];

    void (async () => {
      const chapters = await Promise.all(
        seriesChapters.map(async (seriesChapter) => {
          const chapterPages = await listPages(seriesChapter.id);
          const textParts: string[] = [];
          const illustrations: string[] = [];

          for (const page of chapterPages) {
            const blob = await getBlob(page.storageKey);
            if (!blob) continue;
            if (isTextMime(page.mime)) {
              textParts.push(sanitizeReaderHtml(await blob.text()));
            } else if (page.mime.startsWith("image/")) {
              const url = URL.createObjectURL(blob);
              objectUrls.push(url);
              illustrations.push(url);
            }
          }

          return {
            chapter: seriesChapter,
            content: textParts.join("\n"),
            illustrations,
          };
        }),
      );

      if (isCancelled) {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setNovelFlowContent(
        chapters.filter((entry) => entry.content.trim().length > 0),
      );
    })();

    return () => {
      isCancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [
    chapter?.seriesId,
    readerMode,
    readerPreferences.novelInfiniteScroll,
    seriesChapters,
  ]);

  useEffect(() => {
    if (
      !chapterId ||
      loadedChapterId !== decodeURIComponent(chapterId) ||
      pages.length === 0
    ) {
      return;
    }

    if (
      readerMode === "novel" &&
      readerPreferences.novelInfiniteScroll &&
      pages.some((page) => isTextMime(page.mime))
    ) {
      return;
    }

    const safeIndex = Math.min(Math.max(currentPage, 0), pages.length - 1);
    void putProgress({
      schemaVersion: 1,
      chapterId: decodeURIComponent(chapterId),
      pageIndex: safeIndex,
      scrollRatio: 0,
      updatedAt: Date.now(),
    });
  }, [
    chapterId,
    currentPage,
    loadedChapterId,
    pages,
    readerMode,
    readerPreferences.novelInfiniteScroll,
  ]);

  useEffect(() => {
    if (
      readerMode !== "novel" ||
      (readerPreferences.novelInfiniteScroll &&
        novelFlowContent.length === 0) ||
      !chapter
    ) {
      return;
    }

    const frame = viewerFrameRef.current;
    const target = Array.from(
      frame?.querySelectorAll<HTMLElement>("[data-novel-chapter-id]") ?? [],
    ).find((element) => element.dataset.novelChapterId === chapter.id);
    if (!frame || !target) return;

    requestAnimationFrame(() => {
      const targetTop =
        target.getBoundingClientRect().top -
        frame.getBoundingClientRect().top +
        frame.scrollTop;
      frame.scrollTo({
        top: targetTop + target.scrollHeight * novelScrollRatioRef.current,
        behavior: "instant",
      });
      setActiveNovelChapterId(chapter.id);
    });
  }, [
    chapter,
    novelFlowContent,
    readerMode,
    readerPreferences.novelInfiniteScroll,
  ]);

  useEffect(() => {
    if (!chapterId || pages.length === 0) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          "input, select, textarea, [contenteditable='true']",
        )
      ) {
        return;
      }
      setIsUiVisible(true);
      if (chromeHideTimerRef.current !== undefined) {
        window.clearTimeout(chromeHideTimerRef.current);
        chromeHideTimerRef.current = undefined;
      }
      if (readerPreferences.readerAutoHide || isImmersive) {
        chromeHideTimerRef.current = window.setTimeout(
          () => setIsUiVisible(false),
          readerPreferences.readerAutoHideDelay,
        );
      }
      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        setIsPageGridOpen((current) => !current);
        return;
      }
      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        void openBookmarkDrawer();
        return;
      }
      if (event.key === "+" || event.key === "=" || event.key === "Add") {
        event.preventDefault();
        changeZoomRef.current(zoomLevel + 0.1);
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        changeZoomRef.current(zoomLevel - 0.1);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        changeZoomRef.current(1);
        return;
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (
        event.key === "PageDown" ||
        (event.key === "ArrowRight" && readingDirection === "ltr") ||
        (event.key === "ArrowLeft" && readingDirection === "rtl")
      ) {
        event.preventDefault();
        setCurrentPage((previous) => Math.min(previous + 1, pages.length - 1));
      }
      if (
        event.key === "PageUp" ||
        (event.key === "ArrowLeft" && readingDirection === "ltr") ||
        (event.key === "ArrowRight" && readingDirection === "rtl")
      ) {
        event.preventDefault();
        setCurrentPage((previous) => Math.max(previous - 1, 0));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    chapterId,
    pages.length,
    readingDirection,
    isImmersive,
    readerPreferences.readerAutoHide,
    readerPreferences.readerAutoHideDelay,
    zoomLevel,
  ]);

  useEffect(() => {
    const updateFullscreenState = () =>
      setIsFullscreen(document.fullscreenElement === readerRootRef.current);
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useEffect(() => {
    const updateViewportSize = () =>
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", updateViewportSize);
    window.visualViewport?.addEventListener("resize", updateViewportSize);
    return () => {
      window.removeEventListener("resize", updateViewportSize);
      window.visualViewport?.removeEventListener("resize", updateViewportSize);
    };
  }, []);

  function updateReaderPreferences(update: Partial<Preferences>): Preferences {
    const next = savePreferences({ ...readerPreferences, ...update });
    setReaderPreferences(next);
    return next;
  }

  function persistZoom(scale: number): void {
    if (zoomPersistTimerRef.current !== undefined) {
      window.clearTimeout(zoomPersistTimerRef.current);
    }
    zoomPersistTimerRef.current = window.setTimeout(() => {
      const preferences = getPreferences();
      const nextPreferences = savePreferences({
        ...preferences,
        readerZoom: Math.round(scale * 100),
      });
      setReaderPreferences(nextPreferences);
    }, 350);
  }

  function clampZoomTranslation(
    scale: number,
    translateX: number,
    translateY: number,
  ): Pick<ZoomTransform, "translateX" | "translateY"> {
    if (scale <= 1) return { translateX: 0, translateY: 0 };
    const frame = viewerFrameRef.current;
    const target = frame?.querySelector<HTMLElement>(
      "[data-reader-zoom-target]",
    );
    if (!frame || !target) return { translateX, translateY };

    const frameRect = frame.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const baseLeft =
      targetRect.left - frameRect.left - zoomTransform.translateX;
    const baseTop = targetRect.top - frameRect.top - zoomTransform.translateY;
    const baseWidth = targetRect.width / zoomTransform.scale;
    const baseHeight = targetRect.height / zoomTransform.scale;
    const minX = Math.min(0, frame.clientWidth - baseLeft - baseWidth * scale);
    const maxX = Math.max(0, -baseLeft);
    const minY = Math.min(0, frame.clientHeight - baseTop - baseHeight * scale);
    const maxY = Math.max(0, -baseTop);

    return {
      translateX: Math.min(maxX, Math.max(minX, translateX)),
      translateY: Math.min(maxY, Math.max(minY, translateY)),
    };
  }

  function changeZoom(nextZoom: number): void {
    const scale = Math.min(4, Math.max(1, nextZoom));
    const translation =
      scale === 1
        ? { translateX: 0, translateY: 0 }
        : clampZoomTranslation(
            scale,
            zoomTransform.translateX,
            zoomTransform.translateY,
          );
    setZoomTransform({ scale, ...translation });
    persistZoom(scale);
  }

  useEffect(() => {
    changeZoomRef.current = changeZoom;
  });

  function zoomAtPoint(
    nextZoom: number,
    clientX: number,
    clientY: number,
  ): void {
    const frame = viewerFrameRef.current;
    const target = frame?.querySelector<HTMLElement>(
      "[data-reader-zoom-target]",
    );
    if (!frame || !target) {
      changeZoom(nextZoom);
      return;
    }

    const scale = Math.min(4, Math.max(1, nextZoom));
    if (scale === 1) {
      setZoomTransform({ scale: 1, translateX: 0, translateY: 0 });
      persistZoom(scale);
      return;
    }

    const frameRect = frame.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const baseLeft =
      targetRect.left - frameRect.left - zoomTransform.translateX;
    const baseTop = targetRect.top - frameRect.top - zoomTransform.translateY;
    const focalX = clientX - frameRect.left - baseLeft;
    const focalY = clientY - frameRect.top - baseTop;
    const translateX = translateAtFocalPoint(
      focalX,
      zoomTransform.translateX,
      zoomTransform.scale,
      scale,
    );
    const translateY = translateAtFocalPoint(
      focalY,
      zoomTransform.translateY,
      zoomTransform.scale,
      scale,
    );
    setZoomTransform({
      scale,
      ...clampZoomTranslation(scale, translateX, translateY),
    });
    persistZoom(scale);
  }

  async function persistReaderMode(nextMode: ReaderMode): Promise<void> {
    if (!chapter) {
      return;
    }

    setReaderMode(nextMode);
    setReaderPreferences((current) => {
      const next = savePreferences({ ...current, defaultReaderMode: nextMode });
      return next;
    });
    const seriesRecord = await getSeries(chapter.seriesId);
    if (!seriesRecord) {
      return;
    }

    await putSeries({
      ...seriesRecord,
      preferredMode: nextMode,
      updatedAt: Date.now(),
    });
  }

  async function persistReadingDirection(
    nextDirection: ReadingDirection | "",
  ): Promise<void> {
    const preferences = getPreferences();
    const direction = nextDirection || preferences.defaultReadingDirection;
    setReadingDirectionOverride(nextDirection || undefined);
    setReadingDirection(direction);
    if (!chapter) {
      return;
    }

    const seriesRecord = await getSeries(chapter.seriesId);
    if (seriesRecord) {
      await putSeries({
        ...seriesRecord,
        preferredDirection: nextDirection || undefined,
        updatedAt: Date.now(),
      });
    }
  }

  async function toggleBookmark(): Promise<void> {
    if (!chapter || !chapterId || pages.length === 0) {
      return;
    }

    const decodedChapterId = decodeURIComponent(chapterId);
    try {
      const currentBookmark = bookmarks.find(
        (bookmark) => bookmark.pageIndex === currentIndex,
      );
      if (currentBookmark) {
        await deleteBookmark(currentBookmark.id);
        setBookmarks((current) =>
          current.filter((bookmark) => bookmark.id !== currentBookmark.id),
        );
        setBookmarkDrawerEntries((current) =>
          current.filter((entry) => entry.bookmark.id !== currentBookmark.id),
        );
      } else {
        const bookmark = await putBookmark({
          schemaVersion: SCHEMA_VERSION,
          chapterId: decodedChapterId,
          pageIndex: currentIndex,
          createdAt: Date.now(),
        });
        setBookmarks((current) => [...current, bookmark]);
      }
      setBookmarkError("");
    } catch {
      setBookmarkError("Could not update this bookmark.");
    }
  }

  async function openBookmarkDrawer(): Promise<void> {
    try {
      const records = await listBookmarks();
      const entries = await Promise.all(
        records.map(async (bookmark) => {
          const bookmarkChapter = await getChapter(bookmark.chapterId);
          if (!bookmarkChapter) return null;
          const bookmarkSeries = await getSeries(bookmarkChapter.seriesId);
          return {
            bookmark,
            chapterTitle: bookmarkChapter.title,
            seriesTitle: bookmarkSeries?.title ?? "Unknown series",
          };
        }),
      );
      setBookmarkDrawerEntries(
        entries
          .filter((entry) => entry !== null)
          .sort(
            (left, right) => right.bookmark.createdAt - left.bookmark.createdAt,
          ),
      );
      setIsBookmarkDrawerOpen(true);
    } catch {
      setBookmarkError("Could not load bookmarks.");
    }
  }

  async function saveBookmarkNote(
    bookmark: BookmarkRecord,
    note: string,
  ): Promise<void> {
    try {
      const updated = await putBookmark({ ...bookmark, note });
      setBookmarks((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setBookmarkDrawerEntries((current) =>
        current.map((entry) =>
          entry.bookmark.id === updated.id
            ? { ...entry, bookmark: updated }
            : entry,
        ),
      );
    } catch {
      setBookmarkError("Could not save the bookmark note.");
    }
  }

  async function removeBookmarkRecord(bookmark: BookmarkRecord): Promise<void> {
    try {
      await deleteBookmark(bookmark.id);
      setBookmarks((current) =>
        current.filter((entry) => entry.id !== bookmark.id),
      );
      setBookmarkDrawerEntries((current) =>
        current.filter((entry) => entry.bookmark.id !== bookmark.id),
      );
    } catch {
      setBookmarkError("Could not remove this bookmark.");
    }
  }

  function selectBookmark(bookmark: BookmarkRecord): void {
    setIsBookmarkDrawerOpen(false);
    if (bookmark.chapterId === chapter?.id) {
      selectReaderPage(bookmark.pageIndex);
      return;
    }
    navigate(`/read/${encodeURIComponent(bookmark.chapterId)}`, {
      state: { bookmarkPageIndex: bookmark.pageIndex },
    });
  }

  async function toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (readerRootRef.current?.requestFullscreen) {
        await readerRootRef.current.requestFullscreen();
      } else {
        setBookmarkError("Fullscreen is unavailable in this browser.");
      }
    } catch {
      setBookmarkError("Fullscreen is unavailable in this browser.");
    }
  }

  function revealReaderControls(): void {
    setIsUiVisible(true);
    if (chromeHideTimerRef.current !== undefined) {
      window.clearTimeout(chromeHideTimerRef.current);
      chromeHideTimerRef.current = undefined;
    }
    if (
      readerPreferences.readerAutoHide ||
      isImmersive ||
      isReaderSettingsOpen ||
      isPageGridOpen ||
      isContentsOpen
    ) {
      chromeHideTimerRef.current = window.setTimeout(
        () => setIsUiVisible(false),
        readerPreferences.readerAutoHideDelay,
      );
    }
  }

  function handleReaderClick(event: React.MouseEvent<HTMLElement>): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".readerChrome, [role='dialog']")) {
      revealReaderControls();
      return;
    }
    if (!target.closest(".readerViewport")) return;
    if (Date.now() < ignoreTapUntilRef.current) return;

    if (readerPreferences.readerTapBehavior === "controls") {
      revealReaderControls();
      return;
    }
    if (readerPreferences.readerTapBehavior === "toggle-controls") {
      if (isUiVisible) {
        if (chromeHideTimerRef.current !== undefined) {
          window.clearTimeout(chromeHideTimerRef.current);
          chromeHideTimerRef.current = undefined;
        }
        setIsUiVisible(false);
      } else {
        revealReaderControls();
      }
      return;
    }

    if (zoomLevel > 1) return;

    if (readerMode !== "flip" || isContinuousReader) {
      revealReaderControls();
      return;
    }

    const clientX = event.clientX;
    const activatePageTap = (): void => {
      const frame = viewerFrameRef.current;
      if (!frame) return;
      const horizontalPosition =
        (clientX - frame.getBoundingClientRect().left) /
        Math.max(1, frame.clientWidth);
      if (horizontalPosition < 0.3) {
        setCurrentPage((page) => Math.max(0, page - 1));
      } else if (horizontalPosition > 0.7) {
        setCurrentPage((page) => Math.min(pages.length - 1, page + 1));
      } else {
        revealReaderControls();
      }
    };

    if (lastPointerTypeRef.current === "touch") {
      if (pendingTapRef.current !== undefined) {
        window.clearTimeout(pendingTapRef.current);
      }
      pendingTapRef.current = window.setTimeout(() => {
        pendingTapRef.current = undefined;
        activatePageTap();
      }, 300);
    } else {
      activatePageTap();
    }
  }

  function handleReaderPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
  ): void {
    lastPointerTypeRef.current = event.pointerType;
    if (event.pointerType !== "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    if (pointerPositionsRef.current.size === 0) swipeStartRef.current = point;
    pointerPositionsRef.current.set(event.pointerId, point);
    if (pointerPositionsRef.current.size === 2) {
      swipeStartRef.current = null;
      const [first, second] = Array.from(pointerPositionsRef.current.values());
      pinchStartRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        transform: zoomTransform,
        midpointX: (first.x + second.x) / 2,
        midpointY: (first.y + second.y) / 2,
      };
    }
  }

  function handleReaderPointerMove(
    event: React.PointerEvent<HTMLDivElement>,
  ): void {
    const previous = pointerPositionsRef.current.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    const start = swipeStartRef.current;
    if (start && Math.hypot(point.x - start.x, point.y - start.y) > 14) {
      ignoreTapUntilRef.current = Date.now() + 500;
    }
    pointerPositionsRef.current.set(event.pointerId, point);

    if (pointerPositionsRef.current.size >= 2) {
      event.preventDefault();
      const [first, second] = Array.from(pointerPositionsRef.current.values());
      const start = pinchStartRef.current;
      if (start?.distance) {
        const frame = viewerFrameRef.current;
        const target = frame?.querySelector<HTMLElement>(
          "[data-reader-zoom-target]",
        );
        if (!frame || !target) return;

        const midpointX = (first.x + second.x) / 2;
        const midpointY = (first.y + second.y) / 2;
        const scale = Math.min(
          4,
          Math.max(
            1,
            start.transform.scale *
              (Math.hypot(second.x - first.x, second.y - first.y) /
                start.distance),
          ),
        );
        const frameRect = frame.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const baseLeft =
          targetRect.left - frameRect.left - zoomTransform.translateX;
        const baseTop =
          targetRect.top - frameRect.top - zoomTransform.translateY;
        const startFocalX = start.midpointX - frameRect.left - baseLeft;
        const startFocalY = start.midpointY - frameRect.top - baseTop;
        const currentFocalX = midpointX - frameRect.left - baseLeft;
        const currentFocalY = midpointY - frameRect.top - baseTop;
        const translateX =
          currentFocalX -
          (startFocalX - start.transform.translateX) *
            (scale / start.transform.scale);
        const translateY =
          currentFocalY -
          (startFocalY - start.transform.translateY) *
            (scale / start.transform.scale);
        setZoomTransform({
          scale,
          ...clampZoomTranslation(scale, translateX, translateY),
        });
        persistZoom(scale);
      }
      return;
    }

    const frame = viewerFrameRef.current;
    if (!frame) return;
    const deltaX = point.x - previous.x;
    const deltaY = point.y - previous.y;
    if (zoomLevel > 1) {
      event.preventDefault();
      setZoomTransform({
        scale: zoomLevel,
        ...clampZoomTranslation(
          zoomLevel,
          zoomTransform.translateX + deltaX,
          zoomTransform.translateY + deltaY,
        ),
      });
    } else if (readerMode === "flip") {
      event.preventDefault();
    }
  }

  function handleReaderPointerEnd(
    event: React.PointerEvent<HTMLDivElement>,
  ): void {
    if (!pointerPositionsRef.current.has(event.pointerId)) return;
    const start = swipeStartRef.current;
    const isTap =
      start !== null &&
      pointerPositionsRef.current.size === 1 &&
      !pinchStartRef.current &&
      Math.hypot(start.x - event.clientX, start.y - event.clientY) < 14;
    if (isTap) {
      const previousTap = lastTouchTapRef.current;
      if (
        previousTap &&
        Date.now() - previousTap.at < 300 &&
        Math.hypot(
          previousTap.x - event.clientX,
          previousTap.y - event.clientY,
        ) < 36
      ) {
        if (pendingTapRef.current !== undefined) {
          window.clearTimeout(pendingTapRef.current);
          pendingTapRef.current = undefined;
        }
        lastTouchTapRef.current = null;
        ignoreTapUntilRef.current = Date.now() + 500;
        zoomAtPoint(zoomLevel > 1 ? 1 : 2, event.clientX, event.clientY);
      } else {
        lastTouchTapRef.current = {
          at: Date.now(),
          x: event.clientX,
          y: event.clientY,
        };
      }
    }
    if (
      start &&
      pointerPositionsRef.current.size === 1 &&
      !pinchStartRef.current &&
      zoomLevel <= 1 &&
      readerMode === "flip" &&
      Math.abs(start.x - event.clientX) >= 48 &&
      Math.abs(start.x - event.clientX) > Math.abs(start.y - event.clientY)
    ) {
      const swipedLeft = event.clientX < start.x;
      const nextPage =
        swipedLeft === (readingDirection === "ltr")
          ? currentPage + 1
          : currentPage - 1;
      setCurrentPage(Math.min(Math.max(nextPage, 0), pages.length - 1));
    }
    pointerPositionsRef.current.delete(event.pointerId);
    if (pointerPositionsRef.current.size === 0) swipeStartRef.current = null;
    if (pointerPositionsRef.current.size < 2) pinchStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleReaderWheel(event: React.WheelEvent<HTMLDivElement>): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomAtPoint(
      zoomLevel + (event.deltaY < 0 ? 0.1 : -0.1),
      event.clientX,
      event.clientY,
    );
  }

  function setImmersiveMode(enabled: boolean): void {
    setIsImmersive(enabled);
    setIsUiVisible(!enabled);
    updateReaderPreferences({ immersiveMode: enabled });
  }

  function toggleImmersiveMode(): void {
    setImmersiveMode(!isImmersive);
  }

  function handleViewerScroll(event: React.UIEvent<HTMLDivElement>): void {
    if (readerMode === "novel") {
      const frame = event.currentTarget;
      const chapterElements = Array.from(
        frame.querySelectorAll<HTMLElement>("[data-novel-chapter-id]"),
      );
      if (chapterElements.length === 0) return;

      const frameTop = frame.getBoundingClientRect().top;
      let activeElement = chapterElements[0];
      for (const element of chapterElements) {
        if (element.getBoundingClientRect().top <= frameTop + 120) {
          activeElement = element;
        } else {
          break;
        }
      }

      const activeId = activeElement?.dataset.novelChapterId;
      if (!activeId) return;
      setActiveNovelChapterId(activeId);
      const chapterTop =
        activeElement.getBoundingClientRect().top - frameTop + frame.scrollTop;
      const scrollRatio = Math.min(
        1,
        Math.max(
          0,
          (frame.scrollTop - chapterTop) /
            Math.max(1, activeElement.scrollHeight),
        ),
      );
      novelScrollRatioRef.current = scrollRatio;

      const now = Date.now();
      if (now - novelProgressSavedAtRef.current >= 900) {
        novelProgressSavedAtRef.current = now;
        void putProgress({
          schemaVersion: 1,
          chapterId: activeId,
          pageIndex: 0,
          scrollRatio,
          updatedAt: now,
        });
      }
      return;
    }

    const readerPages = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "[data-reader-page-index]",
      ),
    );
    if (readerPages.length === 0) {
      return;
    }

    const viewportCenter =
      event.currentTarget.getBoundingClientRect().top +
      event.currentTarget.clientHeight / 2;
    let closestIndex = currentPage;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const readerPage of readerPages) {
      const pageCenter =
        readerPage.getBoundingClientRect().top +
        readerPage.getBoundingClientRect().height / 2;
      const distance = Math.abs(viewportCenter - pageCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = Number(readerPage.dataset.readerPageIndex);
      }
    }

    if (Number.isFinite(closestIndex) && closestIndex !== currentPage) {
      setCurrentPage(closestIndex);
    }

    if (
      readerMode === "webtoon" &&
      readerPreferences.comicInfiniteScroll &&
      chapter &&
      event.currentTarget.scrollHeight -
        event.currentTarget.scrollTop -
        event.currentTarget.clientHeight <=
        120
    ) {
      const currentChapterIndex = seriesChapters.findIndex(
        (entry) => entry.id === chapter.id,
      );
      const nextChapter = seriesChapters[currentChapterIndex + 1];
      if (nextChapter && autoAdvancedChapterRef.current !== chapter.id) {
        autoAdvancedChapterRef.current = chapter.id;
        navigate(`/read/${encodeURIComponent(nextChapter.id)}`);
      }
    }
  }

  function selectReaderPage(index: number): void {
    setCurrentPage(index);
    setIsPageGridOpen(false);
    viewerFrameRef.current
      ?.querySelector<HTMLElement>(`[data-reader-page-index="${index}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectNovelChapter(selectedChapter: Chapter): void {
    setIsContentsOpen(false);
    setContentsQuery("");
    navigate(`/read/${encodeURIComponent(selectedChapter.id)}`);
  }

  if (!chapter) {
    return (
      <main style={styles.page}>
        <section style={styles.panel}>
          <p style={styles.emptyText}>Chapter not found.</p>
          <Link to="/" style={styles.linkButton}>
            Back to library
          </Link>
        </section>
      </main>
    );
  }

  const totalPages = pages.length;
  const currentIndex = Math.min(Math.max(currentPage, 0), totalPages - 1);
  const isCurrentPageBookmarked = bookmarks.some(
    (bookmark) => bookmark.pageIndex === currentIndex,
  );
  const currentPageMime = pages[currentIndex]?.mime ?? "";
  const currentTextPage = pageTexts[currentIndex] ?? "";
  const isNovel = seriesType === "novel" || readerMode === "novel";
  const viewportWidth = viewportSize.width || 1280;
  const maxViewportReaderWidth = Math.min(
    Math.max(280, viewportWidth - 32),
    1800,
  );
  const minimumReaderWidth = Math.min(280, maxViewportReaderWidth);
  const normalizedReaderWidth = Math.min(
    Math.max(readerPreferences.readerWidth, minimumReaderWidth),
    maxViewportReaderWidth,
  );
  const textPages = pages
    .map((page, index) => ({ page, index, text: pageTexts[index] }))
    .filter(
      (entry) =>
        isTextMime(entry.page.mime) &&
        entry.text !== null &&
        entry.text !== undefined,
    );
  const hasImagePages = pages.some((page) => page.mime.startsWith("image/"));
  const isComicContinuous =
    readerMode === "webtoon" &&
    readerPreferences.comicInfiniteScroll &&
    hasImagePages;
  const isNovelContinuous =
    readerMode === "novel" &&
    readerPreferences.novelInfiniteScroll &&
    textPages.length > 0;
  const isContinuousReader = isComicContinuous || isNovelContinuous;
  const shouldAutoHideReaderChrome =
    readerPreferences.readerAutoHide || isImmersive;
  const modeOptions: Array<{ value: ReaderMode; label: string }> = isNovel
    ? [
        { value: "novel", label: "Text" },
        { value: "flip", label: "Pages" },
      ]
    : [
        { value: "flip", label: "Paginated" },
        { value: "webtoon", label: "Web" },
      ];
  const activeNovelChapter =
    seriesChapters.find((entry) => entry.id === activeNovelChapterId) ??
    chapter;
  const selectedNovelTheme =
    NOVEL_THEME_OPTIONS.find(
      (option) => option.value === readerPreferences.novelReadingTheme,
    ) ?? NOVEL_THEME_OPTIONS[0];
  const selectedNovelFont =
    NOVEL_FONT_OPTIONS.find(
      (option) => option.value === readerPreferences.novelFontFamily,
    ) ?? NOVEL_FONT_OPTIONS[0];
  const novelTextStyle: React.CSSProperties = {
    ...styles.novelTextContent,
    width: "100%",
    maxWidth:
      readerPreferences.novelColumnWidth === "full"
        ? "100%"
        : NOVEL_COLUMN_WIDTHS[readerPreferences.novelColumnWidth],
    margin: "0 auto",
    padding: "clamp(28px, 6vw, 72px) clamp(20px, 5vw, 64px)",
    fontFamily: selectedNovelFont.font,
    fontSize: `${readerPreferences.novelFontSize}px`,
    lineHeight: readerPreferences.novelLineSpacing,
    textAlign: readerPreferences.novelTextAlignment,
    color: selectedNovelTheme.color,
    "--novel-paragraph-indent": readerPreferences.novelParagraphIndent
      ? "1.5em"
      : "0",
    "--novel-paragraph-gap": `${readerPreferences.novelParagraphGap}px`,
  } as React.CSSProperties;
  const novelColumnLabel =
    readerPreferences.novelColumnWidth === "full"
      ? "100%"
      : `${Math.min(
          NOVEL_COLUMN_WIDTHS[readerPreferences.novelColumnWidth],
          Math.max(0, viewportSize.width - 48),
        )}px`;
  const filteredContentsChapters = seriesChapters.filter((entry) =>
    entry.title.toLocaleLowerCase().includes(contentsQuery.toLocaleLowerCase()),
  );
  const navigationChapterId =
    isNovel && activeNovelChapter ? activeNovelChapter.id : chapter.id;
  const chapterPosition = seriesChapters.findIndex(
    (entry) => entry.id === navigationChapterId,
  );
  const previousChapter =
    chapterPosition > 0 ? seriesChapters[chapterPosition - 1] : undefined;
  const nextChapter =
    chapterPosition >= 0 ? seriesChapters[chapterPosition + 1] : undefined;
  const pageProgress =
    totalPages > 0 ? ((currentIndex + 1) / totalPages) * 100 : 0;
  const comicPageImageStyle = (
    isCurrentPage: boolean,
    isContinuous: boolean,
  ): React.CSSProperties => {
    const fitWidth = Math.min(normalizedReaderWidth, viewportWidth);
    const baseStyle = isContinuous ? styles.webtoonImage : styles.image;
    const filter = `brightness(${readerPreferences.comicBrightness}%) contrast(${readerPreferences.comicContrast}%) invert(${readerPreferences.comicInvert}%) sepia(${readerPreferences.comicSepia}%)`;
    const transformStyle: React.CSSProperties = {
      transform: `translate3d(${zoomTransform.translateX}px, ${zoomTransform.translateY}px, 0) scale(${zoomTransform.scale})`,
      transformOrigin: "0 0",
    };
    if (isContinuous) {
      return {
        ...baseStyle,
        filter,
        width: `${fitWidth}px`,
        height: "auto",
        maxWidth: "none",
        maxHeight: "none",
      };
    }

    return {
      ...baseStyle,
      filter,
      width: "auto",
      height: "auto",
      maxWidth: `${fitWidth}px`,
      maxHeight: `${viewportSize.height}px`,
      ...(isCurrentPage ? transformStyle : {}),
    };
  };
  return (
    <main
      ref={readerRootRef}
      className={`readerPageRoot${isImmersive ? " readerFocusActive" : ""}`}
      onClickCapture={handleReaderClick}
      style={styles.page}
    >
      <section style={styles.panel}>
        <header
          className={`readerChrome readerHeader${shouldAutoHideReaderChrome && !isUiVisible ? " readerChromeHidden" : ""}`}
          style={{
            ...styles.headerRow,
            ...(isImmersive ? styles.headerRowImmersive : {}),
          }}
        >
          <div
            className="readerTitleGroup flex items-center gap-3"
            style={styles.readerTitleGroup}
          >
            <Link
              to={`/series/${encodeURIComponent(chapter.seriesId)}`}
              className="backLink"
              style={styles.backLink}
            >
              <ArrowLeft size={15} /> Library
            </Link>
            <h1 className="title" style={styles.title}>
              {isNovel ? activeNovelChapter?.title : chapter.title}
            </h1>
          </div>
          <div className="actionRow" style={styles.actionRow}>
            <div className="readerChapterPicker">
              <BookOpen
                className="readerChapterPickerIcon"
                size={15}
                aria-hidden="true"
              />
              <label className="srOnly" htmlFor="reader-chapter-select">
                Chapter
              </label>
              <select
                id="reader-chapter-select"
                className="readerChapterSelect"
                aria-label="Chapter"
                value={navigationChapterId}
                onChange={(event) =>
                  navigate(
                    `/read/${encodeURIComponent(event.currentTarget.value)}`,
                  )
                }
                style={styles.chapterSelect}
              >
                {seriesChapters.map((seriesChapter) => (
                  <option key={seriesChapter.id} value={seriesChapter.id}>
                    {seriesChapter.title}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="readerHeaderQuickActions"
              role="group"
              aria-label="Reader shortcuts"
            >
              <button
                type="button"
                className="readerHeaderQuickButton"
                aria-label={
                  isCurrentPageBookmarked
                    ? "Remove page bookmark"
                    : "Bookmark current page"
                }
                aria-pressed={isCurrentPageBookmarked}
                title={
                  isCurrentPageBookmarked
                    ? "Remove page bookmark"
                    : "Bookmark current page"
                }
                onClick={() => void toggleBookmark()}
                style={{
                  ...styles.iconButton,
                  ...(isCurrentPageBookmarked
                    ? styles.activeBookmarkButton
                    : {}),
                }}
              >
                <Bookmark
                  size={16}
                  fill={isCurrentPageBookmarked ? "currentColor" : "none"}
                />
              </button>
              <button
                type="button"
                className="readerHeaderQuickButton"
                aria-label="Open bookmarks"
                aria-pressed={isBookmarkDrawerOpen}
                title="Open bookmarks"
                onClick={() => void openBookmarkDrawer()}
                style={styles.iconButton}
              >
                <BookmarkCheck size={16} />
              </button>
              {isNovel ? (
                <button
                  type="button"
                  className="readerHeaderQuickButton"
                  aria-label="Table of contents"
                  aria-pressed={isContentsOpen}
                  title="Table of contents"
                  onClick={() => setIsContentsOpen(true)}
                  style={styles.iconButton}
                >
                  <List size={16} />
                </button>
              ) : null}
              {!isNovel ? (
                <button
                  type="button"
                  className="readerHeaderQuickButton"
                  aria-label="Open page overview"
                  aria-pressed={isPageGridOpen}
                  title="Page overview"
                  onClick={() => setIsPageGridOpen(true)}
                  style={styles.iconButton}
                >
                  <Grid2X2 size={16} />
                </button>
              ) : null}
              <button
                type="button"
                className="readerHeaderQuickButton"
                aria-label={isNovel ? "Reader formatting" : "Reader settings"}
                aria-pressed={isReaderSettingsOpen}
                title={isNovel ? "Reader formatting" : "Reader settings"}
                onClick={() => setIsReaderSettingsOpen(true)}
                style={styles.iconButton}
              >
                {isNovel ? <Type size={16} /> : <Settings2 size={16} />}
              </button>
              <button
                type="button"
                className="readerHeaderQuickButton"
                aria-label={isImmersive ? "Exit focus mode" : "Focus mode"}
                aria-pressed={isImmersive}
                title={
                  isImmersive
                    ? "Exit focus mode"
                    : "Focus mode hides controls until you tap"
                }
                onClick={toggleImmersiveMode}
                style={styles.iconButton}
              >
                {isImmersive ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              type="button"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              onClick={() => void toggleFullscreen()}
              style={styles.iconButton}
            >
              {isFullscreen ? <Minimize2 size={17} /> : <Expand size={17} />}
            </button>
          </div>
        </header>

        {!isNovel ? (
          <div
            className={`readerChrome readerProgress${readerPreferences.readerProgressPosition === "bottom" ? " readerProgressBottom" : ""}${shouldAutoHideReaderChrome && !isUiVisible ? " readerChromeHidden" : ""}`}
            style={{
              ...styles.readerProgressTrack,
              ...(isImmersive ? styles.readerProgressTrackImmersive : {}),
            }}
            role="progressbar"
            aria-label="Page progress"
            aria-valuemin={0}
            aria-valuemax={Math.max(totalPages, 1)}
            aria-valuenow={totalPages > 0 ? currentIndex + 1 : 0}
          >
            <span
              style={{
                ...styles.readerProgressFill,
                width: `${pageProgress}%`,
              }}
            />
          </div>
        ) : null}

        {!isNovel && shouldAutoHideReaderChrome && !isUiVisible ? (
          <div
            className={`readerHiddenProgress${readerPreferences.readerProgressPosition === "bottom" ? " readerHiddenProgressBottom" : ""}`}
          >
            <span className="readerHiddenProgressPercent">
              {Math.round(pageProgress)}%
            </span>
            <span
              className="readerHiddenProgressTrack"
              role="progressbar"
              aria-label="Page progress"
              aria-valuemin={0}
              aria-valuemax={Math.max(totalPages, 1)}
              aria-valuenow={totalPages > 0 ? currentIndex + 1 : 0}
            >
              <span style={{ width: `${pageProgress}%` }} />
            </span>
            <span className="readerHiddenProgressCount">
              {currentIndex + 1}/{totalPages || 1}
            </span>
          </div>
        ) : null}

        <div
          className={`readerChrome readerToolbar${shouldAutoHideReaderChrome && !isUiVisible ? " readerChromeHidden" : ""}`}
        >
          <div className="readerToolbarMain">
            <div style={styles.chapterNav}>
              <button
                type="button"
                aria-label="Previous chapter"
                disabled={!previousChapter}
                onClick={() => {
                  if (previousChapter) {
                    navigate(`/read/${encodeURIComponent(previousChapter.id)}`);
                  }
                }}
                style={styles.chapterNavButton}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={styles.chapterNavLabel}>
                {chapterPosition >= 0 ? chapterPosition + 1 : 1} /{" "}
                {seriesChapters.length || 1}
              </span>
              <button
                type="button"
                aria-label="Next chapter"
                disabled={!nextChapter}
                onClick={() => {
                  if (nextChapter) {
                    navigate(`/read/${encodeURIComponent(nextChapter.id)}`);
                  }
                }}
                style={styles.chapterNavButton}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {!isNovel ? (
              <div className="readerModeButtons" style={styles.modeButtons}>
                {modeOptions.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    aria-label={`Switch to ${mode.label} mode`}
                    aria-pressed={readerMode === mode.value}
                    title={mode.label}
                    onClick={() => void persistReaderMode(mode.value)}
                    style={{
                      ...styles.modeButton,
                      ...(readerMode === mode.value
                        ? styles.activeModeButton
                        : {}),
                    }}
                  >
                    {mode.value === "flip" ? (
                      <BookOpen size={16} />
                    ) : (
                      <PanelsTopLeft size={16} />
                    )}
                    <span className="readerModeLabel">{mode.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="readerToolbarTools">
            {!isNovel ? (
              <input
                type="range"
                aria-label="Page position"
                min={0}
                max={Math.max(totalPages - 1, 0)}
                value={Math.max(currentIndex, 0)}
                disabled={totalPages <= 1}
                onChange={(event) =>
                  selectReaderPage(Number(event.currentTarget.value))
                }
                className="readerPageScrubber"
                style={styles.pageScrubber}
              />
            ) : null}

            {!isNovel && currentPageMime.startsWith("image/") ? (
              <div
                style={styles.zoomControls}
                className="readerZoomControls"
                role="group"
                aria-label={
                  isContinuousReader ? "Continuous pages zoom" : "Page zoom"
                }
              >
                <button
                  type="button"
                  aria-label="Zoom out"
                  title="Zoom out"
                  disabled={zoomLevel <= 1}
                  onClick={() => changeZoom(zoomLevel - 0.25)}
                  style={styles.bookmarkButton}
                >
                  <Minus size={15} />
                </button>
                <span style={styles.pageIndicator}>
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  type="button"
                  aria-label="Zoom in"
                  title="Zoom in"
                  disabled={zoomLevel >= 4}
                  onClick={() => changeZoom(zoomLevel + 0.25)}
                  style={styles.bookmarkButton}
                >
                  <Plus size={15} />
                </button>
                <button
                  type="button"
                  aria-label="Reset zoom"
                  title="Reset zoom"
                  onClick={() => {
                    changeZoom(1);
                    viewerFrameRef.current?.scrollTo({
                      top: 0,
                      left: 0,
                      behavior: "smooth",
                    });
                  }}
                  className="readerIconButton"
                  style={styles.bookmarkButton}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            ) : null}
          </div>

          <div className="readerPageControls">
            {!isContinuousReader && !isNovel ? (
              <>
                <button
                  type="button"
                  aria-label="Previous page"
                  onClick={() =>
                    setCurrentPage((previous) => Math.max(previous - 1, 0))
                  }
                  disabled={currentIndex === 0}
                  style={{
                    ...styles.navButton,
                    opacity: currentIndex === 0 ? 0.45 : 1,
                  }}
                >
                  <ChevronLeft size={16} />
                  <span className="readerButtonLabel">Previous page</span>
                </button>
                <span style={styles.pageIndicator}>
                  {currentIndex + 1} / {totalPages || 1}
                </span>
                <button
                  type="button"
                  aria-label="Next page"
                  onClick={() =>
                    setCurrentPage((previous) =>
                      Math.min(previous + 1, totalPages - 1),
                    )
                  }
                  disabled={totalPages === 0 || currentIndex >= totalPages - 1}
                  style={{
                    ...styles.navButton,
                    opacity:
                      totalPages === 0 || currentIndex >= totalPages - 1
                        ? 0.45
                        : 1,
                  }}
                >
                  <span className="readerButtonLabel">Next page</span>
                  <ChevronRight size={16} />
                </button>
              </>
            ) : (
              <span style={styles.pageIndicator}>
                {isNovel
                  ? `${chapterPosition + 1} / ${seriesChapters.length || 1} chapters`
                  : `Page ${currentIndex + 1} / ${totalPages || 1}`}
              </span>
            )}
          </div>
        </div>

        {bookmarkError ? (
          <p role="alert" style={styles.errorText}>
            {bookmarkError}
          </p>
        ) : null}

        {isReaderSettingsOpen ? (
          <div
            style={styles.settingsOverlay}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setIsReaderSettingsOpen(false);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsReaderSettingsOpen(false);
            }}
          >
            <div
              style={{
                ...styles.settingsPanel,
                width: isNovel ? "min(520px, 100vw)" : "min(440px, 100vw)",
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                left: "auto",
                transform: "none",
              }}
              className="readerSettingsPanel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reader-settings-title"
            >
              <header style={styles.settingsHeader}>
                <div style={styles.settingsTitleWrap}>
                  <span style={styles.settingsIcon}>
                    {isNovel ? <Type size={17} /> : <Settings2 size={17} />}
                  </span>
                  <div>
                    <h2 id="reader-settings-title" style={styles.settingsTitle}>
                      {isNovel
                        ? "Reading Atmosphere & Typography"
                        : "Reader Settings"}
                    </h2>
                    <p style={styles.settingsSubtitle}>
                      {isNovel
                        ? "Tune the page to your reading comfort."
                        : "Tune page scale, flow, and navigation."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close settings"
                  onClick={() => setIsReaderSettingsOpen(false)}
                  style={styles.settingsCloseButton}
                >
                  <X size={17} />
                </button>
              </header>

              {isNovel ? (
                <div
                  className="readerSettingsSection"
                  style={styles.settingsSection}
                >
                  <section style={styles.novelSettingGroup}>
                    <span style={styles.novelSettingLabel}>Color theme</span>
                    <div style={styles.novelThemeRow}>
                      {NOVEL_THEME_OPTIONS.map((theme) => (
                        <button
                          key={theme.value}
                          type="button"
                          aria-label={theme.label}
                          aria-pressed={
                            readerPreferences.novelReadingTheme === theme.value
                          }
                          title={theme.label}
                          onClick={() =>
                            updateReaderPreferences({
                              novelReadingTheme: theme.value,
                            })
                          }
                          style={{
                            ...styles.novelThemeSwatch,
                            background: theme.swatch,
                            ...(readerPreferences.novelReadingTheme ===
                            theme.value
                              ? styles.novelThemeSwatchActive
                              : {}),
                          }}
                        >
                          {readerPreferences.novelReadingTheme === theme.value
                            ? "✓"
                            : null}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section style={styles.novelSettingGroup}>
                    <span style={styles.novelSettingLabel}>Font family</span>
                    <div style={styles.novelFontGrid}>
                      {NOVEL_FONT_OPTIONS.map((font) => (
                        <button
                          key={font.value}
                          type="button"
                          aria-pressed={
                            readerPreferences.novelFontFamily === font.value
                          }
                          onClick={() =>
                            updateReaderPreferences({
                              novelFontFamily: font.value,
                            })
                          }
                          style={{
                            ...styles.novelFontButton,
                            fontFamily: font.font,
                            ...(readerPreferences.novelFontFamily === font.value
                              ? styles.novelControlActive
                              : {}),
                          }}
                        >
                          {font.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section style={styles.novelSettingGroup}>
                    <div style={styles.novelControlHeader}>
                      <span style={styles.novelSettingLabel}>Font size</span>
                      <output>{readerPreferences.novelFontSize}px</output>
                    </div>
                    <div style={styles.novelSizeRow}>
                      <button
                        type="button"
                        aria-label="Decrease font size"
                        disabled={readerPreferences.novelFontSize <= 14}
                        style={styles.novelSizeButton}
                        onClick={() =>
                          updateReaderPreferences({
                            novelFontSize: readerPreferences.novelFontSize - 1,
                          })
                        }
                      >
                        <Minus size={15} />
                      </button>
                      <input
                        aria-label="Novel font size"
                        type="range"
                        min={14}
                        max={30}
                        value={readerPreferences.novelFontSize}
                        onChange={(event) =>
                          updateReaderPreferences({
                            novelFontSize: Number(event.currentTarget.value),
                          })
                        }
                        style={styles.novelFontRange}
                      />
                      <button
                        type="button"
                        aria-label="Increase font size"
                        disabled={readerPreferences.novelFontSize >= 30}
                        style={styles.novelSizeButton}
                        onClick={() =>
                          updateReaderPreferences({
                            novelFontSize: readerPreferences.novelFontSize + 1,
                          })
                        }
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </section>

                  <div style={styles.novelControlGrid}>
                    <section style={styles.novelSettingGroup}>
                      <span style={styles.novelSettingLabel}>Line spacing</span>
                      <div style={styles.novelSegmentRow}>
                        {[1.5, 1.8, 2.1].map((spacing) => (
                          <button
                            key={spacing}
                            type="button"
                            aria-pressed={
                              readerPreferences.novelLineSpacing === spacing
                            }
                            style={{
                              ...styles.novelSegmentButton,
                              ...(readerPreferences.novelLineSpacing === spacing
                                ? styles.novelControlActive
                                : {}),
                            }}
                            onClick={() =>
                              updateReaderPreferences({
                                novelLineSpacing: spacing,
                              })
                            }
                          >
                            {spacing}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section style={styles.novelSettingGroup}>
                      <span style={styles.novelSettingLabel}>Alignment</span>
                      <div style={styles.novelSegmentRow}>
                        <button
                          type="button"
                          aria-label="Align text left"
                          aria-pressed={
                            readerPreferences.novelTextAlignment === "left"
                          }
                          style={{
                            ...styles.novelSegmentButton,
                            ...(readerPreferences.novelTextAlignment === "left"
                              ? styles.novelControlActive
                              : {}),
                          }}
                          onClick={() =>
                            updateReaderPreferences({
                              novelTextAlignment: "left",
                            })
                          }
                        >
                          <AlignLeft size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label="Justify text"
                          aria-pressed={
                            readerPreferences.novelTextAlignment === "justify"
                          }
                          style={{
                            ...styles.novelSegmentButton,
                            ...(readerPreferences.novelTextAlignment ===
                            "justify"
                              ? styles.novelControlActive
                              : {}),
                          }}
                          onClick={() =>
                            updateReaderPreferences({
                              novelTextAlignment: "justify",
                            })
                          }
                        >
                          <AlignJustify size={15} />
                        </button>
                      </div>
                    </section>
                    <label style={styles.novelSettingGroup}>
                      <span style={styles.novelSettingLabel}>
                        Paragraph indent
                      </span>
                      <select
                        aria-label="Paragraph indentation"
                        value={
                          readerPreferences.novelParagraphIndent ? "on" : "off"
                        }
                        onChange={(event) =>
                          updateReaderPreferences({
                            novelParagraphIndent:
                              event.currentTarget.value === "on",
                          })
                        }
                        style={styles.settingsSelect}
                      >
                        <option value="off">None</option>
                        <option value="on">Indented</option>
                      </select>
                    </label>
                    <section style={styles.novelSettingGroup}>
                      <span style={styles.novelSettingLabel}>
                        Paragraph gap
                      </span>
                      <div style={styles.novelSegmentRow}>
                        {[
                          { value: 0, label: "None" },
                          { value: 16, label: "Normal" },
                          { value: 28, label: "Open" },
                        ].map((gap) => (
                          <button
                            key={gap.value}
                            type="button"
                            aria-pressed={
                              readerPreferences.novelParagraphGap === gap.value
                            }
                            style={{
                              ...styles.novelSegmentButton,
                              ...(readerPreferences.novelParagraphGap ===
                              gap.value
                                ? styles.novelControlActive
                                : {}),
                            }}
                            onClick={() =>
                              updateReaderPreferences({
                                novelParagraphGap: gap.value,
                              })
                            }
                          >
                            {gap.label}
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>

                  <section style={styles.novelSettingGroup}>
                    <div style={styles.novelControlHeader}>
                      <span style={styles.novelSettingLabel}>Column width</span>
                      <output>{novelColumnLabel}</output>
                    </div>
                    <div style={styles.novelSegmentRow}>
                      {[
                        { value: "narrow", label: "Narrow" },
                        { value: "standard", label: "Standard" },
                        { value: "wide", label: "Wide" },
                        { value: "full", label: "100%" },
                      ].map((width) => (
                        <button
                          key={width.value}
                          type="button"
                          aria-pressed={
                            readerPreferences.novelColumnWidth === width.value
                          }
                          style={{
                            ...styles.novelSegmentButton,
                            ...(readerPreferences.novelColumnWidth ===
                            width.value
                              ? styles.novelControlActive
                              : {}),
                          }}
                          onClick={() =>
                            updateReaderPreferences({
                              novelColumnWidth:
                                width.value as Preferences["novelColumnWidth"],
                            })
                          }
                        >
                          {width.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section style={styles.novelFlowSection}>
                    <div style={styles.novelControlHeader}>
                      <span style={styles.novelSettingLabel}>Chapter flow</span>
                      <span style={styles.novelFlowBadge}>
                        {readerPreferences.novelInfiniteScroll
                          ? "INFINITE SCROLL"
                          : "SINGLE CHAPTER"}
                      </span>
                    </div>
                    <div style={styles.settingsRowTwo}>
                      {[true, false].map((infinite) => (
                        <button
                          key={String(infinite)}
                          type="button"
                          aria-pressed={
                            readerPreferences.novelInfiniteScroll === infinite
                          }
                          style={{
                            ...styles.readerModeCard,
                            ...(readerPreferences.novelInfiniteScroll ===
                            infinite
                              ? styles.readerModeCardActive
                              : {}),
                          }}
                          onClick={() =>
                            updateReaderPreferences({
                              novelInfiniteScroll: infinite,
                            })
                          }
                        >
                          <span style={styles.readerModeTitle}>
                            {infinite ? "∞ Infinite Scroll" : "Single Chapter"}
                          </span>
                          <span style={styles.readerModeBody}>
                            {infinite
                              ? "Read the book as one continuous stream."
                              : "Stop at chapter ends and choose when to continue."}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div
                  className="readerSettingsSection"
                  style={styles.settingsSection}
                >
                  <h3 className="readerSettingsGroupTitle">Reading</h3>
                  <div style={styles.settingsRowTwo}>
                    {modeOptions.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => {
                          void persistReaderMode(mode.value);
                          setIsReaderSettingsOpen(false);
                        }}
                        style={{
                          ...styles.readerModeCard,
                          ...(readerMode === mode.value
                            ? styles.readerModeCardActive
                            : {}),
                        }}
                      >
                        <span style={styles.readerModeTitle}>{mode.label}</span>
                        <span style={styles.readerModeBody}>
                          {mode.value === "flip"
                            ? "Classic page-flip layout for single-page reading and large spreads."
                            : "Vertical continuous layout tuned for comic and webtoon reading."}
                        </span>
                      </button>
                    ))}
                  </div>

                  <h3 className="readerSettingsGroupTitle">Controls</h3>
                  <label style={styles.settingsToggleRow}>
                    <div>
                      <div style={styles.settingsToggleHeading}>Focus mode</div>
                      <p style={styles.settingsToggleBody}>
                        Hide the reader controls for an unobstructed page. Tap
                        once to reveal them temporarily.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      aria-label="Focus mode"
                      checked={readerPreferences.immersiveMode}
                      onChange={(event) =>
                        setImmersiveMode(event.currentTarget.checked)
                      }
                      style={styles.settingsToggleInput}
                    />
                  </label>
                  <label style={styles.settingsDirectionRow}>
                    <span style={styles.settingsSliderLabel}>
                      Progress bar position
                    </span>
                    <select
                      aria-label="Progress bar position"
                      value={readerPreferences.readerProgressPosition}
                      onChange={(event) =>
                        updateReaderPreferences({
                          readerProgressPosition: event.currentTarget
                            .value as Preferences["readerProgressPosition"],
                        })
                      }
                      style={styles.settingsSelect}
                    >
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </label>
                  <label style={styles.settingsToggleRow}>
                    <div>
                      <div style={styles.settingsToggleHeading}>
                        Hide controls while reading
                      </div>
                      <p style={styles.settingsToggleBody}>
                        Scrolling keeps the dock hidden. Tapping reveals it,
                        then it fades after a pause.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={readerPreferences.readerAutoHide}
                      onChange={(event) =>
                        updateReaderPreferences({
                          readerAutoHide: event.currentTarget.checked,
                        })
                      }
                      style={styles.settingsToggleInput}
                    />
                  </label>

                  <label style={styles.settingsDirectionRow}>
                    <span style={styles.settingsSliderLabel}>
                      Hide controls after
                    </span>
                    <select
                      aria-label="Reader controls hide delay"
                      value={readerPreferences.readerAutoHideDelay}
                      onChange={(event) =>
                        updateReaderPreferences({
                          readerAutoHideDelay: Number(
                            event.currentTarget.value,
                          ),
                        })
                      }
                      style={styles.settingsSelect}
                    >
                      <option value={1500}>1.5 seconds</option>
                      <option value={2500}>2.5 seconds</option>
                      <option value={4000}>4 seconds</option>
                      <option value={6000}>6 seconds</option>
                    </select>
                  </label>

                  <label style={styles.settingsDirectionRow}>
                    <span style={styles.settingsSliderLabel}>Tap behavior</span>
                    <select
                      aria-label="Reader tap behavior"
                      value={readerPreferences.readerTapBehavior}
                      onChange={(event) =>
                        updateReaderPreferences({
                          readerTapBehavior: event.currentTarget
                            .value as Preferences["readerTapBehavior"],
                        })
                      }
                      style={styles.settingsSelect}
                    >
                      <option value="controls">Tap to reveal controls</option>
                      <option value="toggle-controls">
                        Tap to toggle controls
                      </option>
                      <option value="page-turn">Tap page edges to turn</option>
                    </select>
                  </label>

                  <h3 className="readerSettingsGroupTitle">Page display</h3>
                  <label style={styles.settingsToggleRow}>
                    <div>
                      <div style={styles.settingsToggleHeading}>
                        Prevent zooming out
                      </div>
                      <p style={styles.settingsToggleBody}>
                        Keep pages at 100% scale or larger. Reset zoom returns
                        to 100%.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      aria-label="Prevent zooming below 100 percent"
                      checked={readerPreferences.disableZoomOut}
                      onChange={(event) => {
                        const disabled = event.currentTarget.checked;
                        updateReaderPreferences({ disableZoomOut: disabled });
                        if (disabled && zoomLevel < 1) changeZoom(1);
                      }}
                      style={styles.settingsToggleInput}
                    />
                  </label>

                  <div style={styles.settingsSliderRow}>
                    <span style={styles.settingsSliderLabel}>Page width</span>
                    <output style={styles.settingsSliderValue}>
                      {normalizedReaderWidth}px
                    </output>
                    <input
                      aria-label="Page width in pixels"
                      type="range"
                      min={minimumReaderWidth}
                      max={maxViewportReaderWidth}
                      step={1}
                      value={normalizedReaderWidth}
                      onChange={(event) =>
                        updateReaderPreferences({
                          readerWidth: Number(event.currentTarget.value),
                        })
                      }
                      style={styles.settingsRange}
                    />
                    <span style={styles.settingsHint}>
                      Drag to set the maximum page width.
                    </span>
                  </div>

                  <div style={styles.settingsSliderRow}>
                    <label
                      htmlFor="reader-page-gap"
                      style={styles.settingsSliderLabel}
                    >
                      Page Gap
                    </label>
                    <output
                      htmlFor="reader-page-gap"
                      style={styles.settingsSliderValue}
                    >
                      {readerPreferences.comicPageGap}px
                    </output>
                    <input
                      id="reader-page-gap"
                      aria-label="Gap between comic pages"
                      type="range"
                      min={0}
                      max={32}
                      step={2}
                      value={readerPreferences.comicPageGap}
                      disabled={!isComicContinuous}
                      onChange={(event) =>
                        updateReaderPreferences({
                          comicPageGap: Number(event.currentTarget.value),
                        })
                      }
                      style={styles.settingsRange}
                    />
                    <span style={styles.settingsHint}>
                      Space between pages in continuous scroll mode
                    </span>
                  </div>

                  <h3 className="readerSettingsGroupTitle">
                    Image adjustments
                  </h3>
                  {[
                    {
                      id: "comic-brightness",
                      label: "Brightness",
                      value: readerPreferences.comicBrightness,
                      min: 50,
                      max: 150,
                      step: 5,
                      key: "comicBrightness",
                    },
                    {
                      id: "comic-contrast",
                      label: "Contrast",
                      value: readerPreferences.comicContrast,
                      min: 50,
                      max: 150,
                      step: 5,
                      key: "comicContrast",
                    },
                    {
                      id: "comic-invert",
                      label: "Invert",
                      value: readerPreferences.comicInvert,
                      min: 0,
                      max: 100,
                      step: 5,
                      key: "comicInvert",
                    },
                    {
                      id: "comic-sepia",
                      label: "Sepia",
                      value: readerPreferences.comicSepia,
                      min: 0,
                      max: 100,
                      step: 5,
                      key: "comicSepia",
                    },
                  ].map((adjustment) => (
                    <div key={adjustment.id} style={styles.settingsSliderRow}>
                      <label
                        htmlFor={adjustment.id}
                        style={styles.settingsSliderLabel}
                      >
                        {adjustment.label}
                      </label>
                      <output
                        htmlFor={adjustment.id}
                        style={styles.settingsSliderValue}
                      >
                        {adjustment.value}%
                      </output>
                      <input
                        id={adjustment.id}
                        aria-label={`Comic image ${adjustment.label.toLowerCase()}`}
                        type="range"
                        min={adjustment.min}
                        max={adjustment.max}
                        step={adjustment.step}
                        value={adjustment.value}
                        onChange={(event) =>
                          updateReaderPreferences({
                            [adjustment.key]: Number(event.currentTarget.value),
                          })
                        }
                        style={styles.settingsRange}
                      />
                    </div>
                  ))}

                  <label style={styles.settingsDirectionRow}>
                    <span style={styles.settingsSliderLabel}>
                      Reading Direction
                    </span>
                    <select
                      aria-label="Series reading direction"
                      value={readingDirectionOverride ?? ""}
                      onChange={(event) =>
                        void persistReadingDirection(
                          event.currentTarget.value as ReadingDirection | "",
                        )
                      }
                      style={styles.settingsSelect}
                    >
                      <option value="">Use Global Settings</option>
                      <option value="ltr">Left to Right</option>
                      <option value="rtl">Right to Left</option>
                    </select>
                  </label>

                  <label style={styles.settingsToggleRow}>
                    <div>
                      <div style={styles.settingsToggleHeading}>
                        Continuous Scroll
                        <span style={styles.settingsPill}>DEFAULT</span>
                      </div>
                      <p style={styles.settingsToggleBody}>
                        Keep the reading strip flowing vertically with a smooth,
                        uninterrupted comic experience.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={readerPreferences.comicInfiniteScroll}
                      onChange={(event) =>
                        updateReaderPreferences({
                          comicInfiniteScroll: event.currentTarget.checked,
                        })
                      }
                      style={styles.settingsToggleInput}
                    />
                  </label>

                  <label style={styles.settingsToggleRow}>
                    <div>
                      <div style={styles.settingsToggleHeading}>
                        Text Flow
                        <span style={styles.settingsPill}>OPTIONAL</span>
                      </div>
                      <p style={styles.settingsToggleBody}>
                        Use a continuous text layout for longer reading sessions
                        and uninterrupted page flow.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={readerPreferences.novelInfiniteScroll}
                      onChange={(event) =>
                        updateReaderPreferences({
                          novelInfiniteScroll: event.currentTarget.checked,
                        })
                      }
                      style={styles.settingsToggleInput}
                    />
                  </label>

                  <div style={styles.settingsInfoBar}>
                    Current mode: <strong>{readerMode}</strong> — reading layout
                    stays tuned to the active chapter and viewport.
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {isContentsOpen ? (
          <div
            style={styles.contentsOverlay}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget)
                setIsContentsOpen(false);
            }}
          >
            <section
              style={styles.contentsPanel}
              role="dialog"
              aria-modal="true"
              aria-labelledby="novel-contents-title"
            >
              <header style={styles.contentsHeader}>
                <div>
                  <h2 id="novel-contents-title" style={styles.settingsTitle}>
                    <List size={20} /> Table of Contents
                  </h2>
                  <p style={styles.settingsSubtitle}>
                    {seriesChapters.length} total chapters
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close table of contents"
                  style={styles.settingsCloseButton}
                  onClick={() => setIsContentsOpen(false)}
                >
                  <X size={17} />
                </button>
              </header>
              <label style={styles.contentsSearch}>
                <Search size={16} />
                <input
                  aria-label="Search chapters"
                  value={contentsQuery}
                  onChange={(event) =>
                    setContentsQuery(event.currentTarget.value)
                  }
                  placeholder="Search chapters..."
                />
              </label>
              <div style={styles.contentsList}>
                {filteredContentsChapters.map((entry, index) => {
                  const text = plainTextPreview(
                    novelFlowContent.find(
                      (item) => item.chapter.id === entry.id,
                    )?.content ?? "",
                  );
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-current={
                        entry.id === activeNovelChapterId ? "true" : undefined
                      }
                      style={{
                        ...styles.contentsItem,
                        ...(entry.id === activeNovelChapterId
                          ? styles.contentsItemActive
                          : {}),
                      }}
                      onClick={() => selectNovelChapter(entry)}
                    >
                      <span style={styles.contentsItemTitle}>
                        <span style={styles.contentsNumber}>
                          Ch {index + 1}
                        </span>
                        {entry.title}
                      </span>
                      {text ? (
                        <span style={styles.contentsExcerpt}>
                          {text.slice(0, 150)}
                          {text.length > 150 ? "…" : ""}
                        </span>
                      ) : null}
                      {entry.id === activeNovelChapterId ? (
                        <span style={styles.contentsReadingBadge}>READING</span>
                      ) : null}
                    </button>
                  );
                })}
                {filteredContentsChapters.length === 0 ? (
                  <p style={styles.emptyText}>No matching chapters.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        <div
          ref={viewerFrameRef}
          className="readerViewport"
          onScroll={handleViewerScroll}
          onPointerDown={handleReaderPointerDown}
          onPointerMove={handleReaderPointerMove}
          onPointerUp={handleReaderPointerEnd}
          onPointerCancel={handleReaderPointerEnd}
          onWheel={handleReaderWheel}
          style={{
            ...styles.viewerFrame,
            ...(isNovel ? styles.novelViewerFrame : {}),
            width: "100%",
            height: "100dvh",
            minHeight: 0,
            maxWidth: "none",
            margin: "0 auto",
            padding: 0,
            background: isNovel
              ? selectedNovelTheme.swatch
              : isImmersive
                ? "radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 35%), #07090a"
                : "#090c0a",
            border: isNovel
              ? "0"
              : isImmersive
                ? "1px solid rgba(255,255,255,0.12)"
                : styles.viewerFrame.border,
            touchAction:
              isNovel || (readerMode === "webtoon" && zoomLevel <= 1)
                ? "pan-y"
                : "none",
          }}
        >
          {isNovelContinuous ? (
            novelFlowContent.length > 0 ? (
              <div style={styles.novelStrip}>
                {novelFlowContent.map((entry, index) => (
                  <section
                    key={entry.chapter.id}
                    data-novel-chapter-id={entry.chapter.id}
                    style={styles.novelChapterBlock}
                  >
                    <article
                      className="novelTextContent"
                      style={novelTextStyle}
                      dangerouslySetInnerHTML={{ __html: entry.content }}
                    />
                    {entry.illustrations.map((url, imageIndex) => (
                      <img
                        key={`${entry.chapter.id}:${imageIndex}`}
                        src={url}
                        alt={`${entry.chapter.title} illustration ${imageIndex + 1}`}
                        style={styles.novelImage}
                      />
                    ))}
                    {index < novelFlowContent.length - 1 ? (
                      <div style={styles.novelChapterDivider}>
                        <span>{entry.chapter.title}</span>
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
            ) : (
              <div style={styles.emptyViewer}>Preparing book chapters...</div>
            )
          ) : isNovel ? (
            <div data-novel-chapter-id={chapter.id} style={styles.novelStrip}>
              {textPages.map((entry) => (
                <article
                  key={entry.page.id}
                  data-reader-page-index={entry.index}
                  className="novelTextContent"
                  style={novelTextStyle}
                  dangerouslySetInnerHTML={{ __html: entry.text ?? "" }}
                />
              ))}
              {pages.map((page, index) =>
                page.mime.startsWith("image/") && pageUrls[index] ? (
                  <img
                    key={page.id}
                    src={pageUrls[index] ?? undefined}
                    alt={`${chapter.title} illustration ${index + 1}`}
                    style={styles.novelImage}
                  />
                ) : null,
              )}
              {textPages.length === 0 ? (
                <article
                  className="novelTextContent"
                  style={novelTextStyle}
                  dangerouslySetInnerHTML={{ __html: currentTextPage }}
                />
              ) : null}
            </div>
          ) : isTextMime(currentPageMime) ? (
            <article
              data-reader-page-index={currentIndex}
              className="novelTextContent"
              style={novelTextStyle}
              dangerouslySetInnerHTML={{ __html: currentTextPage }}
            />
          ) : isComicContinuous ? (
            pageUrls.some(Boolean) ? (
              <div
                data-reader-zoom-target
                style={{
                  ...styles.webtoonStrip,
                  maxWidth: Math.min(normalizedReaderWidth, viewportWidth),
                  margin: "0 auto",
                  gap: `${readerPreferences.comicPageGap}px`,
                  transform: `translate3d(${zoomTransform.translateX}px, ${zoomTransform.translateY}px, 0) scale(${zoomTransform.scale})`,
                  transformOrigin: "0 0",
                }}
              >
                {pageUrls.map((url, index) =>
                  url ? (
                    <img
                      key={`${chapter.id}:${index}`}
                      data-reader-page-index={index}
                      src={url}
                      alt={`${chapter.title} page ${index + 1}`}
                      style={comicPageImageStyle(index === currentIndex, true)}
                    />
                  ) : null,
                )}
              </div>
            ) : (
              <div style={styles.emptyViewer}>Loading pages...</div>
            )
          ) : pageUrls[currentIndex] ? (
            <img
              src={pageUrls[currentIndex]}
              alt={`${chapter.title} page ${currentIndex + 1}`}
              data-reader-page-index={currentIndex}
              data-reader-zoom-target
              style={comicPageImageStyle(true, false)}
            />
          ) : (
            <div style={styles.emptyViewer}>Loading page...</div>
          )}
        </div>

        {isBookmarkDrawerOpen ? (
          <div
            style={styles.pageGridOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-bookmarks-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsBookmarkDrawerOpen(false);
            }}
          >
            <section style={styles.bookmarkDrawerDialog}>
              <header style={styles.pageGridHeader}>
                <div>
                  <p style={styles.kicker}>SAVED PAGES</p>
                  <h2 id="reader-bookmarks-title" style={styles.gridTitle}>
                    Bookmarks
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close bookmarks"
                  onClick={() => setIsBookmarkDrawerOpen(false)}
                  style={styles.iconButton}
                >
                  <X size={17} />
                </button>
              </header>
              <div style={styles.bookmarkEntries}>
                {bookmarkDrawerEntries.map((entry) => (
                  <article key={entry.bookmark.id} style={styles.bookmarkEntry}>
                    <div style={styles.bookmarkEntryHeader}>
                      <button
                        type="button"
                        onClick={() => selectBookmark(entry.bookmark)}
                        style={styles.bookmarkEntryTitle}
                      >
                        <span>{entry.seriesTitle}</span>
                        <span>{entry.chapterTitle}</span>
                        <span>Page {entry.bookmark.pageIndex + 1}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove bookmark for ${entry.chapterTitle}, page ${entry.bookmark.pageIndex + 1}`}
                        title="Remove bookmark"
                        onClick={() =>
                          void removeBookmarkRecord(entry.bookmark)
                        }
                        style={styles.bookmarkRemoveButton}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <textarea
                      aria-label={`Note for ${entry.chapterTitle}, page ${entry.bookmark.pageIndex + 1}`}
                      value={entry.bookmark.note}
                      placeholder="Add a note"
                      rows={2}
                      onChange={(event) => {
                        const note = event.currentTarget.value;
                        setBookmarkDrawerEntries((current) =>
                          current.map((item) =>
                            item.bookmark.id === entry.bookmark.id
                              ? {
                                  ...item,
                                  bookmark: { ...item.bookmark, note },
                                }
                              : item,
                          ),
                        );
                      }}
                      onBlur={(event) =>
                        void saveBookmarkNote(
                          entry.bookmark,
                          event.currentTarget.value,
                        )
                      }
                      style={styles.bookmarkNote}
                    />
                  </article>
                ))}
                {bookmarkDrawerEntries.length === 0 ? (
                  <p style={styles.emptyText}>No saved pages yet.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {isPageGridOpen ? (
          <div
            style={styles.pageGridOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-page-grid-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsPageGridOpen(false);
            }}
          >
            <section style={styles.pageGridDialog}>
              <header style={styles.pageGridHeader}>
                <div>
                  <p style={styles.kicker}>CHAPTER OVERVIEW</p>
                  <h2 id="reader-page-grid-title" style={styles.gridTitle}>
                    {totalPages} pages
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close page grid"
                  onClick={() => setIsPageGridOpen(false)}
                  style={styles.iconButton}
                >
                  <X size={17} />
                </button>
              </header>
              <div style={styles.pageGridTiles}>
                {pages.map((page, index) => (
                  <button
                    key={page.id}
                    type="button"
                    aria-label={`Go to page ${index + 1}`}
                    aria-current={index === currentIndex ? "page" : undefined}
                    onClick={() => selectReaderPage(index)}
                    style={{
                      ...styles.pageGridTile,
                      ...(index === currentIndex
                        ? styles.pageGridTileCurrent
                        : {}),
                    }}
                  >
                    {pageUrls[index] ? (
                      <img
                        src={pageUrls[index] ?? undefined}
                        alt=""
                        style={styles.pageGridImage}
                      />
                    ) : (
                      <span style={styles.pageGridTextPreview}>
                        <BookOpen size={19} />
                        TEXT
                      </span>
                    )}
                    <span style={styles.pageGridNumber}>{index + 1}</span>
                    {bookmarks.some(
                      (bookmark) => bookmark.pageIndex === index,
                    ) ? (
                      <span style={styles.pageGridBookmark}>Saved</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: "fixed",
    inset: 0,
    zIndex: 20,
    minHeight: "100dvh",
    overflow: "hidden",
    background: "var(--app-bg)",
    color: "var(--app-text)",
    padding: 0,
    fontFamily: "var(--font-body)",
  },
  panel: {
    position: "relative",
    display: "block",
    width: "100%",
    height: "100dvh",
    minHeight: 0,
    maxWidth: "none",
    margin: 0,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    minWidth: 0,
    padding: "10px 14px 12px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    background: "rgba(12, 15, 15, 0.78)",
    backdropFilter: "blur(12px)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
  },
  headerRowImmersive: {
    border: "1px solid transparent",
    background: "rgba(9, 12, 12, 0.72)",
    position: "sticky",
    top: 12,
    zIndex: 4,
    transition:
      "opacity 180ms ease, transform 180ms ease, visibility 180ms ease",
  },
  headerHidden: {
    opacity: 0,
    transform: "translateY(-12px)",
    pointerEvents: "none",
    visibility: "hidden",
  },
  readerTitleGroup: { display: "grid", minWidth: 0, gap: 5 },
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
    color: "var(--app-muted)",
    fontSize: 11,
    fontWeight: 700,
    textDecoration: "none",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  title: {
    overflow: "hidden",
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 600,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  chapterSelectLabel: {
    display: "grid",
    minWidth: 140,
    gap: 3,
    color: "var(--app-muted)",
    fontSize: 9,
  },
  chapterSelect: {
    maxWidth: 230,
    padding: "7px 9px",
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    background: "var(--app-panel)",
    color: "var(--app-text)",
    font: "inherit",
    fontSize: 11,
  },
  iconButton: {
    display: "grid",
    width: 36,
    height: 36,
    placeItems: "center",
    border: "1px solid var(--app-border)",
    borderRadius: 7,
    background: "var(--app-panel)",
    color: "var(--app-text)",
    cursor: "pointer",
  },
  readerProgressTrack: {
    height: 3,
    overflow: "hidden",
    borderRadius: 999,
    background: "rgba(255,255,255,0.12)",
  },
  readerProgressTrackImmersive: {
    marginTop: 2,
    background: "rgba(255,255,255,0.08)",
  },
  readerProgressFill: {
    display: "block",
    height: "100%",
    borderRadius: 999,
    background: "var(--app-lime)",
    transition: "width 140ms ease",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 9,
    minHeight: 58,
    padding: "9px 12px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    background: "rgba(12, 15, 15, 0.8)",
    backdropFilter: "blur(12px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.24)",
    flexWrap: "wrap",
  },
  toolbarImmersive: {
    position: "sticky",
    bottom: 16,
    zIndex: 4,
    borderColor: "rgba(255,255,255,0.14)",
    transition:
      "opacity 180ms ease, transform 180ms ease, visibility 180ms ease",
  },
  toolbarHidden: {
    opacity: 0,
    transform: "translateY(12px)",
    pointerEvents: "none",
    visibility: "hidden",
  },
  chapterNav: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    paddingRight: 9,
    borderRight: "1px solid rgba(255,255,255,0.08)",
  },
  chapterNavButton: {
    display: "grid",
    width: 30,
    height: 30,
    placeItems: "center",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    color: "var(--app-text)",
    cursor: "pointer",
  },
  chapterNavLabel: {
    minWidth: 34,
    color: "var(--app-muted)",
    fontSize: 10,
    textAlign: "center",
  },
  modeButtons: {
    display: "flex",
    gap: 4,
    padding: 4,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    background: "rgba(255,255,255,0.03)",
    flexWrap: "wrap",
  },
  zoomControls: { display: "flex", alignItems: "center", gap: 5 },
  pageScrubber: {
    width: "clamp(80px, 14vw, 210px)",
    minWidth: 65,
    accentColor: "var(--app-lime)",
  },
  modeButton: {
    border: "1px solid transparent",
    borderRadius: 8,
    padding: "7px 10px",
    background: "transparent",
    color: "var(--app-muted)",
    textTransform: "capitalize",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  activeModeButton: {
    background: "rgba(255,255,255,0.09)",
    color: "var(--app-text)",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  navButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    padding: "7px 10px",
    background: "var(--app-panel-raised)",
    color: "var(--app-text)",
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
  },
  bookmarkButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 31,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "6px 10px",
    background: "rgba(255,255,255,0.04)",
    color: "var(--app-text)",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  activeBookmarkButton: {
    background: "#ff967918",
    color: "var(--app-coral)",
    border: "1px solid #ff967966",
  },
  errorText: { margin: 0, color: "var(--app-danger)", fontSize: 11 },
  pageIndicator: { color: "var(--app-muted)", fontSize: 10, fontWeight: 600 },
  viewerFrame: {
    display: "grid",
    width: "100%",
    minWidth: 0,
    minHeight: "100dvh",
    height: "100dvh",
    placeItems: "center",
    overflow: "auto",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: "clamp(8px, 2vw, 18px)",
    background: "#090c0a",
    justifySelf: "center",
    boxShadow: "0 28px 60px rgba(0,0,0,0.28)",
  },
  novelViewerFrame: {
    display: "block",
    height: "calc(100vh - 128px)",
    minHeight: 480,
    overflowY: "auto",
    overflowX: "hidden",
    placeItems: "initial",
    padding: 0,
    border: "0",
    borderRadius: 0,
    boxShadow: "none",
    scrollBehavior: "smooth",
    overscrollBehavior: "contain",
  },
  novelTextContent: {
    boxSizing: "border-box",
    border: 0,
    borderRadius: 0,
    background: "transparent",
    overflowWrap: "anywhere",
  },
  image: {
    width: "auto",
    maxWidth: "100%",
    height: "auto",
    maxHeight: "100dvh",
    objectFit: "contain",
    borderRadius: 3,
    background: "#090c0a",
  },
  webtoonStrip: {
    display: "grid",
    width: "100%",
    justifyItems: "center",
    gap: 8,
  },
  novelStrip: {
    display: "grid",
    width: "100%",
    justifyItems: "center",
    alignContent: "start",
    gap: 0,
  },
  novelChapterBlock: {
    display: "grid",
    justifyItems: "center",
    width: "100%",
    minWidth: 0,
  },
  novelChapterDivider: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "min(760px, calc(100% - 48px))",
    margin: "36px auto 16px",
    padding: "14px 0",
    borderTop: "1px solid rgba(127,127,127,0.25)",
    color: "var(--app-muted)",
    fontSize: 12,
    textAlign: "center",
  },
  novelImage: {
    width: "100%",
    maxWidth: 900,
    maxHeight: "80vh",
    objectFit: "contain",
    borderRadius: 4,
  },
  webtoonImage: {
    width: "100%",
    maxWidth: "100%",
    margin: "0 auto",
    borderRadius: 3,
    background: "#090c0a",
  },
  textPage: {
    width: "100%",
    maxWidth: 760,
    padding: "clamp(20px, 5vw, 56px)",
    border: "1px solid var(--app-border)",
    borderRadius: 8,
    background: "#131815",
    color: "#e9eee8",
    lineHeight: 1.85,
    overflowWrap: "anywhere",
  },
  emptyViewer: { color: "var(--app-muted)", fontSize: 13 },
  emptyText: { margin: 0, color: "var(--app-muted)", fontSize: 12 },
  settingsOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    display: "flex",
    justifyContent: "flex-end",
    background: "rgba(7, 10, 12, 0.7)",
    backdropFilter: "blur(10px)",
  },
  contentsOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 55,
    display: "flex",
    justifyContent: "flex-end",
    background: "rgba(0,0,0,0.68)",
    backdropFilter: "blur(5px)",
  },
  contentsPanel: {
    display: "grid",
    gridTemplateRows: "auto auto 1fr",
    gap: 16,
    width: "min(520px, 100vw)",
    height: "100dvh",
    boxSizing: "border-box",
    padding: "18px 20px",
    borderLeft: "1px solid var(--app-border)",
    background: "var(--app-panel)",
    boxShadow: "-20px 0 60px rgba(0,0,0,0.35)",
  },
  contentsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    paddingBottom: 12,
    borderBottom: "1px solid var(--app-border)",
  },
  contentsSearch: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 12px",
    border: "1px solid var(--app-border)",
    borderRadius: 9,
    background: "var(--app-bg)",
    color: "var(--app-muted)",
  },
  contentsList: {
    display: "grid",
    alignContent: "start",
    gap: 8,
    overflowY: "auto",
    paddingRight: 3,
  },
  contentsItem: {
    position: "relative",
    display: "grid",
    gap: 7,
    width: "100%",
    minWidth: 0,
    padding: "12px 14px",
    border: "1px solid var(--app-border)",
    borderRadius: 10,
    background: "var(--app-bg)",
    color: "var(--app-text)",
    textAlign: "left",
    cursor: "pointer",
  },
  contentsItemActive: {
    borderColor: "var(--app-accent)",
    boxShadow: "inset 0 0 0 1px var(--app-accent)",
  },
  contentsItemTitle: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    paddingRight: 72,
    fontSize: 14,
    fontWeight: 700,
  },
  contentsNumber: {
    flex: "0 0 auto",
    padding: "3px 6px",
    borderRadius: 6,
    background: "var(--app-panel-raised)",
    color: "var(--app-text)",
    fontSize: 10,
    fontWeight: 700,
  },
  contentsExcerpt: {
    display: "-webkit-box",
    overflow: "hidden",
    color: "var(--app-muted)",
    fontSize: 12,
    lineHeight: 1.45,
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  contentsReadingBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: "4px 7px",
    borderRadius: 999,
    background: "var(--app-panel-raised)",
    color: "var(--app-text)",
    fontSize: 9,
    fontWeight: 800,
  },
  settingsPanel: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: 440,
    height: "100dvh",
    maxHeight: "100dvh",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 18,
    padding: "18px 20px 14px",
    border: "1px solid var(--app-border-strong)",
    borderRadius: "12px 0 0 12px",
    background: "var(--app-panel)",
    boxShadow: "0 30px 90px rgba(0,0,0,0.5)",
    zIndex: 60,
  },
  settingsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "2px 2px 6px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  settingsTitleWrap: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  settingsIcon: {
    display: "grid",
    placeItems: "center",
    width: 28,
    height: 28,
    borderRadius: 8,
    background: "rgba(255,255,255,0.06)",
    color: "var(--app-text)",
    fontSize: 17,
  },
  settingsTitle: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: "-0.04em",
  },
  settingsSubtitle: {
    margin: 2,
    color: "var(--app-muted)",
    fontSize: 12,
  },
  settingsCloseButton: {
    display: "grid",
    placeItems: "center",
    width: 34,
    height: 34,
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 9,
    background: "rgba(255,255,255,0.04)",
    color: "var(--app-text)",
    cursor: "pointer",
  },
  settingsSection: {
    display: "grid",
    gap: 12,
    overflowY: "auto",
    paddingRight: 4,
  },
  novelSettingGroup: { display: "grid", gap: 8, minWidth: 0 },
  novelSettingLabel: {
    color: "var(--app-muted)",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  novelThemeRow: {
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: 7,
  },
  novelThemeSwatch: {
    display: "grid",
    aspectRatio: "1.4",
    minWidth: 0,
    placeItems: "center",
    border: "2px solid var(--app-border)",
    borderRadius: 10,
    color: "white",
    cursor: "pointer",
  },
  novelThemeSwatchActive: {
    outline: "2px solid var(--app-text)",
    outlineOffset: 2,
  },
  novelFontGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 7,
  },
  novelFontButton: {
    minHeight: 40,
    padding: "8px 12px",
    border: "1px solid var(--app-border)",
    borderRadius: 9,
    background: "var(--app-bg)",
    color: "var(--app-text)",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "left",
    cursor: "pointer",
  },
  novelControlActive: {
    borderColor: "var(--app-text)",
    background: "var(--app-panel-raised)",
    boxShadow: "inset 0 0 0 1px var(--app-text)",
  },
  novelControlHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  novelSizeRow: {
    display: "grid",
    gridTemplateColumns: "40px minmax(0, 1fr) 40px",
    alignItems: "center",
    gap: 10,
  },
  novelSizeButton: {
    display: "grid",
    width: 40,
    height: 40,
    placeItems: "center",
    border: "1px solid var(--app-border)",
    borderRadius: 9,
    background: "var(--app-bg)",
    color: "var(--app-text)",
    cursor: "pointer",
  },
  novelFontRange: { width: "100%", accentColor: "var(--app-accent)" },
  novelControlGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "16px 12px",
  },
  novelSegmentRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 5,
  },
  novelSegmentButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    minHeight: 34,
    padding: "6px 8px",
    border: "1px solid var(--app-border)",
    borderRadius: 8,
    background: "var(--app-bg)",
    color: "var(--app-text)",
    fontSize: 11,
    fontWeight: 650,
    cursor: "pointer",
  },
  novelFlowSection: {
    display: "grid",
    gap: 10,
    paddingTop: 14,
    borderTop: "1px solid var(--app-border)",
  },
  novelFlowBadge: {
    padding: "4px 8px",
    borderRadius: 999,
    background: "var(--app-panel-raised)",
    color: "var(--app-text)",
    fontSize: 9,
    fontWeight: 800,
  },
  settingsRowTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  readerModeCard: {
    display: "grid",
    gap: 10,
    minHeight: 124,
    padding: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    background: "rgba(255,255,255,0.02)",
    color: "var(--app-text)",
    textAlign: "left",
    cursor: "pointer",
  },
  readerModeCardActive: {
    borderColor: "var(--app-lime)",
    background:
      "color-mix(in srgb, var(--app-panel-raised) 76%, var(--app-lime) 24%)",
    boxShadow:
      "inset 0 0 0 1px color-mix(in srgb, var(--app-lime) 25%, transparent)",
  },
  readerModeTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 700,
  },
  readerModeBody: {
    color: "var(--app-muted)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  settingsSliderRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    alignItems: "center",
    paddingTop: 10,
    rowGap: 8,
  },
  settingsSliderLabel: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 700,
  },
  settingsSliderValue: {
    fontFamily: "var(--font-display)",
    fontSize: 15,
    color: "var(--app-text)",
  },
  settingsRange: {
    gridColumn: "1 / -1",
    width: "100%",
    accentColor: "var(--app-lime)",
    height: 3,
  },
  settingsHint: {
    gridColumn: "1 / -1",
    color: "var(--app-muted)",
    fontSize: 11,
  },
  settingsDirectionRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(180px, 1fr)",
    alignItems: "center",
    gap: 12,
  },
  settingsSelect: {
    minWidth: 0,
    padding: "9px 10px",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    background: "var(--app-bg)",
    color: "var(--app-text)",
    font: "inherit",
  },
  settingsWidthPresets: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
    marginTop: 4,
  },
  settingsWidthButton: {
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 9,
    background: "rgba(255,255,255,0.03)",
    color: "var(--app-muted)",
    padding: "7px 8px",
    fontSize: 10,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  settingsWidthButtonActive: {
    borderColor: "var(--app-lime)",
    background: "color-mix(in srgb, var(--app-lime) 12%, transparent)",
    color: "var(--app-text)",
    boxShadow:
      "inset 0 0 0 1px color-mix(in srgb, var(--app-lime) 30%, transparent)",
  },
  settingsToggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    padding: "10px 0",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  settingsToggleHeading: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    fontFamily: "var(--font-display)",
    fontSize: 15,
    fontWeight: 700,
  },
  settingsPill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: 999,
    background: "color-mix(in srgb, var(--app-lime) 12%, transparent)",
    color: "var(--app-lime)",
    fontSize: 9,
    letterSpacing: "0.08em",
  },
  settingsToggleBody: {
    margin: "6px 0 0",
    color: "var(--app-muted)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  settingsToggleInput: {
    width: 52,
    height: 30,
    borderRadius: 999,
    accentColor: "var(--app-lime)",
    transform: "scale(1.08)",
  },
  settingsInfoBar: {
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    background: "rgba(255,255,255,0.02)",
    color: "var(--app-muted)",
    fontSize: 12,
  },
  pageGridOverlay: {
    position: "fixed",
    zIndex: 30,
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: "clamp(12px, 3vw, 32px)",
    background: "#030504eF",
    backdropFilter: "blur(10px)",
  },
  pageGridDialog: {
    display: "grid",
    width: "min(1100px, 100%)",
    maxHeight: "min(90vh, 900px)",
    gridTemplateRows: "auto minmax(0, 1fr)",
    gap: 16,
    padding: "clamp(16px, 2.5vw, 28px)",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 12,
    background: "var(--app-panel)",
    boxShadow: "0 24px 90px #000b",
  },
  bookmarkDrawerDialog: {
    display: "grid",
    width: "min(760px, 100%)",
    maxHeight: "min(90vh, 900px)",
    gridTemplateRows: "auto minmax(0, 1fr)",
    gap: 16,
    padding: "clamp(16px, 2.5vw, 28px)",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 12,
    background: "var(--app-panel)",
    boxShadow: "0 24px 90px #000b",
  },
  bookmarkEntries: {
    display: "grid",
    alignContent: "start",
    gap: 12,
    overflowY: "auto",
    minHeight: 0,
  },
  bookmarkEntry: {
    display: "grid",
    gap: 8,
    padding: "8px 0 12px",
    borderBottom: "1px solid var(--app-border)",
  },
  bookmarkEntryHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  bookmarkEntryTitle: {
    display: "flex",
    flex: 1,
    flexWrap: "wrap",
    gap: 6,
    minWidth: 0,
    padding: 0,
    border: 0,
    background: "transparent",
    color: "var(--app-text)",
    textAlign: "left",
    cursor: "pointer",
  },
  bookmarkRemoveButton: {
    display: "grid",
    width: 32,
    height: 32,
    flex: "0 0 auto",
    placeItems: "center",
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    background: "var(--app-panel-raised)",
    color: "var(--app-text)",
    cursor: "pointer",
  },
  bookmarkNote: {
    boxSizing: "border-box",
    width: "100%",
    resize: "vertical",
    padding: 9,
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    background: "var(--app-panel-raised)",
    color: "var(--app-text)",
    font: "inherit",
  },
  pageGridHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  gridTitle: {
    margin: "4px 0 0",
    fontFamily: "var(--font-display)",
    fontSize: 22,
  },
  pageGridTiles: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))",
    alignContent: "start",
    gap: 9,
    overflowY: "auto",
    padding: 2,
  },
  pageGridTile: {
    position: "relative",
    display: "grid",
    minWidth: 0,
    aspectRatio: "0.72",
    overflow: "hidden",
    placeItems: "center",
    padding: 0,
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    background: "var(--app-panel-raised)",
    color: "var(--app-muted)",
    cursor: "pointer",
  },
  pageGridTileCurrent: { border: "2px solid var(--app-lime)" },
  pageGridImage: { width: "100%", height: "100%", objectFit: "cover" },
  pageGridTextPreview: {
    display: "grid",
    justifyItems: "center",
    gap: 5,
    color: "var(--app-lime)",
    fontSize: 9,
    fontWeight: 700,
  },
  pageGridNumber: {
    position: "absolute",
    right: 4,
    bottom: 4,
    padding: "2px 5px",
    borderRadius: 4,
    background: "#050606d9",
    color: "#fff",
    fontSize: 9,
  },
  pageGridBookmark: {
    position: "absolute",
    top: 4,
    left: 4,
    padding: "2px 5px",
    borderRadius: 4,
    background: "var(--app-lime)",
    color: "#111",
    fontSize: 8,
    fontWeight: 700,
  },
};
