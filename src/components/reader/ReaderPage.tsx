import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { resolveReaderMode } from "../../lib/reader/mode";
import { getPreferences } from "../../lib/preferences/preferences";
import {
  getBlob,
  getChapter,
  getProgress,
  getSeries,
  listPages,
  putProgress,
  putSeries,
} from "../../lib/storage/db";
import type { Chapter, Page, ReaderMode } from "../../lib/storage/types";

export function ReaderPage() {
  const { chapterId } = useParams();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [readerMode, setReaderMode] = useState<ReaderMode>("flip");

  useEffect(() => {
    if (!chapterId) {
      return;
    }

    void (async () => {
      const decodedChapterId = decodeURIComponent(chapterId);
      const [chapterRecord, pageRows, progress] = await Promise.all([
        getChapter(decodedChapterId),
        listPages(decodedChapterId),
        getProgress(decodedChapterId),
      ]);

      setChapter(chapterRecord ?? null);
      setPages(pageRows);

      if (chapterRecord) {
        const seriesRecord = await getSeries(chapterRecord.seriesId);
        setReaderMode(
          resolveReaderMode(
            seriesRecord?.preferredMode,
            getPreferences().defaultReaderMode,
          ),
        );
      }

      if (
        progress &&
        progress.pageIndex >= 0 &&
        progress.pageIndex < pageRows.length
      ) {
        setCurrentPage(progress.pageIndex);
      }
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
    if (!chapterId || pages.length === 0) {
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
  }, [chapterId, currentPage, pages.length]);

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
              style={styles.image}
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
