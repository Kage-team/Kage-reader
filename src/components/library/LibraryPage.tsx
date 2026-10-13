import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildLibraryEntries,
  type LibraryEntry,
} from "../../lib/library/summary";
import { listAllChapters, listSeries } from "../../lib/storage/db";

export function LibraryPage() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadEntries(): Promise<void> {
      const [series, chapters] = await Promise.all([
        listSeries(),
        listAllChapters(),
      ]);
      setEntries(buildLibraryEntries(series, chapters));
      setIsLoading(false);
    }

    void loadEntries();
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <header style={styles.headerRow}>
          <div>
            <p style={styles.kicker}>Library</p>
            <h1 style={styles.title}>Your collection</h1>
          </div>
          <Link to="/" style={styles.linkButton}>
            Refresh
          </Link>
        </header>

        {isLoading ? (
          <p style={styles.emptyText}>Loading series...</p>
        ) : entries.length === 0 ? (
          <div style={styles.emptyCard}>No series imported yet.</div>
        ) : (
          <div style={styles.grid}>
            {entries.map((entry) => (
              <Link
                key={entry.id}
                to={`/series/${encodeURIComponent(entry.id)}`}
                style={styles.seriesCard}
              >
                <div style={styles.coverPlaceholder}>
                  {entry.coverPageKey ? "Cover" : "No cover"}
                </div>
                <div style={styles.cardBody}>
                  <h2 style={styles.seriesTitle}>{entry.title}</h2>
                  <p style={styles.metaText}>
                    {entry.chapterCount} chapters · {entry.pageCount} pages
                  </p>
                </div>
              </Link>
            ))}
          </div>
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
    maxWidth: 1100,
    margin: "0 auto",
    display: "grid",
    gap: 24,
  },
  headerRow: {
    display: "flex",
    alignItems: "end",
    justifyContent: "space-between",
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
    fontSize: 42,
  },
  linkButton: {
    color: "#0b1210",
    background: "#8fc49a",
    textDecoration: "none",
    borderRadius: 999,
    padding: "10px 18px",
    fontWeight: 700,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 18,
  },
  seriesCard: {
    display: "grid",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(143, 196, 154, 0.2)",
    textDecoration: "none",
    color: "inherit",
  },
  coverPlaceholder: {
    height: 180,
    display: "grid",
    placeItems: "center",
    borderRadius: 12,
    background: "linear-gradient(135deg, #233b2f, #0b1210)",
    color: "#d9e9d9",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  cardBody: {
    display: "grid",
    gap: 6,
  },
  seriesTitle: {
    margin: 0,
    fontSize: 22,
  },
  metaText: {
    margin: 0,
    color: "#b5c8b8",
  },
  emptyCard: {
    padding: 24,
    borderRadius: 18,
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px dashed #40604a",
  },
  emptyText: {
    margin: 0,
    color: "#9db0a1",
  },
};
