import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getBlob,
  getChapter,
  getProgress,
  listPages,
  putProgress,
} from "../../lib/storage/db";
import type { Chapter, Page } from "../../lib/storage/types";

export function ReaderPage() {
  const { chapterId } = useParams();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!chapterId) {
      return;
    }

    void (async () => {
      const [chapterRecord, pageRows, progress] = await Promise.all([
        getChapter(decodeURIComponent(chapterId)),
        listPages(decodeURIComponent(chapterId)),
        getProgress(decodeURIComponent(chapterId)),
      ]);

      setChapter(chapterRecord ?? null);
      setPages(pageRows);
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
    if (pages.length === 0) {
      setImageUrl(null);
      return;
    }

    const safeIndex = Math.min(Math.max(currentPage, 0), pages.length - 1);
    const page = pages[safeIndex];
    let isCancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      const blob = await getBlob(page.storageKey);
      if (isCancelled || !blob) {
        return;
      }

      objectUrl = URL.createObjectURL(blob);
      setImageUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }
        return objectUrl;
      });
    })();

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [currentPage, pages]);

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

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <header style={styles.headerRow}>
          <div>
            <p style={styles.kicker}>Reader</p>
            <h1 style={styles.title}>{chapter.title}</h1>
          </div>
          <Link
            to={`/series/${encodeURIComponent(chapter.seriesId)}`}
            style={styles.linkButton}
          >
            Back to series
          </Link>
        </header>

        <div style={styles.toolbar}>
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
                totalPages === 0 || currentIndex >= totalPages - 1 ? 0.45 : 1,
            }}
          >
            Next
          </button>
        </div>

        <div style={styles.viewerFrame}>
          {imageUrl ? (
            <img
              src={imageUrl}
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
  emptyViewer: {
    color: "#9db0a1",
    fontSize: 18,
  },
  emptyText: {
    margin: 0,
    color: "#9db0a1",
  },
};
