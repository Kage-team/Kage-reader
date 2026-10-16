import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlignJustify,
  AlignLeft,
  AudioLines,
  ArrowLeft,
  ArrowRight,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowDown,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowUp,
  Circle,
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Expand,
  Grid2X2,
  Highlighter,
  MessageCircle,
  Eye,
  EyeOff,
  List,
  BookmarkCheck,
  Camera,
  Download,
  Minimize2,
  Minus,
  PanelsTopLeft,
  Palette,
  Pause,
  Plus,
  Play,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  Settings2,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { resolveReaderMode } from "../../lib/reader/mode";
import { highlightReaderText, sanitizeReaderHtml } from "../../lib/reader/html";
import {
  searchTextDocuments,
  type TextSearchDocument,
  type TextSearchResult,
} from "../../lib/reader/search";
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

type ReaderSettingsSection =
  | "menu"
  | "reader"
  | "graphics"
  | "interface"
  | "chapters";

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

function highlightSearchExcerpt(excerpt: string, query: string) {
  const phrase = query.trim();
  if (!phrase) return excerpt;
  const index = excerpt.toLocaleLowerCase().indexOf(phrase.toLocaleLowerCase());
  if (index < 0) return excerpt;
  return (
    <>
      {excerpt.slice(0, index)}
      <mark className="readerTextMatch">
        {excerpt.slice(index, index + phrase.length)}
      </mark>
      {excerpt.slice(index + phrase.length)}
    </>
  );
}

