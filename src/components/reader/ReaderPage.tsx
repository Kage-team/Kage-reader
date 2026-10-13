import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { resolveReaderMode } from "../../lib/reader/mode";
import { getPreferences } from "../../lib/preferences/preferences";
import {
  getBlob,
  getBookmark,
  getChapter,
  deleteBookmark,
  getProgress,
  getSeries,
  listPages,
  putBookmark,
  putProgress,
  putSeries,
} from "../../lib/storage/db";
import type { Chapter, Page, ReaderMode } from "../../lib/storage/types";

export function ReaderPage() {
  const { chapterId } = useParams();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loadedChapterId, setLoadedChapterId] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [readerMode, setReaderMode] = useState<ReaderMode>("flip");
  const [bookmarkPageIndex, setBookmarkPageIndex] = useState<number | null>(
    null,
  );
  const [bookmarkError, setBookmarkError] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    if (!chapterId) {
      return;
    }

    void (async () => {
      const decodedChapterId = decodeURIComponent(chapterId);
      setLoadedChapterId(null);
      setCurrentPage(0);
      setBookmarkPageIndex(null);
      setZoomLevel(1);
      const [chapterRecord, pageRows, progress, bookmark] = await Promise.all([
        getChapter(decodedChapterId),
        listPages(decodedChapterId),
        getProgress(decodedChapterId),
        getBookmark(decodedChapterId),
      ]);

      setChapter(chapterRecord ?? null);
      setPages(pageRows);
      setLoadedChapterId(decodedChapterId);

      if (chapterRecord) {
        const seriesRecord = await getSeries(chapterRecord.seriesId);
        setReaderMode(
          resolveReaderMode(
            seriesRecord?.preferredMode,
            getPreferences().defaultReaderMode,
          ),
        );
      }

      const restoredPageIndex =
        progress &&
        progress.pageIndex >= 0 &&
        progress.pageIndex < pageRows.length
          ? progress.pageIndex
          : 0;
      setCurrentPage(restoredPageIndex);
      setBookmarkPageIndex(
        bookmark &&
          bookmark.pageIndex >= 0 &&
          bookmark.pageIndex < pageRows.length
          ? bookmark.pageIndex
          : null,
      );
    })();
  }, [chapterId]);

  useEffect(() => {
    if (!chapterId || pages.length === 0) {
      setPageUrls([]);
      setPageTexts([]);
      return;
    }

    let isCancelled = false;
    let objectUrls: string[] = [];

    void (async () => {
      const loadedUrls: Array<string | null> = [];
      const loadedTexts: string[] = [];

      for (const page of pages) {
        const blob = await getBlob(page.storageKey);
        if (!blob) {
          loadedUrls.push(null);
          continue;
        }

        if (page.mime.startsWith("image/")) {
          const objectUrl = URL.createObjectURL(blob);
          loadedUrls.push(objectUrl);
          continue;
        }

        loadedUrls.push(null);
        loadedTexts.push(await blob.text());
      }

      if (isCancelled) {
        loadedUrls
          .filter((url): url is string => Boolean(url))
          .forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      objectUrls = loadedUrls.filter((url): url is string => Boolean(url));
      setPageUrls(objectUrls);
      setPageTexts(loadedTexts);
    })();

    return () => {
      isCancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [chapterId, pages]);

  useEffect(() => {
    if (
      !chapterId ||
      loadedChapterId !== decodeURIComponent(chapterId) ||
      pages.length === 0
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
  }, [chapterId, currentPage, loadedChapterId, pages.length]);

  useEffect(() => {
    if (!chapterId || pages.length === 0) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        setCurrentPage((previous) => Math.min(previous + 1, pages.length - 1));
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setCurrentPage((previous) => Math.max(previous - 1, 0));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chapterId, pages.length]);

  async function persistReaderMode(nextMode: ReaderMode): Promise<void> {
    if (!chapter) {
      return;
    }

    setReaderMode(nextMode);
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

  async function toggleBookmark(): Promise<void> {
    if (!chapter || !chapterId || pages.length === 0) {
      return;
    }

    const decodedChapterId = decodeURIComponent(chapterId);
    try {
      if (bookmarkPageIndex === currentIndex) {
        await deleteBookmark(decodedChapterId);
        setBookmarkPageIndex(null);
      } else {
        await putBookmark({
          schemaVersion: 2,
          chapterId: decodedChapterId,
          pageIndex: currentIndex,
          createdAt: Date.now(),
        });
        setBookmarkPageIndex(currentIndex);
      }
      setBookmarkError("");
    } catch {
      setBookmarkError("Could not update this bookmark.");
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

  const totalPages = pages.length;
  const currentIndex = Math.min(Math.max(currentPage, 0), totalPages - 1);
  const currentPageMime = pages[currentIndex]?.mime ?? "";
  const currentTextPage = pageTexts[currentIndex] ?? "";
  const textScale = getPreferences().textScale;
  const modeOptions: ReaderMode[] = ["flip", "webtoon", "novel"];

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <header style={styles.headerRow}>
          <div>
            <p style={styles.kicker}>Reader</p>
            <h1 style={styles.title}>{chapter.title}</h1>
          </div>
          <div style={styles.actionRow}>
            <Link
              to={`/series/${encodeURIComponent(chapter.seriesId)}`}
              style={styles.linkButton}
            >
              Back to series
            </Link>
          </div>
        </header>

        <div style={styles.toolbar}>
          <div style={styles.modeButtons}>
            {modeOptions.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void persistReaderMode(mode)}
                style={{
                  ...styles.modeButton,
                  ...(readerMode === mode ? styles.activeModeButton : {}),
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          {readerMode !== "webtoon" ? (
            <>
              {currentPageMime.startsWith("image/") ? (
                <div
                  style={styles.zoomControls}
                  role="group"
                  aria-label="Page zoom"
                >
                  <button
                    type="button"
                    aria-label="Zoom out"
                    disabled={zoomLevel <= 0.5}
                    onClick={() =>
                      setZoomLevel((level) => Math.max(0.5, level - 0.25))
                    }
                    style={styles.bookmarkButton}
                  >
                    -
                  </button>
                  <span style={styles.pageIndicator}>
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    type="button"
                    aria-label="Zoom in"
                    disabled={zoomLevel >= 2.5}
                    onClick={() =>
                      setZoomLevel((level) => Math.min(2.5, level + 0.25))
                    }
                    style={styles.bookmarkButton}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    aria-label="Reset zoom"
                    onClick={() => setZoomLevel(1)}
                    style={styles.bookmarkButton}
                  >
                    Reset
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                aria-label={
                  bookmarkPageIndex === currentIndex
                    ? "Remove bookmark"
                    : "Bookmark this page"
                }
                aria-pressed={bookmarkPageIndex === currentIndex}
                onClick={() => void toggleBookmark()}
                style={{
                  ...styles.bookmarkButton,
                  ...(bookmarkPageIndex === currentIndex
                    ? styles.activeBookmarkButton
                    : {}),
                }}
              >
                {bookmarkPageIndex === currentIndex ? "★ Saved" : "☆ Bookmark"}
              </button>
              {bookmarkPageIndex !== null &&
              bookmarkPageIndex !== currentIndex ? (
                <button
                  type="button"
                  onClick={() => setCurrentPage(bookmarkPageIndex)}
                  style={styles.bookmarkButton}
                >
                  Go to saved page
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((previous) => Math.max(previous - 1, 0))
                }
                disabled={currentIndex === 0}
                style={{
                  ...styles.navButton,
                  opacity: currentIndex === 0 ? 0.45 : 1,
                }}
              >
                Previous
              </button>
              <span style={styles.pageIndicator}>
                {currentIndex + 1} / {totalPages || 1}
              </span>
              <button
                type="button"
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
                Next
              </button>
            </>
          ) : (
            <span style={styles.pageIndicator}>{totalPages} pages</span>
          )}
        </div>

        {bookmarkError ? (
          <p role="alert" style={styles.errorText}>
            {bookmarkError}
          </p>
        ) : null}

        <div style={styles.viewerFrame}>
          {currentPageMime.startsWith("text/") ||
          currentPageMime.includes("html") ||
          currentPageMime.includes("xml") ? (
            <article
              style={{ ...styles.textPage, fontSize: `${textScale}%` }}
              dangerouslySetInnerHTML={{ __html: currentTextPage }}
            />
          ) : readerMode === "webtoon" ? (
            pageUrls.length > 0 ? (
              <div style={styles.webtoonStrip}>
                {pageUrls.map((url, index) => (
                  <img
                    key={`${chapter.id}:${index}`}
                    src={url}
                    alt={`${chapter.title} page ${index + 1}`}
                    style={styles.webtoonImage}
                  />
                ))}
              </div>
            ) : (
              <div style={styles.emptyViewer}>Loading pages...</div>
            )
          ) : pageUrls[currentIndex] ? (
            <img
              src={pageUrls[currentIndex]}
              alt={`${chapter.title} page ${currentIndex + 1}`}
              style={{
                ...styles.image,
                transform: `scale(${zoomLevel})`,
                transformOrigin: "center",
              }}
            />
          ) : (
            <div style={styles.emptyViewer}>Loading page...</div>
          )}
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b1210",
    color: "#e6f2e8",
    padding: "32px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  panel: {
    maxWidth: 980,
    margin: "0 auto",
    display: "grid",
    gap: 18,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "end",
    gap: 16,
  },
  actionRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  kicker: {
    margin: 0,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#8fc49a",
    fontSize: 12,
  },
  title: {
    margin: "8px 0 0",
    fontSize: 32,
  },
  linkButton: {
    color: "#0b1210",
    background: "#8fc49a",
    textDecoration: "none",
    borderRadius: 999,
    padding: "10px 18px",
    fontWeight: 700,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 8,
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    flexWrap: "wrap",
  },
  modeButtons: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  zoomControls: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  modeButton: {
    border: "1px solid rgba(143, 196, 154, 0.3)",
    borderRadius: 999,
    padding: "8px 12px",
    background: "transparent",
    color: "#e6f2e8",
    textTransform: "capitalize",
    cursor: "pointer",
  },
  activeModeButton: {
    background: "#8fc49a",
    color: "#0b1210",
    borderColor: "transparent",
  },
  navButton: {
    border: "none",
    borderRadius: 999,
    padding: "10px 18px",
    fontWeight: 700,
    background: "#8fc49a",
    color: "#0b1210",
    cursor: "pointer",
  },
  bookmarkButton: {
    border: "1px solid rgba(143, 196, 154, 0.3)",
    borderRadius: 8,
    padding: "8px 12px",
    background: "transparent",
    color: "#e6f2e8",
    cursor: "pointer",
  },
  activeBookmarkButton: {
    background: "rgba(236, 202, 105, 0.18)",
    color: "#f0d985",
    borderColor: "rgba(236, 202, 105, 0.55)",
  },
  errorText: { margin: 0, color: "#ffaaa0" },
  pageIndicator: {
    color: "#dfeae1",
    fontWeight: 700,
  },
  viewerFrame: {
    minHeight: 540,
    display: "grid",
    placeItems: "center",
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(143, 196, 154, 0.2)",
    borderRadius: 20,
    padding: 16,
    minWidth: 0,
    overflow: "auto",
  },
  image: {
    maxWidth: "100%",
    maxHeight: "75vh",
    objectFit: "contain",
    borderRadius: 12,
    background: "#0b1210",
  },
  webtoonStrip: {
    width: "100%",
    display: "grid",
    gap: 12,
  },
  webtoonImage: {
    width: "100%",
    maxWidth: 720,
    margin: "0 auto",
    borderRadius: 12,
    background: "#0b1210",
  },
  textPage: {
    width: "100%",
    maxWidth: 760,
    lineHeight: 1.7,
    color: "#ebf3eb",
    background: "rgba(12, 18, 16, 0.75)",
    borderRadius: 12,
    padding: "20px 24px",
    overflowWrap: "anywhere",
  },
  emptyViewer: {
    color: "#9db0a1",
    fontSize: 18,
  },
  emptyText: {
    margin: 0,
    color: "#9db0a1",
  },
};
