import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Chapter, Series } from "../../lib/storage/types";
import { getSeries, listChapters } from "../../lib/storage/db";

export function SeriesPage() {
  const { id } = useParams();
  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  useEffect(() => {
    if (!id) {
      return;
    }

    void (async () => {
      const decodedId = decodeURIComponent(id);
      const [seriesRecord, chapterRows] = await Promise.all([
        getSeries(decodedId),
        listChapters(decodedId),
      ]);
      setSeries(seriesRecord ?? null);
      setChapters(chapterRows);
    })();
  }, [id]);

  if (!series) {
    return (
      <main style={styles.page}>
        <section style={styles.panel}>
          <p style={styles.emptyText}>Series not found.</p>
          <Link to="/" style={styles.linkButton}>
            Back to library
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <header style={styles.headerRow}>
          <div>
            <p style={styles.kicker}>Series</p>
            <h1 style={styles.title}>{series.title}</h1>
          </div>
          <Link to="/" style={styles.linkButton}>
            Back to library
          </Link>
        </header>

        <div style={styles.summaryCard}>
          <p style={styles.metaText}>Type: {series.type}</p>
          <p style={styles.metaText}>Chapters: {chapters.length}</p>
        </div>

        {chapters.length === 0 ? (
          <p style={styles.emptyText}>No chapters available for this series.</p>
        ) : (
          <ul style={styles.list}>
            {chapters.map((chapter) => (
              <li key={chapter.id} style={styles.listItem}>
                <Link
                  to={`/read/${encodeURIComponent(chapter.id)}`}
                  style={styles.chapterLink}
                >
                  <span>{chapter.title}</span>
                  <span>{chapter.pageCount} pages</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
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
    maxWidth: 760,
    margin: "0 auto",
    display: "grid",
    gap: 20,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "end",
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
    fontSize: 40,
  },
  linkButton: {
    color: "#0b1210",
    background: "#8fc49a",
    textDecoration: "none",
    borderRadius: 999,
    padding: "10px 18px",
    fontWeight: 700,
  },
  summaryCard: {
    display: "grid",
    gap: 4,
    background: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 16,
  },
  metaText: {
    margin: 0,
    color: "#dfeae1",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: 10,
  },
  listItem: {
    background: "rgba(255, 255, 255, 0.04)",
    borderRadius: 12,
    border: "1px solid rgba(143, 196, 154, 0.15)",
  },
  chapterLink: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    textDecoration: "none",
    color: "inherit",
    padding: "16px 18px",
  },
  emptyText: {
    margin: 0,
    color: "#9db0a1",
  },
};