export function ReaderPage() {
  const { chapterId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [seriesType, setSeriesType] = useState<SeriesType | null>(null);
  const [seriesChapters, setSeriesChapters] = useState<Chapter[]>([]);
  const [activeComicChapterId, setActiveComicChapterId] = useState("");
  const [comicFlowContent, setComicFlowContent] = useState<
    Array<{
      chapter: Chapter;
      pages: Array<{ page: Page; url: string | null }>;
    }>
  >([]);
  const [activeNovelChapterId, setActiveNovelChapterId] = useState("");
  const [novelFlowContent, setNovelFlowContent] = useState<
    Array<{ chapter: Chapter; content: string; illustrations: string[] }>
  >([]);
  const [loadedChapterId, setLoadedChapterId] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageRotation, setPageRotation] = useState(0);
  const [widePageAspects, setWidePageAspects] = useState<
    Record<string, number>
  >({});
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>(
    () => getPreferences().defaultReadingDirection,
  );
  const [readingDirectionOverride, setReadingDirectionOverride] = useState<
    ReadingDirection | undefined
  >();
  const [pageUrls, setPageUrls] = useState<Array<string | null>>([]);
  const [pageTexts, setPageTexts] = useState<Array<string | null>>([]);
  const [readerMode, setReaderMode] = useState<ReaderMode>("flip");
  const isNovel = seriesType === "novel" || readerMode === "novel";
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TextSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAutoScrollActive, setIsAutoScrollActive] = useState(false);
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
  const [panelContextMenu, setPanelContextMenu] = useState<{
    left: number;
    top: number;
    chapterId: string;
    pageIndex: number;
  } | null>(null);
  const [isContentsOpen, setIsContentsOpen] = useState(false);
  const [contentsQuery, setContentsQuery] = useState("");
  const [isReaderSettingsOpen, setIsReaderSettingsOpen] = useState(false);
  const [readerSettingsSection, setReaderSettingsSection] =
    useState<ReaderSettingsSection>("menu");
  const [isChapterPickerOpen, setIsChapterPickerOpen] = useState(false);
  const [chapterPickerQuery, setChapterPickerQuery] = useState("");
  const [isImmersive, setIsImmersive] = useState(false);
  const [isUiVisible, setIsUiVisible] = useState(true);
  const [readerPreferences, setReaderPreferences] = useState<Preferences>(() =>
    getPreferences(),
  );
  const readerRootRef = useRef<HTMLElement>(null);
  const viewerFrameRef = useRef<HTMLDivElement>(null);
  const novelScrollProgressRef = useRef(0);
  const novelProgressInputRef = useRef<HTMLInputElement>(null);
  const novelProgressIndicatorRef = useRef<HTMLSpanElement>(null);
  const readerProgressTrackRef = useRef<HTMLDivElement>(null);
  const readerProgressFillRef = useRef<HTMLSpanElement>(null);
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
  const comicFlowLoadedChapterIdsRef = useRef(new Set<string>());
  const comicFlowLoadingChapterIdsRef = useRef(new Set<string>());
  const comicFlowObjectUrlsRef = useRef<string[]>([]);
  const comicInitialPositionRestoredRef = useRef(false);
  const comicProgressSavedAtRef = useRef(0);
  const zoomPersistTimerRef = useRef<number | undefined>(undefined);
  const chromeHideTimerRef = useRef<number | undefined>(undefined);
  const novelProgressSavedAtRef = useRef(0);
  const novelScrollRatioRef = useRef(0);
  const lastReaderScrollHandledAtRef = useRef(0);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const searchIndexRef = useRef<{
    seriesId: string;
    chapterKey: string;
    promise: Promise<TextSearchDocument[]>;
  } | null>(null);
  const currentPageRef = useRef(currentPage);
  const isComicContinuous =
    readerMode === "webtoon" &&
    readerPreferences.comicInfiniteScroll &&
    pages.some((page) => page.mime.startsWith("image/"));

  useEffect(() => {
    comicFlowObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    comicFlowObjectUrlsRef.current = [];
    comicFlowLoadedChapterIdsRef.current.clear();
    comicFlowLoadingChapterIdsRef.current.clear();
    comicInitialPositionRestoredRef.current = false;
    setComicFlowContent([]);
    setActiveComicChapterId(chapterId ? decodeURIComponent(chapterId) : "");
  }, [chapterId]);

  useEffect(
    () => () => {
      comicFlowObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    setReaderPreferences(getPreferences());
  }, [chapterId]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!isSearchOpen || !query || !chapter) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let isCancelled = false;
    setIsSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const chapterKey = seriesChapters
            .map((seriesChapter) => seriesChapter.id)
            .join("\u0000");
          let index = searchIndexRef.current;
          if (
            !index ||
            index.seriesId !== chapter.seriesId ||
            index.chapterKey !== chapterKey
          ) {
            const promise = (async () => {
              const documents: TextSearchDocument[] = [];
              for (const seriesChapter of seriesChapters) {
                const chapterPages = await listPages(seriesChapter.id);
                for (const page of chapterPages) {
                  if (!isTextMime(page.mime)) continue;
                  const blob = await getBlob(page.storageKey);
                  if (!blob) continue;
                  const markup = sanitizeReaderHtml(await blob.text());
                  documents.push({
                    chapterId: seriesChapter.id,
                    chapterTitle: seriesChapter.title,
                    pageIndex: page.index,
                    text: plainTextPreview(markup),
                  });
                }
              }
              return documents;
            })();
            index = { seriesId: chapter.seriesId, chapterKey, promise };
            searchIndexRef.current = index;
          }
          const documents = await index.promise;
          if (!isCancelled) {
            setSearchResults(searchTextDocuments(documents, query));
          }
        } catch {
          if (!isCancelled) {
            setBookmarkError("Could not search this book's text.");
          }
        } finally {
          if (!isCancelled) setIsSearching(false);
        }
      })();
    }, 250);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [isSearchOpen, searchQuery, chapter, seriesChapters]);

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
    const keepChromeVisible =
      !isImmersive ||
      isReaderSettingsOpen ||
      isPageGridOpen ||
      isBookmarkDrawerOpen ||
      isSearchOpen ||
      isContentsOpen;
    if (keepChromeVisible) {
      setIsUiVisible(true);
      if (chromeHideTimerRef.current !== undefined) {
        window.clearTimeout(chromeHideTimerRef.current);
        chromeHideTimerRef.current = undefined;
      }
      return;
    }

    setIsUiVisible(false);
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
    isSearchOpen,
    isReaderSettingsOpen,
    isImmersive,
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
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    return () => window.speechSynthesis?.cancel();
  }, [chapterId]);

  useEffect(() => {
    if (
      !isAutoScrollActive ||
      (!isNovel &&
        (readerMode !== "webtoon" || !readerPreferences.comicInfiniteScroll))
    ) {
      return;
    }

    const frame = viewerFrameRef.current;
    if (!frame) return;

    let animationFrame = 0;
    let previousTime = 0;
    const scroll = (time: number) => {
      if (previousTime > 0) {
        const maximumScroll = frame.scrollHeight - frame.clientHeight;
        if (frame.scrollTop >= maximumScroll) {
          setIsAutoScrollActive(false);
          return;
        }
        frame.scrollTop = Math.min(
          maximumScroll,
          frame.scrollTop + (time - previousTime) * 0.025,
        );
      }
      previousTime = time;
      animationFrame = window.requestAnimationFrame(scroll);
    };

    animationFrame = window.requestAnimationFrame(scroll);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    chapterId,
    isAutoScrollActive,
    isNovel,
    readerMode,
    readerPreferences.comicInfiniteScroll,
  ]);

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
      const loadedUrls: Array<string | null> = [];
      const loadedTexts: Array<string | null> = [];

      for (const page of pages) {
        const blob = await getBlob(page.storageKey);
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
    if (!isComicContinuous || !chapter || seriesChapters.length === 0) return;

    const centerId = activeComicChapterId || chapter.id;
    const centerIndex = seriesChapters.findIndex(
      (entry) => entry.id === centerId,
    );
    if (centerIndex < 0) return;

    const nearbyChapters = seriesChapters.slice(
      Math.max(0, centerIndex - 1),
      centerIndex + 2,
    );
    const loadingChapterIds = comicFlowLoadingChapterIdsRef.current;
    const chaptersToLoad = nearbyChapters.filter(
      (entry) =>
        !comicFlowLoadedChapterIdsRef.current.has(entry.id) &&
        !loadingChapterIds.has(entry.id),
    );
    if (chaptersToLoad.length === 0) return;

    chaptersToLoad.forEach((entry) => loadingChapterIds.add(entry.id));
    let isCancelled = false;
    const createdUrls: string[] = [];

    void Promise.all(
      chaptersToLoad.map(async (seriesChapter) => {
        const chapterPages = await listPages(seriesChapter.id);
        const loadedPages = await Promise.all(
          chapterPages.map(async (page) => {
            const blob = await getBlob(page.storageKey);
            if (!blob || !page.mime.startsWith("image/")) {
              return { page, url: null };
            }
            const url = URL.createObjectURL(blob);
            createdUrls.push(url);
            return { page, url };
          }),
        );
        return { chapter: seriesChapter, pages: loadedPages };
      }),
    )
      .then((loadedChapters) => {
        if (isCancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        comicFlowObjectUrlsRef.current.push(...createdUrls);
        loadedChapters.forEach((entry) =>
          comicFlowLoadedChapterIdsRef.current.add(entry.chapter.id),
        );
        setComicFlowContent((current) => {
          const byId = new Map(
            current.map((entry) => [entry.chapter.id, entry]),
          );
          loadedChapters.forEach((entry) => byId.set(entry.chapter.id, entry));
          return seriesChapters.flatMap((seriesChapter) => {
            const entry = byId.get(seriesChapter.id);
            return entry ? [entry] : [];
          });
        });
      })
      .catch(() => {
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
      })
      .finally(() => {
        chaptersToLoad.forEach((entry) => loadingChapterIds.delete(entry.id));
      });

    return () => {
      isCancelled = true;
      chaptersToLoad.forEach((entry) => loadingChapterIds.delete(entry.id));
    };
  }, [activeComicChapterId, chapter, isComicContinuous, seriesChapters]);

  useEffect(() => {
    if (!isComicContinuous || comicInitialPositionRestoredRef.current) return;
    const frame = viewerFrameRef.current;
    if (!frame) return;

    const requestedChapterId = chapterId
      ? decodeURIComponent(chapterId)
      : chapter?.id;
    const chapterElement = Array.from(
      frame.querySelectorAll<HTMLElement>("[data-comic-chapter-id]"),
    ).find((element) => element.dataset.comicChapterId === requestedChapterId);
    const pageElement = chapterElement?.querySelector<HTMLElement>(
      `[data-reader-page-index="${currentPage}"]`,
    );
    if (!pageElement) return;

    comicInitialPositionRestoredRef.current = true;
    requestAnimationFrame(() =>
      pageElement.scrollIntoView({ behavior: "instant", block: "start" }),
    );
  }, [chapter, chapterId, comicFlowContent, currentPage, isComicContinuous]);

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
      const chapters: Array<{
        chapter: Chapter;
        content: string;
        illustrations: string[];
      }> = [];

      for (
        let batchStart = 0;
        batchStart < seriesChapters.length;
        batchStart += 2
      ) {
        const batch = await Promise.all(
          seriesChapters
            .slice(batchStart, batchStart + 2)
            .map(async (seriesChapter) => {
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
        chapters.push(...batch);

        if (isCancelled) {
          objectUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        setNovelFlowContent(
          chapters.filter((entry) => entry.content.trim().length > 0),
        );
        if (batchStart + 2 < seriesChapters.length) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
        }
      }
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
      pages.length === 0 ||
      isComicContinuous
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
    void (async () => {
      const decodedChapterId = decodeURIComponent(chapterId);
      const existing = await getProgress(decodedChapterId);
      await putProgress({
        ...existing,
        schemaVersion: SCHEMA_VERSION,
        chapterId: decodedChapterId,
        pageIndex: safeIndex,
        scrollRatio: existing?.scrollRatio ?? 0,
        updatedAt: Date.now(),
        timeSpentSeconds: existing?.timeSpentSeconds ?? 0,
      });
    })();
  }, [
    chapterId,
    currentPage,
    loadedChapterId,
    pages,
    readerMode,
    readerPreferences.novelInfiniteScroll,
    isComicContinuous,
  ]);

  useEffect(() => {
    if (!chapterId) return;
    const decodedChapterId = isComicContinuous
      ? activeComicChapterId
      : decodeURIComponent(chapterId);
    if (!decodedChapterId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const existing = await getProgress(decodedChapterId);
        const updatedAt = Date.now();
        await putProgress({
          ...existing,
          schemaVersion: SCHEMA_VERSION,
          chapterId: decodedChapterId,
          pageIndex: currentPageRef.current,
          scrollRatio: existing?.scrollRatio ?? 0,
          updatedAt,
          timeSpentSeconds: (existing?.timeSpentSeconds ?? 0) + 60,
        });
        const preferences = getPreferences();
        const dayKey = new Date().toISOString().slice(0, 10);
        savePreferences({
          ...preferences,
          readingDayKey: dayKey,
          todayReadingSeconds:
            (preferences.readingDayKey === dayKey
              ? preferences.todayReadingSeconds
              : 0) + 60,
        });
      })();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [activeComicChapterId, chapterId, isComicContinuous]);

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
      if (event.key.toLowerCase() === "b" && isNovel) {
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
    isNovel,
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

  function openTextSearchResult(result: TextSearchResult): void {
    setIsSearchOpen(false);
    if (result.chapterId === chapter?.id) {
      selectReaderPage(result.pageIndex);
      return;
    }
    navigate(`/read/${encodeURIComponent(result.chapterId)}`, {
      state: { bookmarkPageIndex: result.pageIndex },
    });
  }

  async function annotateTextSelection(): Promise<void> {
    const selection = window.getSelection();
    const highlightText = selection?.toString().trim();
    if (!chapter || !highlightText) {
      setBookmarkError("Select some novel text before saving an annotation.");
      return;
    }
    const anchor = selection?.anchorNode;
    const anchorElement =
      anchor?.nodeType === Node.ELEMENT_NODE
        ? (anchor as Element)
        : anchor?.parentElement;
    const selectedPage = anchorElement?.closest("[data-reader-page-index]");
    const selectedChapter = anchorElement?.closest("[data-novel-chapter-id]");
    const pageIndex = Number.parseInt(
      selectedPage?.getAttribute("data-reader-page-index") ?? "",
      10,
    );
    const targetChapterId =
      selectedChapter?.getAttribute("data-novel-chapter-id") ?? chapter.id;
    try {
      const bookmark = await putBookmark({
        schemaVersion: SCHEMA_VERSION,
        chapterId: targetChapterId,
        pageIndex: Number.isInteger(pageIndex) ? pageIndex : currentIndex,
        createdAt: Date.now(),
        note: "",
        highlightText,
      });
      if (targetChapterId === chapter.id) {
        setBookmarks((current) => [...current, bookmark]);
      }
      setBookmarkError("");
    } catch {
      setBookmarkError("Could not save this text annotation.");
    }
  }

  function toggleSpeech(): void {
    if (!("speechSynthesis" in window)) {
      setBookmarkError("Text-to-speech is unavailable in this browser.");
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      speechUtteranceRef.current = null;
      setIsSpeaking(false);
      return;
    }
    const text = textPages
      .map((entry) => plainTextPreview(entry.text ?? ""))
      .filter(Boolean)
      .join("\n\n");
    if (!text) {
      setBookmarkError("No readable text is available in this chapter.");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechUtteranceRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
    setBookmarkError("");
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

  async function downloadPanelImage(
    targetChapterId: string,
    pageIndex: number,
  ): Promise<void> {
    const targetChapter =
      seriesChapters.find((entry) => entry.id === targetChapterId) ??
      (chapter?.id === targetChapterId ? chapter : undefined);
    if (!targetChapter) return;

    const targetPages =
      chapter?.id === targetChapterId
        ? pages
        : await listPages(targetChapterId);
    const targetPage = targetPages.find((entry) => entry.index === pageIndex);
    if (!targetPage || !targetPage.mime.startsWith("image/")) return;

    const blob = await getBlob(targetPage.storageKey);
    if (!blob) return;

    const mime = blob.type || targetPage.mime;
    const mimeExtension = mime.split("/")[1]?.split("+")[0] ?? "jpg";
    const extension = mimeExtension === "jpeg" ? "jpg" : mimeExtension;
    const safeTitle = targetChapter.title.replace(/[<>:"/\\|?*]/g, "-").trim();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${safeTitle || "chapter"}-page-${String(pageIndex + 1).padStart(3, "0")}.${extension}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  function handleReaderContextMenu(
    event: React.MouseEvent<HTMLDivElement>,
  ): void {
    const image = (event.target as HTMLElement).closest<HTMLImageElement>(
      "img[data-reader-page-index]",
    );
    if (!image) return;

    const pageIndex = Number(image.dataset.readerPageIndex);
    const chapterElement = image.closest<HTMLElement>(
      "[data-comic-chapter-id]",
    );
    const targetChapterId =
      chapterElement?.dataset.comicChapterId ??
      (chapterId ? decodeURIComponent(chapterId) : "");
    if (!Number.isInteger(pageIndex) || !targetChapterId) return;

    event.preventDefault();
    setPanelContextMenu({
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - 200)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - 60)),
      chapterId: targetChapterId,
      pageIndex,
    });
  }

  function setImmersiveMode(enabled: boolean): void {
    setIsImmersive(enabled);
    setIsUiVisible(!enabled);
    updateReaderPreferences({ immersiveMode: enabled });
  }

  function openReaderSettings(): void {
    setReaderSettingsSection("menu");
    setIsReaderSettingsOpen(true);
  }

  function toggleImmersiveMode(): void {
    setImmersiveMode(!isImmersive);
  }

  function updateNovelProgressDisplay(progress: number): void {
    const normalizedProgress = Math.min(1, Math.max(0, progress));
    novelScrollProgressRef.current = normalizedProgress;
    const progressPercent = Math.round(normalizedProgress * 100);
    if (novelProgressInputRef.current) {
      novelProgressInputRef.current.value = String(
        Math.round(normalizedProgress * 1000),
      );
    }
    if (novelProgressIndicatorRef.current) {
      novelProgressIndicatorRef.current.textContent = `Progress ${progressPercent}%`;
    }
    if (readerProgressTrackRef.current) {
      readerProgressTrackRef.current.setAttribute(
        "aria-valuenow",
        String(progressPercent),
      );
    }
    if (readerProgressFillRef.current) {
      readerProgressFillRef.current.style.width = `${progressPercent}%`;
    }
  }

  function handleViewerScroll(event: React.UIEvent<HTMLDivElement>): void {
    const now = performance.now();
    if (now - lastReaderScrollHandledAtRef.current < 32) return;
    lastReaderScrollHandledAtRef.current = now;

    if (readerMode === "novel") {
      const frame = event.currentTarget;
      const progress =
        frame.scrollTop / Math.max(1, frame.scrollHeight - frame.clientHeight);
      updateNovelProgressDisplay(progress);
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

    if (isComicContinuous) {
      const frame = event.currentTarget;
      const chapterElements = Array.from(
        frame.querySelectorAll<HTMLElement>("[data-comic-chapter-id]"),
      );
      if (chapterElements.length === 0) return;

      const activeLine =
        frame.getBoundingClientRect().top +
        Math.min(160, frame.clientHeight * 0.35);
      let activeElement = chapterElements[0];
      for (const element of chapterElements) {
        if (element.getBoundingClientRect().top <= activeLine) {
          activeElement = element;
        } else {
          break;
        }
      }

      const activeId = activeElement.dataset.comicChapterId;
      if (!activeId) return;
      setActiveComicChapterId(activeId);

      const chapterPages = Array.from(
        activeElement.querySelectorAll<HTMLElement>("[data-reader-page-index]"),
      );
      const viewportCenter =
        frame.getBoundingClientRect().top + frame.clientHeight / 2;
      let closestIndex = currentPage;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const readerPage of chapterPages) {
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

      const now = Date.now();
      if (now - comicProgressSavedAtRef.current >= 900) {
        comicProgressSavedAtRef.current = now;
        void getProgress(activeId).then((existing) =>
          putProgress({
            ...existing,
            schemaVersion: SCHEMA_VERSION,
            chapterId: activeId,
            pageIndex: closestIndex,
            scrollRatio: 0,
            updatedAt: now,
            timeSpentSeconds: existing?.timeSpentSeconds ?? 0,
          }),
        );
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
  }

  function selectReaderPage(index: number): void {
    setCurrentPage(index);
    setIsPageGridOpen(false);
    const frame = viewerFrameRef.current;
    const activeChapterElement = isComicContinuous
      ? Array.from(
          frame?.querySelectorAll<HTMLElement>("[data-comic-chapter-id]") ?? [],
        ).find(
          (element) => element.dataset.comicChapterId === activeComicChapterId,
        )
      : frame;
    activeChapterElement
      ?.querySelector<HTMLElement>(`[data-reader-page-index="${index}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectNovelChapter(selectedChapter: Chapter): void {
    setIsContentsOpen(false);
    setContentsQuery("");
    navigate(`/read/${encodeURIComponent(selectedChapter.id)}`);
  }

  async function shareCurrentChapter(): Promise<void> {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: chapter?.title ?? "Kage Reader", url });
      } else {
        await navigator.clipboard.writeText(url);
        setBookmarkError("Chapter link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setBookmarkError("Could not share this chapter.");
    }
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

  const activeComicChapter =
    seriesChapters.find((entry) => entry.id === activeComicChapterId) ??
    chapter;
  const totalPages = isComicContinuous
    ? activeComicChapter.pageCount
    : pages.length;
  const currentIndex = Math.min(Math.max(currentPage, 0), totalPages - 1);
  const isCurrentPageBookmarked = bookmarks.some(
    (bookmark) => bookmark.pageIndex === currentIndex,
  );
  const activeComicPage = comicFlowContent
    .find((entry) => entry.chapter.id === activeComicChapter.id)
    ?.pages.find((entry) => entry.page.index === currentIndex)?.page;
  const currentPageMime = isComicContinuous
    ? (activeComicPage?.mime ?? "")
    : (pages[currentIndex]?.mime ?? "");
  const currentTextPage = pageTexts[currentIndex] ?? "";
  const highlightedMarkup = (markup: string, pageIndex: number): string => {
    const phrases = bookmarks
      .filter(
        (bookmark) =>
          bookmark.pageIndex === pageIndex && Boolean(bookmark.highlightText),
      )
      .map((bookmark) => bookmark.highlightText ?? "");
    if (searchQuery.trim()) phrases.push(searchQuery.trim());
    return phrases.length > 0 ? highlightReaderText(markup, phrases) : markup;
  };
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
  const isNovelContinuous =
    readerMode === "novel" &&
    readerPreferences.novelInfiniteScroll &&
    textPages.length > 0;
  const isContinuousReader = isComicContinuous || isNovelContinuous;
  const shouldAutoHideReaderChrome = isImmersive;
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
  const navigationChapterId = isNovel
    ? activeNovelChapter.id
    : isComicContinuous
      ? activeComicChapter.id
      : chapter.id;
  const chapterPosition = seriesChapters.findIndex(
    (entry) => entry.id === navigationChapterId,
  );
  const previousChapter =
    chapterPosition > 0 ? seriesChapters[chapterPosition - 1] : undefined;
  const nextChapter =
    chapterPosition >= 0 ? seriesChapters[chapterPosition + 1] : undefined;
  const pageProgress =
    totalPages > 0 ? ((currentIndex + 1) / totalPages) * 100 : 0;
  const progressPercent = Math.round(
    isNovel ? novelScrollProgressRef.current * 100 : pageProgress,
  );
  const comicPageImageStyle = (
    isCurrentPage: boolean,
    isContinuous: boolean,
  ): React.CSSProperties => {
    const fitWidth = Math.min(normalizedReaderWidth, viewportWidth);
    const baseStyle = isContinuous ? styles.webtoonImage : styles.image;
    const brightness = Math.round(
      readerPreferences.comicBrightness *
        (1 - readerPreferences.comicDim / 100),
    );
    const invert = readerPreferences.comicInverted
      ? 100
      : readerPreferences.comicInvert;
    const warmth = readerPreferences.comicCustomColorFilter
      ? readerPreferences.comicWarmth
      : readerPreferences.comicSepia;
    const filter = `brightness(${brightness}%) contrast(${readerPreferences.comicContrast}%) saturate(${readerPreferences.comicSaturation}%) invert(${invert}%) sepia(${warmth}%) grayscale(${readerPreferences.comicGrayscale ? 100 : 0}%)`;
    const transformStyle: React.CSSProperties = {
      transform: `translate3d(${zoomTransform.translateX}px, ${zoomTransform.translateY}px, 0) scale(${zoomTransform.scale}) rotate(${pageRotation}deg)`,
      transformOrigin: "center",
    };
    const cropStyle = readerPreferences.comicCropBorders
      ? { clipPath: "inset(2%)" }
      : {};
    if (isContinuous) {
      return {
        ...baseStyle,
        filter,
        ...cropStyle,
        width: `${fitWidth}px`,
        height: "auto",
        maxWidth: "none",
        maxHeight: "none",
        ...(pageRotation ? { transform: `rotate(${pageRotation}deg)` } : {}),
        transformOrigin: "center",
      };
    }

    return {
      ...baseStyle,
      filter,
      ...cropStyle,
      width: "auto",
      height: "auto",
      maxWidth: `${fitWidth}px`,
      maxHeight: `${viewportSize.height}px`,
      ...(isCurrentPage ? transformStyle : {}),
    };
  };
  function rememberComicPageAspect(
    pageId: string,
    event: React.SyntheticEvent<HTMLImageElement>,
  ): void {
    const image = event.currentTarget;
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    const aspect = image.naturalWidth / image.naturalHeight;
    if (aspect <= 1.25) return;
    setWidePageAspects((current) =>
      current[pageId] === aspect ? current : { ...current, [pageId]: aspect },
    );
  }

  function renderComicPage(
    page: Page,
    url: string,
    isCurrentPage: boolean,
    isContinuous: boolean,
  ): React.ReactNode {
    const aspect = widePageAspects[page.id];
    if (readerPreferences.comicSplitWidePages && aspect) {
      const imageStyle = comicPageImageStyle(isCurrentPage, isContinuous);
      return (
        <div
          key={page.id}
          className="readerSplitWideSpread"
          data-reader-page-index={page.index}
          data-reader-zoom-target={isCurrentPage ? "" : undefined}
          style={{
            ...imageStyle,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            width: `${Math.min(normalizedReaderWidth, viewportWidth)}px`,
            height: "auto",
            aspectRatio: String(aspect),
            overflow: "visible",
          }}
        >
          {(["left", "right"] as const).map((side) => (
            <div
              key={side}
              className={`readerSplitWideHalf readerSplitWideHalf-${side}`}
            >
              <img
                src={url}
                alt={
                  side === "left"
                    ? `${chapter?.title} page ${page.index + 1}`
                    : ""
                }
                aria-hidden={side === "right" ? true : undefined}
                data-reader-page-index={page.index}
                onLoad={(event) => rememberComicPageAspect(page.id, event)}
              />
            </div>
          ))}
        </div>
      );
    }

    return (
      <img
        key={page.id}
        src={url}
        alt={`${chapter?.title} page ${page.index + 1}`}
        data-reader-page-index={page.index}
        data-reader-zoom-target={isCurrentPage ? "" : undefined}
        decoding="async"
        onLoad={(event) => rememberComicPageAspect(page.id, event)}
        style={comicPageImageStyle(isCurrentPage, isContinuous)}
      />
    );
  }
  return (
    <main
      ref={readerRootRef}
      className={`readerPageRoot${isImmersive ? " readerFocusActive" : ""}`}
      onClickCapture={(event) => {
        handleReaderClick(event);
        if (!(event.target as HTMLElement).closest(".readerPanelContextMenu")) {
          setPanelContextMenu(null);
        }
      }}
      style={styles.page}
    >
      <section style={styles.panel}>
        <header
          className={`readerChrome readerHudHeader${shouldAutoHideReaderChrome && !isUiVisible ? " readerChromeHidden" : ""}`}
        >
          <Link
            to={`/series/${encodeURIComponent(chapter.seriesId)}`}
            className="readerHudBack"
            aria-label="Back to series"
            title="Back to series"
          >
            <ArrowLeft size={18} />
          </Link>
          <button
            type="button"
            className="readerHudTitle"
            aria-label="Choose chapter"
            onClick={() => {
              setChapterPickerQuery("");
              setIsChapterPickerOpen(true);
            }}
          >
            <span>
              {isNovel
                ? activeNovelChapter?.title
                : isComicContinuous
                  ? activeComicChapter.title
                  : chapter.title}
            </span>
            <ChevronDown size={14} />
          </button>
          <div className="readerHudHeaderActions">
            <button
              type="button"
              className="readerHudIconButton"
              aria-label="Page grid and thumbnails"
              title="Page grid and thumbnails"
              onClick={() => setIsPageGridOpen(true)}
            >
              <Grid2X2 size={17} />
            </button>
            <button
              type="button"
              className="readerHudIconButton"
              aria-label={
                isImmersive ? "Exit immersive mode" : "Immersive mode"
              }
              aria-pressed={isImmersive}
              title={isImmersive ? "Exit immersive mode" : "Immersive mode"}
              onClick={toggleImmersiveMode}
            >
              {isImmersive ? <Eye size={17} /> : <EyeOff size={17} />}
            </button>
            <button
              type="button"
              className="readerHudIconButton"
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? <Minimize2 size={17} /> : <Expand size={17} />}
            </button>
          </div>
        </header>

        <aside
          className={`readerHudRail readerHudRailLeft readerChrome${shouldAutoHideReaderChrome && !isUiVisible ? " readerChromeHidden" : ""}`}
          aria-label="Page and series actions"
        >
          <button
            type="button"
            className="readerHudIconButton"
            aria-label="Search this book"
            title="Search this book"
            onClick={() => setIsSearchOpen(true)}
          >
            <Search size={17} />
          </button>
          <button
            type="button"
            className="readerHudIconButton"
            aria-label="Comments and notes"
            title="Comments and notes"
            onClick={() => void openBookmarkDrawer()}
          >
            <MessageCircle size={17} />
          </button>
          <button
            type="button"
            className="readerHudIconButton"
            aria-label="Capture image"
            title="Capture image"
            disabled={!currentPageMime.startsWith("image/")}
            onClick={() =>
              void downloadPanelImage(
                isComicContinuous ? activeComicChapter.id : chapter.id,
                currentIndex,
              )
            }
          >
            <Camera size={17} />
          </button>
          <button
            type="button"
            className="readerHudIconButton"
            aria-label="Share chapter"
            title="Share chapter"
            onClick={() => void shareCurrentChapter()}
          >
            <Share2 size={17} />
          </button>
        </aside>

        <aside
          className={`readerHudRail readerHudRailRight readerChrome${shouldAutoHideReaderChrome && !isUiVisible ? " readerChromeHidden" : ""}`}
          aria-label="Reading tools"
        >
          <button
            type="button"
            className={`readerHudIconButton${isCurrentPageBookmarked ? " readerHudIconButtonActive" : ""}`}
            aria-label={
              isCurrentPageBookmarked ? "Remove page bookmark" : "Bookmark page"
            }
            aria-pressed={isCurrentPageBookmarked}
            title={
              isCurrentPageBookmarked ? "Remove bookmark" : "Bookmark page"
            }
            onClick={() => void toggleBookmark()}
          >
            <Bookmark
              size={17}
              fill={isCurrentPageBookmarked ? "currentColor" : "none"}
            />
          </button>
          <button
            type="button"
            className={`readerHudIconButton${isSpeaking ? " readerHudIconButtonActive" : ""}`}
            aria-label={isSpeaking ? "Stop reading aloud" : "Read aloud"}
            title={isSpeaking ? "Stop reading aloud" : "Read aloud"}
            disabled={!isNovel}
            onClick={toggleSpeech}
          >
            {isSpeaking ? <Pause size={17} /> : <AudioLines size={17} />}
          </button>
          {!isNovel ? (
            <button
              type="button"
              className={`readerHudIconButton${readerMode === "webtoon" ? " readerHudIconButtonActive" : ""}`}
              aria-label={`Switch to ${readerMode === "webtoon" ? "paginated" : "webtoon"} mode`}
              aria-pressed={readerMode === "webtoon"}
              title={
                readerMode === "webtoon" ? "Paginated mode" : "Webtoon mode"
              }
              onClick={() =>
                void persistReaderMode(
                  readerMode === "webtoon" ? "flip" : "webtoon",
                )
              }
            >
              <PanelsTopLeft size={17} />
            </button>
          ) : null}
          <button
            type="button"
            className="readerHudIconButton"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={zoomLevel >= 4}
            onClick={() => changeZoom(zoomLevel + 0.25)}
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            className="readerHudIconButton"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={zoomLevel <= 1}
            onClick={() => changeZoom(zoomLevel - 0.25)}
          >
            <Minus size={17} />
          </button>
          <button
            type="button"
            className={`readerHudIconButton${isAutoScrollActive ? " readerHudIconButtonActive" : ""}`}
            aria-label={
              isAutoScrollActive ? "Stop auto-scroll" : "Start auto-scroll"
            }
            aria-pressed={isAutoScrollActive}
            title={isAutoScrollActive ? "Stop auto-scroll" : "Auto-scroll"}
            disabled={!isNovel && !isComicContinuous}
            onClick={() => setIsAutoScrollActive((active) => !active)}
          >
            {isAutoScrollActive ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button
            type="button"
            className="readerHudIconButton"
            aria-label={isNovel ? "Reader formatting" : "Reader settings"}
            title={isNovel ? "Reader formatting" : "Reader settings"}
            onClick={openReaderSettings}
          >
            {isNovel ? <Type size={17} /> : <Settings2 size={17} />}
          </button>
        </aside>

        <header
          className="legacyReaderHeader"
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
            <button
              type="button"
              className="readerChapterTitleTrigger"
              aria-label="Choose chapter"
              onClick={() => {
                setChapterPickerQuery("");
                setIsChapterPickerOpen(true);
              }}
            >
              <h1 className="title" style={styles.title}>
                {isNovel
                  ? activeNovelChapter?.title
                  : isComicContinuous
                    ? activeComicChapter.title
                    : chapter.title}
              </h1>
              <ChevronDown size={15} />
            </button>
          </div>
          <div className="actionRow" style={styles.actionRow}>
            <div
              className="readerHeaderQuickActions"
              role="group"
              aria-label="Reader controls"
            >
              {isNovel ? (
                <>
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
                    aria-label="Notes and bookmarks"
                    title="Notes and bookmarks"
                    onClick={() => void openBookmarkDrawer()}
                    style={styles.iconButton}
                  >
                    <BookmarkCheck size={16} />
                  </button>
                  <button
                    type="button"
                    className="readerHeaderQuickButton"
                    aria-label="Search this book"
                    title="Search this book"
                    onClick={() => setIsSearchOpen(true)}
                    style={styles.iconButton}
                  >
                    <Search size={16} />
                  </button>
                  <button
                    type="button"
                    className="readerHeaderQuickButton"
                    aria-label={
                      isSpeaking ? "Stop reading aloud" : "Read aloud"
                    }
                    title={isSpeaking ? "Stop reading aloud" : "Read aloud"}
                    onClick={toggleSpeech}
                    style={styles.iconButton}
                  >
                    {isSpeaking ? <X size={16} /> : <AudioLines size={16} />}
                  </button>
                  <button
                    type="button"
                    className="readerHeaderQuickButton"
                    aria-label="Table of contents"
                    title="Table of contents"
                    onClick={() => setIsContentsOpen(true)}
                    style={styles.iconButton}
                  >
                    <List size={16} />
                  </button>
                  <button
                    type="button"
                    className="readerHeaderQuickButton"
                    aria-label="Annotate selection"
                    title="Annotate selection"
                    onClick={() => void annotateTextSelection()}
                    style={styles.iconButton}
                  >
                    <Highlighter size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="readerHeaderQuickButton"
                    aria-label="Page overview"
                    title="Page overview"
                    onClick={() => setIsPageGridOpen(true)}
                    style={styles.iconButton}
                  >
                    <Grid2X2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="readerHeaderQuickButton"
                    aria-label="Capture page"
                    title="Capture page"
                    disabled={!currentPageMime.startsWith("image/")}
                    onClick={() =>
                      void downloadPanelImage(
                        isComicContinuous ? activeComicChapter.id : chapter.id,
                        currentIndex,
                      )
                    }
                    style={styles.iconButton}
                  >
                    <Camera size={16} />
                  </button>
                </>
              )}
              <button
                type="button"
                className="readerHeaderQuickButton"
                aria-label={isNovel ? "Reader formatting" : "Reader settings"}
                aria-pressed={isReaderSettingsOpen}
                title={isNovel ? "Reader formatting" : "Reader settings"}
                onClick={openReaderSettings}
                style={styles.iconButton}
              >
                {isNovel ? <Type size={16} /> : <Settings2 size={16} />}
              </button>
              <button
                type="button"
                className="readerHeaderQuickButton"
                aria-label={isImmersive ? "Exit focus mode" : "Focus mode"}
                aria-pressed={isImmersive}
                title={isImmersive ? "Exit focus mode" : "Focus mode"}
                onClick={toggleImmersiveMode}
                style={styles.iconButton}
              >
                {isImmersive ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
              <button
                type="button"
                className="readerHeaderQuickButton"
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                onClick={() => void toggleFullscreen()}
                style={styles.iconButton}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Expand size={16} />}
              </button>
            </div>
          </div>
        </header>

        {readerPreferences.readerProgressBarEnabled ? (
          <div
            ref={readerProgressTrackRef}
            className="readerProgress"
            style={styles.readerProgressTrack}
            role="progressbar"
            aria-label="Reading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <span
              ref={readerProgressFillRef}
              style={{
                ...styles.readerProgressFill,
                width: `${progressPercent}%`,
                height: "100%",
              }}
            />
          </div>
        ) : null}

        {readerPreferences.readerProgressShowPage ||
        readerPreferences.readerProgressShowChapter ? (
          <div
            className={`readerProgressIndicator readerProgressIndicator-${readerPreferences.readerProgressIndicatorPosition}`}
            role="group"
            aria-label="Reading progress details"
          >
            {readerPreferences.readerProgressShowPage ? (
              <span ref={isNovel ? novelProgressIndicatorRef : undefined}>
                {isNovel
                  ? `Progress ${progressPercent}%`
                  : `Page ${currentIndex + 1} / ${totalPages || 1}`}
              </span>
            ) : null}
            {readerPreferences.readerProgressShowChapter ? (
              <span>
                Chapter {chapterPosition >= 0 ? chapterPosition + 1 : 1} /{" "}
                {seriesChapters.length || 1}
              </span>
            ) : null}
          </div>
        ) : null}

        <div
          className={`readerChrome readerBottomHud${shouldAutoHideReaderChrome && !isUiVisible ? " readerChromeHidden" : ""}`}
          aria-label="Reading navigation"
        >
          <input
            ref={isNovel ? novelProgressInputRef : undefined}
            className="readerBottomSlider"
            type="range"
            min={0}
            max={isNovel ? 1000 : Math.max(totalPages - 1, 0)}
            value={
              isNovel
                ? Math.round(novelScrollProgressRef.current * 1000)
                : Math.max(currentIndex, 0)
            }
            disabled={!isNovel && totalPages <= 1}
            aria-label={isNovel ? "Novel reading progress" : "Page position"}
            onChange={(event) => {
              if (isNovel) {
                const progress = Number(event.currentTarget.value) / 1000;
                const frame = viewerFrameRef.current;
                if (!frame) return;
                updateNovelProgressDisplay(progress);
                frame.scrollTop =
                  progress * (frame.scrollHeight - frame.clientHeight);
              } else {
                selectReaderPage(Number(event.currentTarget.value));
              }
            }}
          />
          <span className="readerBottomCount">
            {isNovel
              ? `Progress ${Math.round(novelScrollProgressRef.current * 100)}%`
              : `Page ${currentIndex + 1}/${totalPages || 1}`}
          </span>
          {!isNovel ? (
            <button
              type="button"
              className={`readerHudIconButton readerBottomMode${readerMode === "webtoon" ? " readerHudIconButtonActive" : ""}`}
              aria-label={`Switch to ${readerMode === "webtoon" ? "paginated" : "web"} mode`}
              aria-pressed={readerMode === "webtoon"}
              title={readerMode === "webtoon" ? "Webtoon" : "Paginated"}
              onClick={() =>
                void persistReaderMode(
                  readerMode === "webtoon" ? "flip" : "webtoon",
                )
              }
            >
              {readerMode === "webtoon" ? (
                <PanelsTopLeft size={16} />
              ) : (
                <BookOpen size={16} />
              )}
            </button>
          ) : null}
          <button
            type="button"
            className="readerHudIconButton"
            aria-label="Previous page"
            title="Previous page"
            disabled={!isNovel && currentIndex <= 0}
            onClick={() => {
              if (isNovel) {
                viewerFrameRef.current?.scrollBy({
                  top: -Math.max(
                    240,
                    (viewerFrameRef.current?.clientHeight ?? 0) * 0.8,
                  ),
                  behavior: "smooth",
                });
              } else {
                selectReaderPage(currentIndex - 1);
              }
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="readerHudIconButton"
            aria-label="Next page"
            title="Next page"
            disabled={!isNovel && currentIndex >= totalPages - 1}
            onClick={() => {
              if (isNovel) {
                viewerFrameRef.current?.scrollBy({
                  top: Math.max(
                    240,
                    (viewerFrameRef.current?.clientHeight ?? 0) * 0.8,
                  ),
                  behavior: "smooth",
                });
              } else {
                selectReaderPage(currentIndex + 1);
              }
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="legacyReaderToolbar">
          <div className="readerToolbarMain">
            {isNovel ? (
              <input
                ref={novelProgressInputRef}
                className="readerNovelProgress"
                type="range"
                min={0}
                max={1000}
                value={Math.round(novelScrollProgressRef.current * 1000)}
                aria-label="Novel reading progress"
                onChange={(event) => {
                  const progress = Number(event.currentTarget.value) / 1000;
                  const frame = viewerFrameRef.current;
                  if (!frame) return;
                  updateNovelProgressDisplay(progress);
                  frame.scrollTop =
                    progress * (frame.scrollHeight - frame.clientHeight);
                }}
              />
            ) : (
              <div style={styles.chapterNav}>
                <button
                  type="button"
                  aria-label="Previous chapter"
                  disabled={!previousChapter}
                  onClick={() => {
                    if (previousChapter) {
                      navigate(
                        `/read/${encodeURIComponent(previousChapter.id)}`,
                      );
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
            )}
            {!isNovel ? (
              <div className="readerModeButtons" style={styles.modeButtons}>
                <button
                  type="button"
                  className="modeButton"
                  aria-label={`Switch to ${readerMode === "webtoon" ? "paginated" : "web"} mode`}
                  aria-pressed={readerMode === "webtoon"}
                  title={`Switch to ${readerMode === "webtoon" ? "paginated" : "web"} mode`}
                  onClick={() =>
                    void persistReaderMode(
                      readerMode === "webtoon" ? "flip" : "webtoon",
                    )
                  }
                  style={{
                    ...styles.modeButton,
                    ...styles.activeModeButton,
                  }}
                >
                  {readerMode === "webtoon" ? (
                    <PanelsTopLeft size={16} />
                  ) : (
                    <BookOpen size={16} />
                  )}
                  <span className="readerModeLabel">
                    {readerMode === "webtoon" ? "Web" : "Paginated"}
                  </span>
                </button>
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
            {!isNovel && !isContinuousReader ? (
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
            ) : !isNovel ? (
              <span style={styles.pageIndicator}>
                {`Page ${currentIndex + 1} / ${totalPages || 1}`}
              </span>
            ) : null}
          </div>
        </div>

        {bookmarkError ? (
          <p role="alert" style={styles.errorText}>
            {bookmarkError}
          </p>
        ) : null}

        {isChapterPickerOpen ? (
          <div
            className="readerSheetOverlay"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget)
                setIsChapterPickerOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsChapterPickerOpen(false);
            }}
          >
            <section
              className="readerChapterSheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reader-chapters-title"
            >
              <header className="readerSheetHeader">
                <h2 id="reader-chapters-title">Chapters</h2>
                <button
                  type="button"
                  aria-label="Close chapters"
                  onClick={() => setIsChapterPickerOpen(false)}
                >
                  <X size={17} />
                </button>
              </header>
              <label className="readerChapterSearch">
                <Search size={15} />
                <input
                  autoFocus
                  type="search"
                  aria-label="Search chapters"
                  value={chapterPickerQuery}
                  onChange={(event) =>
                    setChapterPickerQuery(event.currentTarget.value)
                  }
                  placeholder="Search chapters"
                />
              </label>
              <div className="readerChapterList">
                {seriesChapters
                  .filter((entry) =>
                    entry.title
                      .toLocaleLowerCase()
                      .includes(chapterPickerQuery.trim().toLocaleLowerCase()),
                  )
                  .map((entry, index) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-current={
                        entry.id === navigationChapterId ? "true" : undefined
                      }
                      onClick={() => {
                        setIsChapterPickerOpen(false);
                        setChapterPickerQuery("");
                        navigate(`/read/${encodeURIComponent(entry.id)}`);
                      }}
                    >
                      <span>
                        {entry.number !== undefined
                          ? `Chapter ${entry.number}`
                          : `Chapter ${index + 1}`}
                      </span>
                      <strong>{entry.title}</strong>
                    </button>
                  ))}
                {seriesChapters.filter((entry) =>
                  entry.title
                    .toLocaleLowerCase()
                    .includes(chapterPickerQuery.trim().toLocaleLowerCase()),
                ).length === 0 ? (
                  <p className="readerShareMessage">No matching chapters.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {isReaderSettingsOpen ? (
          <div
            className="readerSettingsOverlay"
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
                width: "min(720px, 100vw)",
                position: "fixed",
                top: "auto",
                right: 0,
                bottom: 0,
                left: 0,
                height: "min(60dvh, 600px)",
                maxHeight: "60dvh",
                transform: "none",
              }}
              className="readerSettingsPanel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reader-settings-title"
            >
              <header className="readerSettingsSheetHeader">
                <div className="readerSettingsSheetTitle">
                  {readerSettingsSection !== "menu" ? (
                    <button
                      type="button"
                      className="readerSettingsBack"
                      aria-label="Back to settings"
                      onClick={() => setReaderSettingsSection("menu")}
                    >
                      <ChevronLeft size={18} />
                    </button>
                  ) : null}
                  <h2 id="reader-settings-title">
                    {readerSettingsSection === "menu"
                      ? "Settings"
                      : readerSettingsSection === "reader"
                        ? "Reader"
                        : readerSettingsSection === "graphics"
                          ? "Graphics"
                          : readerSettingsSection === "interface"
                            ? "Interface"
                            : "Chapters"}
                  </h2>
                </div>
                <button
                  type="button"
                  className="readerSettingsClose"
                  aria-label="Close settings"
                  onClick={() => setIsReaderSettingsOpen(false)}
                >
                  <X size={17} />
                </button>
              </header>

              {readerSettingsSection === "menu" ? (
                <nav
                  className="readerSettingsMenu"
                  aria-label="Reader settings sections"
                >
                  {[
                    { value: "reader", label: "Reader", Icon: BookOpen },
                    { value: "graphics", label: "Graphics", Icon: Palette },
                    {
                      value: "interface",
                      label: "Interface",
                      Icon: SlidersHorizontal,
                    },
                    { value: "chapters", label: "Chapters", Icon: List },
                  ].map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setReaderSettingsSection(value as ReaderSettingsSection)
                      }
                    >
                      <Icon size={19} />
                      <span>{label}</span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </nav>
              ) : readerSettingsSection === "interface" ? (
                <div
                  className="readerSettingsSection"
                  style={styles.settingsSection}
                >
                  <label className="readerProgressToggle">
                    <span>Immersive mode</span>
                    <input
                      type="checkbox"
                      aria-label="Immersive mode"
                      checked={isImmersive}
                      onChange={(event) =>
                        setImmersiveMode(event.currentTarget.checked)
                      }
                    />
                  </label>
                  <h3 className="readerSettingsGroupTitle">
                    Progress Indicator
                  </h3>
                  <div className="readerProgressSettings">
                    <label className="readerProgressToggle">
                      <span>Page</span>
                      <input
                        type="checkbox"
                        aria-label="Page progress indicator"
                        checked={readerPreferences.readerProgressShowPage}
                        onChange={(event) =>
                          updateReaderPreferences({
                            readerProgressShowPage: event.currentTarget.checked,
                          })
                        }
                      />
                    </label>
                    <label className="readerProgressToggle">
                      <span>Chapter</span>
                      <input
                        type="checkbox"
                        aria-label="Chapter progress indicator"
                        checked={readerPreferences.readerProgressShowChapter}
                        onChange={(event) =>
                          updateReaderPreferences({
                            readerProgressShowChapter:
                              event.currentTarget.checked,
                          })
                        }
                      />
                    </label>
                    <div
                      className="readerProgressIndicatorPlacement"
                      role="group"
                      aria-label="Progress indicator alignment"
                    >
                      {[
                        {
                          value: "top-left",
                          label: "Top left",
                          Icon: ArrowUpLeft,
                        },
                        {
                          value: "top-center",
                          label: "Top center",
                          Icon: ArrowUp,
                        },
                        {
                          value: "top-right",
                          label: "Top right",
                          Icon: ArrowUpRight,
                        },
                        {
                          value: "middle-left",
                          label: "Middle left",
                          Icon: ArrowLeft,
                        },
                        {
                          value: "middle-center",
                          label: "Middle center",
                          Icon: Circle,
                        },
                        {
                          value: "middle-right",
                          label: "Middle right",
                          Icon: ArrowRight,
                        },
                        {
                          value: "bottom-left",
                          label: "Bottom left",
                          Icon: ArrowDownLeft,
                        },
                        {
                          value: "bottom-center",
                          label: "Bottom center",
                          Icon: ArrowDown,
                        },
                        {
                          value: "bottom-right",
                          label: "Bottom right",
                          Icon: ArrowDownRight,
                        },
                      ].map(({ value, label, Icon }) => (
                        <button
                          key={value}
                          type="button"
                          aria-label={`${label} progress indicator`}
                          aria-pressed={
                            readerPreferences.readerProgressIndicatorPosition ===
                            value
                          }
                          title={label}
                          onClick={() =>
                            updateReaderPreferences({
                              readerProgressIndicatorPosition:
                                value as Preferences["readerProgressIndicatorPosition"],
                            })
                          }
                        >
                          <Icon size={17} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <h3 className="readerSettingsGroupTitle">Progress Bar</h3>
                  <label className="readerProgressToggle">
                    <span>Show progress bar</span>
                    <input
                      type="checkbox"
                      aria-label="Show progress bar"
                      checked={readerPreferences.readerProgressBarEnabled}
                      onChange={(event) =>
                        updateReaderPreferences({
                          readerProgressBarEnabled: event.currentTarget.checked,
                        })
                      }
                    />
                  </label>
                </div>
              ) : readerSettingsSection === "graphics" ? (
                <div
                  className="readerSettingsSection"
                  style={styles.settingsSection}
                >
                  {[
                    {
                      id: "comic-brightness",
                      label: "Brightness",
                      value: readerPreferences.comicBrightness,
                      min: 50,
                      max: 150,
                      step: 5,
                      key: "comicBrightness" as const,
                    },
                    {
                      id: "comic-dim",
                      label: "Dim",
                      value: readerPreferences.comicDim,
                      min: 0,
                      max: 100,
                      step: 5,
                      key: "comicDim" as const,
                    },
                    {
                      id: "comic-warmth",
                      label: "Warmth",
                      value: readerPreferences.comicWarmth,
                      min: 0,
                      max: 100,
                      step: 5,
                      key: "comicWarmth" as const,
                    },
                    {
                      id: "comic-saturation",
                      label: "Saturation",
                      value: readerPreferences.comicSaturation,
                      min: 0,
                      max: 200,
                      step: 5,
                      key: "comicSaturation" as const,
                    },
                    {
                      id: "comic-contrast",
                      label: "Contrast",
                      value: readerPreferences.comicContrast,
                      min: 50,
                      max: 150,
                      step: 5,
                      key: "comicContrast" as const,
                    },
                  ].map((control) => (
                    <div key={control.id} className="readerSettingsSliderRow">
                      <label htmlFor={control.id}>{control.label}</label>
                      <output htmlFor={control.id}>{control.value}%</output>
                      <input
                        id={control.id}
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={control.value}
                        disabled={
                          control.key === "comicWarmth" &&
                          !readerPreferences.comicCustomColorFilter
                        }
                        onChange={(event) =>
                          updateReaderPreferences({
                            [control.key]: Number(event.currentTarget.value),
                          })
                        }
                      />
                    </div>
                  ))}
                  <label className="readerProgressToggle">
                    <span>Grayscale</span>
                    <input
                      type="checkbox"
                      checked={readerPreferences.comicGrayscale}
                      onChange={(event) =>
                        updateReaderPreferences({
                          comicGrayscale: event.currentTarget.checked,
                        })
                      }
                    />
                  </label>
                  <label className="readerProgressToggle">
                    <span>Inverted</span>
                    <input
                      type="checkbox"
                      checked={readerPreferences.comicInverted}
                      onChange={(event) =>
                        updateReaderPreferences({
                          comicInverted: event.currentTarget.checked,
                        })
                      }
                    />
                  </label>
                  <label className="readerProgressToggle">
                    <span>Custom color filter</span>
                    <input
                      type="checkbox"
                      checked={readerPreferences.comicCustomColorFilter}
                      onChange={(event) =>
                        updateReaderPreferences({
                          comicCustomColorFilter: event.currentTarget.checked,
                        })
                      }
                    />
                  </label>
                </div>
              ) : readerSettingsSection === "chapters" ? (
                <div
                  className="readerSettingsSection"
                  style={styles.settingsSection}
                >
                  <button
                    type="button"
                    className="readerSettingsMenuItem"
                    onClick={() => {
                      setIsReaderSettingsOpen(false);
                      setIsChapterPickerOpen(true);
                    }}
                  >
                    <List size={18} />
                    <span>Open chapter list</span>
                    <ChevronRight size={16} />
                  </button>
                  <label className="readerProgressToggle">
                    <span>Continuous chapter flow</span>
                    <input
                      type="checkbox"
                      checked={
                        isNovel
                          ? readerPreferences.novelInfiniteScroll
                          : readerPreferences.comicInfiniteScroll
                      }
                      onChange={(event) =>
                        updateReaderPreferences(
                          isNovel
                            ? {
                                novelInfiniteScroll:
                                  event.currentTarget.checked,
                              }
                            : {
                                comicInfiniteScroll:
                                  event.currentTarget.checked,
                              },
                        )
                      }
                    />
                  </label>
                </div>
              ) : isNovel ? (
                <div
                  className="readerSettingsSection"
                  style={styles.settingsSection}
                >
                  <details className="novelSettingsAccordion" open>
                    <summary>Font</summary>
                    <section style={styles.novelSettingGroup}>
                      <span style={styles.novelSettingLabel}>Color theme</span>
                      <div style={styles.novelThemeRow}>
                        {NOVEL_THEME_OPTIONS.map((theme) => (
                          <button
                            key={theme.value}
                            type="button"
                            aria-label={theme.label}
                            aria-pressed={
                              readerPreferences.novelReadingTheme ===
                              theme.value
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
                              ...(readerPreferences.novelFontFamily ===
                              font.value
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
                      <div className="readerSettingSlider">
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
                          className="settingsRange"
                        />
                      </div>
                    </section>
                  </details>

                  <details className="novelSettingsAccordion">
                    <summary>Layout</summary>
                    <div style={styles.novelControlGrid}>
                      <section style={styles.novelSettingGroup}>
                        <span style={styles.novelSettingLabel}>
                          Line spacing
                        </span>
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
                                ...(readerPreferences.novelLineSpacing ===
                                spacing
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
                              ...(readerPreferences.novelTextAlignment ===
                              "left"
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
                      <label className="readerProgressToggle novelIndentToggle">
                        <span>Paragraph indent</span>
                        <input
                          type="checkbox"
                          aria-label="Paragraph indentation"
                          checked={readerPreferences.novelParagraphIndent}
                          onChange={(event) =>
                            updateReaderPreferences({
                              novelParagraphIndent: event.currentTarget.checked,
                            })
                          }
                        />
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
                                readerPreferences.novelParagraphGap ===
                                gap.value
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
                        <span style={styles.novelSettingLabel}>
                          Column width
                        </span>
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
                  </details>

                  <details className="novelSettingsAccordion">
                    <summary>Flow</summary>
                    <section style={styles.novelFlowSection}>
                      <div style={styles.novelControlHeader}>
                        <span style={styles.novelSettingLabel}>
                          Chapter flow
                        </span>
                      </div>
                      <label className="readerProgressToggle novelFlowToggle">
                        <span>Continuous chapters</span>
                        <input
                          type="checkbox"
                          aria-label="Continuous chapter flow"
                          checked={readerPreferences.novelInfiniteScroll}
                          onChange={(event) =>
                            updateReaderPreferences({
                              novelInfiniteScroll: event.currentTarget.checked,
                            })
                          }
                        />
                      </label>
                    </section>
                  </details>
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

                  <h3 className="readerSettingsGroupTitle">Rotation</h3>
                  <div className="readerSettingsRotation">
                    {[0, 90, 180, 270].map((rotation) => (
                      <button
                        key={rotation}
                        type="button"
                        aria-pressed={pageRotation === rotation}
                        onClick={() => setPageRotation(rotation)}
                      >
                        {rotation}°
                      </button>
                    ))}
                  </div>

                  <label style={styles.settingsDirectionRow}>
                    <span style={styles.settingsSliderLabel}>Tap zones</span>
                    <select
                      aria-label="Tap zones"
                      value={readerPreferences.readerTapBehavior}
                      onChange={(event) =>
                        updateReaderPreferences({
                          readerTapBehavior: event.currentTarget
                            .value as Preferences["readerTapBehavior"],
                        })
                      }
                      style={styles.settingsSelect}
                    >
                      <option value="controls">Reveal controls</option>
                      <option value="toggle-controls">Toggle controls</option>
                      <option value="page-turn">Page edges turn pages</option>
                    </select>
                  </label>

                  <h3 className="readerSettingsGroupTitle">Page display</h3>
                  <label className="readerProgressToggle">
                    <span>Continuous scroll</span>
                    <input
                      type="checkbox"
                      checked={readerPreferences.comicInfiniteScroll}
                      onChange={(event) =>
                        updateReaderPreferences({
                          comicInfiniteScroll: event.currentTarget.checked,
                        })
                      }
                    />
                  </label>
                  <label className="readerProgressToggle">
                    <span>Crop borders</span>
                    <input
                      type="checkbox"
                      checked={readerPreferences.comicCropBorders}
                      onChange={(event) =>
                        updateReaderPreferences({
                          comicCropBorders: event.currentTarget.checked,
                        })
                      }
                    />
                  </label>
                  <label className="readerProgressToggle">
                    <span>Split wide pages</span>
                    <input
                      type="checkbox"
                      checked={readerPreferences.comicSplitWidePages}
                      onChange={(event) =>
                        updateReaderPreferences({
                          comicSplitWidePages: event.currentTarget.checked,
                        })
                      }
                    />
                  </label>

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
          onContextMenu={handleReaderContextMenu}
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
                    className="novelChapterBlock"
                    data-novel-chapter-id={entry.chapter.id}
                    style={styles.novelChapterBlock}
                  >
                    <article
                      className="novelTextContent"
                      style={novelTextStyle}
                      dangerouslySetInnerHTML={{
                        __html: highlightReaderText(
                          entry.content,
                          [
                            ...(entry.chapter.id === chapter.id
                              ? bookmarks.map(
                                  (bookmark) => bookmark.highlightText ?? "",
                                )
                              : []),
                            searchQuery.trim(),
                          ].filter(Boolean),
                        ),
                      }}
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
                  dangerouslySetInnerHTML={{
                    __html: highlightedMarkup(entry.text ?? "", entry.index),
                  }}
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
                  dangerouslySetInnerHTML={{
                    __html: highlightedMarkup(currentTextPage, currentIndex),
                  }}
                />
              ) : null}
            </div>
          ) : isTextMime(currentPageMime) ? (
            <article
              data-reader-page-index={currentIndex}
              className="novelTextContent"
              style={novelTextStyle}
              dangerouslySetInnerHTML={{
                __html: highlightedMarkup(currentTextPage, currentIndex),
              }}
            />
          ) : isComicContinuous ? (
            comicFlowContent.length > 0 ? (
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
                {comicFlowContent.map((flowChapter, chapterIndex) => (
                  <section
                    key={flowChapter.chapter.id}
                    data-comic-chapter-id={flowChapter.chapter.id}
                    style={styles.comicChapterBlock}
                  >
                    {flowChapter.pages.map(({ page, url }) =>
                      url
                        ? renderComicPage(
                            page,
                            url,
                            flowChapter.chapter.id === activeComicChapter.id &&
                              page.index === currentIndex,
                            true,
                          )
                        : null,
                    )}
                    {chapterIndex < comicFlowContent.length - 1 ? (
                      <div style={styles.novelChapterDivider}>
                        <span>{flowChapter.chapter.title}</span>
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
            ) : (
              <div style={styles.emptyViewer}>Loading pages...</div>
            )
          ) : pageUrls[currentIndex] && pages[currentIndex] ? (
            renderComicPage(
              pages[currentIndex],
              pageUrls[currentIndex],
              true,
              false,
            )
          ) : (
            <div style={styles.emptyViewer}>Loading page...</div>
          )}
        </div>

        {panelContextMenu ? (
          <div
            className="readerPanelContextMenu"
            role="menu"
            aria-label="Panel actions"
            style={{ left: panelContextMenu.left, top: panelContextMenu.top }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setPanelContextMenu(null);
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void downloadPanelImage(
                  panelContextMenu.chapterId,
                  panelContextMenu.pageIndex,
                );
                setPanelContextMenu(null);
              }}
            >
              <Download size={15} /> Download image
            </button>
          </div>
        ) : null}

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
                  <p style={styles.kicker}>BOOKMARKS &amp; ANNOTATIONS</p>
                  <h2 id="reader-bookmarks-title" style={styles.gridTitle}>
                    Saved reading notes
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
                        {entry.bookmark.highlightText ? (
                          <q>{entry.bookmark.highlightText}</q>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        aria-label={
                          entry.bookmark.highlightText
                            ? `Remove annotation in ${entry.chapterTitle}`
                            : `Remove bookmark for ${entry.chapterTitle}, page ${entry.bookmark.pageIndex + 1}`
                        }
                        title={
                          entry.bookmark.highlightText
                            ? "Remove annotation"
                            : "Remove bookmark"
                        }
                        onClick={() =>
                          void removeBookmarkRecord(entry.bookmark)
                        }
                        style={
                          entry.bookmark.highlightText
                            ? styles.removeHighlightButton
                            : styles.bookmarkRemoveButton
                        }
                      >
                        {entry.bookmark.highlightText ? (
                          <>
                            <Trash2 size={15} />
                            <span>Remove highlight</span>
                          </>
                        ) : (
                          <X size={15} />
                        )}
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

        {isSearchOpen ? (
          <div
            style={styles.pageGridOverlay}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setIsSearchOpen(false);
            }}
          >
            <section
              style={styles.bookmarkDrawerDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="reader-search-title"
            >
              <header style={styles.pageGridHeader}>
                <div>
                  <p style={styles.kicker}>TEXT CONTENT</p>
                  <h2 id="reader-search-title" style={styles.gridTitle}>
                    Search this book
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close search"
                  onClick={() => setIsSearchOpen(false)}
                  style={styles.iconButton}
                >
                  <X size={17} />
                </button>
              </header>
              <div style={{ display: "flex", gap: 8, padding: 16 }}>
                <input
                  autoFocus
                  type="search"
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(event.currentTarget.value)
                  }
                  placeholder="Find a phrase in text pages"
                  aria-label="Search phrase"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "10px 12px",
                    border: "1px solid var(--app-border)",
                    borderRadius: 6,
                    background: "var(--app-panel)",
                    color: "var(--app-text)",
                    font: "inherit",
                  }}
                />
              </div>
              <div style={styles.bookmarkEntries} aria-live="polite">
                {isSearching ? (
                  <p style={styles.emptyText}>Searching this book...</p>
                ) : searchQuery.trim() ? (
                  <p style={styles.emptyText}>
                    {searchResults.length}{" "}
                    {searchResults.length === 1 ? "match" : "matches"}
                  </p>
                ) : null}
                {searchResults.map((result) => (
                  <button
                    key={`${result.chapterId}:${result.pageIndex}:${result.matchIndex}`}
                    type="button"
                    onClick={() => openTextSearchResult(result)}
                    style={{
                      display: "grid",
                      gap: 5,
                      width: "100%",
                      padding: 12,
                      border: "1px solid var(--app-border)",
                      borderRadius: 6,
                      background: "var(--app-panel)",
                      color: "var(--app-text)",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <strong>
                      {result.chapterTitle} · Page {result.pageIndex + 1}
                    </strong>
                    <span className="readerSearchSnippet">
                      {highlightSearchExcerpt(result.excerpt, searchQuery)}
                    </span>
                  </button>
                ))}
                {!isSearching &&
                searchQuery.trim() &&
                searchResults.length === 0 ? (
                  <p style={styles.emptyText}>
                    No matches in this book’s text.
                  </p>
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
    transition: "width 140ms ease, height 140ms ease",
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
  removeHighlightButton: {
    display: "inline-flex",
    minHeight: 34,
    flex: "0 0 auto",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "0 9px",
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    background: "var(--app-panel-raised)",
    color: "var(--app-danger)",
    font: "inherit",
    fontSize: 11,
    fontWeight: 650,
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
