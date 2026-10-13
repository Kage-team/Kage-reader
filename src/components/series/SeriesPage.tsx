import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Chapter, Series } from "../../lib/storage/types";
import {
  deleteSeriesWithContents,
  getSeries,
  listChapters,
  putSeries,
} from "../../lib/storage/db";

export function SeriesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [actionError, setActionError] = useState("");

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
      setDraftTitle(seriesRecord?.title ?? "");
      setDraftTags(seriesRecord?.tags?.join(", ") ?? "");
    })();
  }, [id]);

  async function saveSeriesDetails(): Promise<void> {
    if (!series) {
      return;
    }

    const title = draftTitle.trim();
    if (!title) {
      setActionError("A series title is required.");
      return;
    }

    const tags = Array.from(
      new Map(
        draftTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .map((tag) => [tag.toLocaleLowerCase(), tag] as const),
      ).values(),
    );
    const updatedSeries: Series = {
      ...series,
      title,
      tags: tags.length > 0 ? tags : undefined,
      updatedAt: Date.now(),
    };

    try {
      await putSeries(updatedSeries);
      setSeries(updatedSeries);
      setIsEditing(false);
      setActionError("");
    } catch {
      setActionError("Could not save series details.");
    }
  }

  async function removeSeries(): Promise<void> {
    if (!series || isDeleting) {
      return;
    }
    const confirmed = window.confirm(
      `Delete "${series.title}" and all of its chapters and reading progress? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setActionError("");
    try {
      await deleteSeriesWithContents(series.id);
      navigate("/", { replace: true });
    } catch {
      setIsDeleting(false);
      setActionError("Could not delete this series. Its records were left in the library.");
    }
  }

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
          <div style={styles.headerActions}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => {
                setDraftTitle(series.title);
                setDraftTags(series.tags?.join(", ") ?? "");
                setActionError("");
                setIsEditing((current) => !current);
              }}
            >
              {isEditing ? "Close editor" : "Edit details"}
            </button>
            <button
              type="button"
              style={styles.deleteButton}
              disabled={isDeleting}
              onClick={() => void removeSeries()}
            >
              {isDeleting ? "Deleting..." : "Delete series"}
            </button>
            <Link to="/" style={styles.linkButton}>
              Library
            </Link>
          </div>
        </header>

        {isEditing ? (
          <form
            style={styles.editor}
            onSubmit={(event) => {
              event.preventDefault();
              void saveSeriesDetails();
            }}
          >
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Series title</span>
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.currentTarget.value)}
                style={styles.textInput}
                required
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Tags</span>
              <input
                value={draftTags}
                onChange={(event) => setDraftTags(event.currentTarget.value)}
                placeholder="Separate tags with commas"
                style={styles.textInput}
              />
            </label>
            <div style={styles.editorActions}>
              <button type="submit" style={styles.linkButton}>
                Save details
              </button>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => {
                  setDraftTitle(series.title);
                  setDraftTags(series.tags?.join(", ") ?? "");
                  setIsEditing(false);
                  setActionError("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {actionError ? <p role="alert" style={styles.errorText}>{actionError}</p> : null}

        <div style={styles.summaryCard}>
          <p style={styles.metaText}>Type: {series.type}</p>
          <p style={styles.metaText}>Chapters: {chapters.length}</p>
          {series.writer ? <p style={styles.metaText}>Writer: {series.writer}</p> : null}
          {series.ageRating ? <p style={styles.metaText}>Rating: {series.ageRating}</p> : null}
          {series.tags?.length ? (
            <ul style={styles.tagList} aria-label="Series tags">
              {series.tags.map((tag) => <li key={tag} style={styles.tag}>{tag}</li>)}
            </ul>
          ) : null}
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
  headerActions: {
    display: "flex",
    justifyContent: "end",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  editor: {
    display: "grid",
    gap: 16,
    padding: 18,
    border: "1px solid rgba(143, 196, 154, 0.2)",
    borderRadius: 10,
    background: "rgba(255, 255, 255, 0.03)",
  },
  field: { display: "grid", gap: 6 },
  fieldLabel: { fontWeight: 700 },
  textInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    border: "1px solid rgba(143, 196, 154, 0.3)",
    borderRadius: 6,
    background: "#17221b",
    color: "#e6f2e8",
    font: "inherit",
  },
  editorActions: { display: "flex", flexWrap: "wrap", gap: 10 },
  errorText: { margin: 0, color: "#ffaaa0" },
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
  secondaryButton: {
    color: "#e6f2e8",
    background: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(143, 196, 154, 0.25)",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  deleteButton: {
    color: "#ffe5e1",
    background: "#702e2e",
    border: "1px solid #a54b45",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
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
  tagList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  tag: {
    borderRadius: 4,
    padding: "3px 7px",
    background: "rgba(143, 196, 154, 0.12)",
    color: "#c8dec9",
    fontSize: 12,
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
