import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { importArchiveSources } from "../../lib/import/importer";
import type { ImportProgressEvent } from "../../lib/import/types";
import {
  buildLibraryEntries,
  type LibraryEntry,
} from "../../lib/library/summary";
import { listAllChapters, listSeries } from "../../lib/storage/db";

type ImportLogItem = ImportProgressEvent & { key: string };

function toArchiveSources(
  files: FileList | File[],
): Array<{ name: string; blob: Blob }> {
  return Array.from(files, (file) => ({ name: file.name, blob: file }));
}

export function LibraryPage() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [statusItems, setStatusItems] = useState<ImportLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  async function loadEntries(): Promise<void> {
    const [series, chapters] = await Promise.all([
      listSeries(),
      listAllChapters(),
    ]);
    setEntries(buildLibraryEntries(series, chapters));
    setIsLoading(false);
  }

  useEffect(() => {
    void loadEntries();
  }, []);

  async function handleFiles(files: FileList | File[]): Promise<void> {
    const sources = toArchiveSources(files);
    if (sources.length === 0) {
      return;
    }

    setIsImporting(true);
    const startedAt = Date.now();
    setStatusItems([]);

    const result = await importArchiveSources(sources, (event) => {
      setStatusItems((current) => [
        ...current,
        {
          ...event,
          key: `${event.fileName}:${event.index}:${event.state}:${startedAt}`,
        },
      ]);
    });

    if (result.errors.length > 0) {
      setStatusItems((current) => [
        ...current,
        ...result.errors.map((message, index) => ({
          fileName: `Error ${index + 1}`,
          index: index + 1,
          total: result.errors.length,
          state: "error" as const,
          message,
          key: `${startedAt}:error:${index}`,
        })),
      ]);
    }

    await loadEntries();
    setIsImporting(false);
  }

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <header style={styles.headerRow}>
          <div>
            <p style={styles.kicker}>Library</p>
            <h1 style={styles.title}>Your collection</h1>
          </div>
          <div style={styles.headerActions}>
            <Link to="/settings" style={styles.linkButton}>
              Settings
            </Link>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => void loadEntries()}
            >
              Refresh
            </button>
          </div>
        </header>

        <label
          style={styles.dropZone}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void handleFiles(event.dataTransfer.files);
          }}
        >
          <input
            aria-label="Import archives"
            accept=".cbz,.zip,.epub"
            multiple
            onChange={(event) => {
              const files = event.currentTarget.files;
              if (files) {
                void handleFiles(files);
              }
            }}
            style={styles.fileInput}
            type="file"
          />
          <strong>Drop archives here</strong>
          <span>{isImporting ? "Importing..." : "or choose files"}</span>
        </label>

        {statusItems.length > 0 ? (
          <section>
            <h2 style={styles.sectionTitle}>Import status</h2>
            <ul style={styles.list}>
              {statusItems.map((item) => (
                <li key={item.key} style={styles.listItem}>
                  <span>{item.fileName}</span>
                  <span>{item.state}</span>
                  {item.pageCount ? <span>{item.pageCount} pages</span> : null}
                  {item.message ? <span>{item.message}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
  dropZone: {
    border: "1px dashed #40604a",
    borderRadius: 20,
    padding: 24,
    display: "grid",
    gap: 8,
    placeItems: "center",
    background: "rgba(255, 255, 255, 0.03)",
    cursor: "pointer",
  },
  fileInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: "none",
  },
  sectionTitle: {
    margin: "0 0 8px",
    fontSize: 20,
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "grid",
    gap: 8,
  },
  listItem: {
    display: "grid",
    gap: 4,
    padding: 12,
    borderRadius: 12,
    background: "rgba(255, 255, 255, 0.05)",
  },
  headerRow: {
    display: "flex",
    alignItems: "end",
    justifyContent: "space-between",
    gap: 16,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
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
  secondaryButton: {
    color: "#e6f2e8",
    background: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(143, 196, 154, 0.25)",
    borderRadius: 999,
    padding: "10px 18px",
    fontWeight: 700,
    cursor: "pointer",
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
