import { type CSSProperties, useEffect, useState } from "react";
import { listAllChapters } from "./lib/storage/db";
import type { Chapter } from "./lib/storage/types";
import { importArchiveSources } from "./lib/import/importer";
import type { ImportProgressEvent } from "./lib/import/types";

type ImportLogItem = ImportProgressEvent & { key: string };

function toArchiveSources(
  files: FileList | File[],
): Array<{ name: string; blob: Blob }> {
  return Array.from(files, (file) => ({ name: file.name, blob: file }));
}

export function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [statusItems, setStatusItems] = useState<ImportLogItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  async function refreshChapters(): Promise<void> {
    setChapters(await listAllChapters());
  }

  useEffect(() => {
    void refreshChapters();
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

    await refreshChapters();
    setIsImporting(false);
  }

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <p style={styles.kicker}>Phase 2a import core</p>
        <h1 style={styles.title}>Kage Reader</h1>
        <p style={styles.description}>
          Drop .cbz or .zip files here to import chapters into browser storage.
        </p>

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
            accept=".cbz,.zip"
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

        <section>
          <h2 style={styles.sectionTitle}>Import status</h2>
          {statusItems.length === 0 ? (
            <p style={styles.emptyText}>No imports yet.</p>
          ) : (
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
          )}
        </section>

        <section>
          <h2 style={styles.sectionTitle}>Imported chapters</h2>
          {chapters.length === 0 ? (
            <p style={styles.emptyText}>No chapters imported yet.</p>
          ) : (
            <ul style={styles.list}>
              {chapters.map((chapter) => (
                <li key={chapter.id} style={styles.listItem}>
                  <span>{chapter.title}</span>
                  <span>{chapter.pageCount} pages</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b1210",
    color: "#e6f2e8",
    padding: "32px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  panel: {
    maxWidth: 880,
    margin: "0 auto",
    display: "grid",
    gap: 24,
  },
  kicker: {
    margin: 0,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#8fc49a",
    fontSize: 12,
  },
  title: {
    margin: 0,
    fontSize: 56,
    lineHeight: 1,
  },
  description: {
    margin: 0,
    maxWidth: 640,
    color: "#b5c8b8",
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
  emptyText: {
    margin: 0,
    color: "#9db0a1",
  },
};
