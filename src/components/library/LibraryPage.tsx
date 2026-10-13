import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  BookOpen,
  Heart,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  getPreferences,
  savePreferences,
  type Preferences,
} from "../../lib/preferences/preferences";
import {
  buildLibraryEntries,
  filterLibraryEntries,
  type LibraryEntry,
} from "../../lib/library/summary";
import {
  getBlob,
  getSeries,
  listAllChapters,
  listProgress,
  listSeries,
  putSeries,
} from "../../lib/storage/db";
import type { SeriesType } from "../../lib/storage/types";

const SERIES_TYPES: SeriesType[] = ["manga", "manhua", "oel", "novel"];
const SERIES_TYPE_COLORS: Record<SeriesType, string> = {
  manga: "#a675ff",
  manhua: "#ffae42",
  manhwa: "#38a9ff",
  oel: "#ff6262",
  novel: "#00b892",
};
const SERIES_TYPE_LABELS: Record<SeriesType, string> = {
  manga: "Manga & manhwa",
  manhwa: "Manga & manhwa",
  manhua: "Manhua",
  oel: "OEL",
  novel: "Novel",
};

export function LibraryPage() {
  const [searchParams] = useSearchParams();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState<SeriesType | "all">("all");
  const [selectedTag, setSelectedTag] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [favoriteError, setFavoriteError] = useState("");
  const [preferences, setPreferences] = useState<Preferences>(getPreferences);
  const requestedView = searchParams.get("view");
  const view =
    requestedView === "favorites" || requestedView === "continue"
      ? requestedView
      : "all";

  async function loadEntries(): Promise<void> {
    const [series, chapters, progress] = await Promise.all([
      listSeries(),
      listAllChapters(),
      listProgress(),
    ]);
    setEntries(buildLibraryEntries(series, chapters, progress));
    setIsLoading(false);
  }

  useEffect(() => {
    void loadEntries();
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const urls: string[] = [];

    void Promise.all(
      entries.map(async (entry) => {
        if (!entry.coverPageKey) {
          return [entry.id, ""] as const;
        }
        const coverBlob = await getBlob(entry.coverPageKey);
        if (!coverBlob) {
          return [entry.id, ""] as const;
        }
        const url = URL.createObjectURL(coverBlob);
        urls.push(url);
        return [entry.id, url] as const;
      }),
    ).then((coverEntries) => {
      if (isCancelled) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setCoverUrls(Object.fromEntries(coverEntries.filter(([, url]) => url)));
    });

    return () => {
      isCancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [entries]);

  async function toggleFavorite(entry: LibraryEntry): Promise<void> {
    const series = await getSeries(entry.id);
    if (!series) {
      return;
    }
    try {
      await putSeries({ ...series, isFavorite: !entry.isFavorite });
      setFavoriteError("");
      await loadEntries();
    } catch {
      setFavoriteError(`Could not update favorite for ${entry.title}.`);
    }
  }

  function toggleSafeMode(): void {
    const nextPreferences = savePreferences({
      ...preferences,
      safeMode: !preferences.safeMode,
    });
    setPreferences(nextPreferences);
  }

  const filteredEntries = filterLibraryEntries(entries, {
    query,
    type: selectedType,
    tag: selectedTag,
    favoriteOnly: view === "favorites",
    continueOnly: view === "continue",
    safeOnly: preferences.safeMode,
  });
  const visibleEntries = [...filteredEntries].sort((left, right) => {
    if (sortBy === "title") {
      return left.title.localeCompare(right.title);
    }
    if (sortBy === "chapters") {
      return (
        right.chapterCount - left.chapterCount ||
        left.title.localeCompare(right.title)
      );
    }
    return (
      right.updatedAt - left.updatedAt || left.title.localeCompare(right.title)
    );
  });
  const availableTags = Array.from(
    new Set(entries.flatMap((entry) => entry.tags)),
  ).sort((left, right) => left.localeCompare(right));
  const resumeEntries = [...entries]
    .filter(
      (entry) =>
        entry.resume &&
        (!preferences.safeMode ||
          !/(18\+?|adult|mature|r-?18|nc-?17)/i.test(entry.ageRating ?? "")),
    )
    .sort(
      (left, right) =>
        (right.resume?.updatedAt ?? 0) - (left.resume?.updatedAt ?? 0),
    )
    .slice(0, 5);
  const pageTitle =
    view === "favorites"
      ? "Favorites"
      : view === "continue"
        ? "Continue reading"
        : "Your library";

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <header className="libraryHeader" style={styles.headerRow}>
          <div className="libraryHeaderCopy">
            <p style={styles.kicker}>YOUR SHELF / LOCAL COLLECTION</p>
            <h1 style={styles.title}>{pageTitle}</h1>
            <p style={styles.subtitle}>
              Your stories, organized and ready when you are.
            </p>
          </div>
          <div className="libraryHeaderActions" style={styles.headerActions}>
            <button
              type="button"
              aria-pressed={preferences.safeMode}
              onClick={toggleSafeMode}
              style={styles.safeModeButton}
              title="Hide series rated 18+"
            >
              {preferences.safeMode ? (
                <ShieldCheck size={16} />
              ) : (
                <ShieldAlert size={16} />
              )}
              {preferences.safeMode ? "Safe" : "18+"}
            </button>
            <Link to="/import" className="libraryImportLink">
              <Upload size={16} />
              <span>Import books</span>
            </Link>
          </div>
        </header>

        <div style={styles.statsRow}>
          <div style={styles.statItem}>
            <span style={styles.statValue}>{entries.length}</span>
            <span style={styles.statLabel}>Series</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statValue}>
              {entries.reduce((total, entry) => total + entry.chapterCount, 0)}
            </span>
            <span style={styles.statLabel}>Chapters</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statValue}>
              {entries.reduce((total, entry) => total + entry.pageCount, 0)}
            </span>
            <span style={styles.statLabel}>Pages</span>
          </div>
          <div style={styles.statItem}>
            <span style={styles.statValue}>
              {entries.filter((entry) => entry.isFavorite).length}
            </span>
            <span style={styles.statLabel}>Favorites</span>
          </div>
        </div>

        {view === "all" && resumeEntries.length > 0 ? (
          <section style={styles.resumeSection}>
            <header style={styles.shelfHeader}>
              <div>
                <h2 style={styles.sectionTitle}>Pick up where you left off</h2>
                <p style={styles.sectionDescription}>
                  Your recent reading, right where you paused.
                </p>
              </div>
              <Link to="/?view=continue" style={styles.textLink}>
                View all <ArrowRight size={15} />
              </Link>
            </header>
            <div style={styles.resumeGrid}>
              {resumeEntries.map((entry) => {
                const resume = entry.resume;
                if (!resume) return null;
                const progressPercent = Math.min(
                  100,
                  ((resume.pageIndex + 1) / Math.max(resume.pageCount, 1)) *
                    100,
                );
                return (
                  <Link
                    key={entry.id}
                    to={`/read/${encodeURIComponent(resume.chapterId)}`}
                    style={styles.resumeCard}
                  >
                    {coverUrls[entry.id] ? (
                      <img
                        src={coverUrls[entry.id]}
                        alt=""
                        style={styles.resumeCover}
                      />
                    ) : (
                      <span style={styles.resumeCoverFallback}>
                        <BookOpen size={19} />
                      </span>
                    )}
                    <span style={styles.resumeDetails}>
                      <strong style={styles.resumeTitle}>{entry.title}</strong>
                      <span style={styles.resumeLabel}>
                        {resume.chapterTitle}
                      </span>
                      <span style={styles.resumeLabel}>
                        Page {resume.pageIndex + 1} of {resume.pageCount}
                      </span>
                      <span style={styles.progressTrack} aria-hidden="true">
                        <span
                          style={{
                            ...styles.progressFill,
                            width: `${progressPercent}%`,
                          }}
                        />
                      </span>
                    </span>
                    <ArrowRight size={16} style={styles.resumeArrow} />
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {favoriteError ? (
          <p role="alert" style={styles.errorText}>
            {favoriteError}
          </p>
        ) : null}

        <section style={styles.shelfSection} aria-label="Browse series">
          <header style={styles.shelfHeader}>
            <div>
              <h2 style={styles.sectionTitle}>
                {view === "favorites"
                  ? "Saved series"
                  : view === "continue"
                    ? "Reading in progress"
                    : "All series"}
              </h2>
              <p style={styles.sectionDescription}>
                {visibleEntries.length}{" "}
                {visibleEntries.length === 1 ? "title" : "titles"}
                {query ? ` matching “${query}”` : " in this view"}
              </p>
            </div>
            <span style={styles.viewCount}>
              <SlidersHorizontal size={14} />
              {visibleEntries.length} / {entries.length}
            </span>
          </header>

          <div
            className="libraryFilters"
            style={styles.filters}
            aria-label="Filter library"
          >
            <label className="librarySearchFilter" style={styles.filterField}>
              <span style={styles.filterLabel}>Search</span>
              <span style={styles.searchField}>
                <Search size={16} />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Find a title or tag"
                  style={styles.searchInput}
                />
              </span>
            </label>
            <label style={styles.filterField}>
              <span style={styles.filterLabel}>Content type</span>
              <select
                value={selectedType}
                onChange={(event) =>
                  setSelectedType(
                    event.currentTarget.value as SeriesType | "all",
                  )
                }
                style={styles.filterInput}
              >
                <option value="all">All types</option>
                {SERIES_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {SERIES_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.filterField}>
              <span style={styles.filterLabel}>Topic</span>
              <select
                value={selectedTag}
                onChange={(event) => setSelectedTag(event.currentTarget.value)}
                style={styles.filterInput}
              >
                <option value="">All tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            <label style={styles.filterField}>
              <span style={styles.filterLabel}>Sort by</span>
              <span style={styles.sortField}>
                <ArrowDownWideNarrow size={15} />
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.currentTarget.value)}
                  style={styles.sortSelect}
                >
                  <option value="recent">Recently added</option>
                  <option value="title">Title A-Z</option>
                  <option value="chapters">Most chapters</option>
                </select>
              </span>
            </label>
          </div>

          <div style={styles.categoryChips} aria-label="Quick content filters">
            <button
              type="button"
              aria-pressed={selectedType === "all"}
              onClick={() => setSelectedType("all")}
              style={{
                ...styles.categoryChip,
                ...(selectedType === "all" ? styles.categoryChipActive : {}),
              }}
            >
              All types <span>{entries.length}</span>
            </button>
            {SERIES_TYPES.map((type) => {
              const count = entries.filter((entry) =>
                type === "manga"
                  ? entry.type === "manga" || entry.type === "manhwa"
                  : entry.type === type,
              ).length;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={selectedType === type}
                  onClick={() => setSelectedType(type)}
                  style={{
                    ...styles.categoryChip,
                    ...(selectedType === type ? styles.categoryChipActive : {}),
                  }}
                >
                  <span
                    style={{
                      ...styles.categoryDot,
                      background: SERIES_TYPE_COLORS[type],
                    }}
                  />
                  {SERIES_TYPE_LABELS[type]}
                  <span>{count}</span>
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <p style={styles.emptyText}>Loading series...</p>
          ) : entries.length === 0 ? (
            <div style={styles.emptyCard}>
              <BookOpen size={25} />
              <strong>Your shelf is waiting.</strong>
              <span>
                Import a comic archive or EPUB to start reading locally.
              </span>
              <Link to="/import" style={styles.primaryButton}>
                <Plus size={16} /> Import your first title
              </Link>
            </div>
          ) : visibleEntries.length === 0 ? (
            <div style={styles.emptyCard}>
              <BookOpen size={22} />
              <strong>
                {view === "favorites"
                  ? "No favorites yet"
                  : view === "continue"
                    ? "Nothing in progress"
                    : "No matches found"}
              </strong>
              <span>
                {view === "favorites"
                  ? "Save a title with the heart button and it will appear here."
                  : view === "continue"
                    ? "Open any chapter and your reading position will appear here."
                    : "Try another title, tag, or content type."}
              </span>
            </div>
          ) : (
            <div style={styles.grid}>
              {visibleEntries.map((entry) => (
                <article key={entry.id} style={styles.cardShell}>
                  <Link
                    to={
                      view === "continue" && entry.resume
                        ? `/read/${encodeURIComponent(entry.resume.chapterId)}`
                        : `/series/${encodeURIComponent(entry.id)}`
                    }
                    style={styles.seriesCard}
                  >
                    <div style={styles.coverPlaceholder}>
                      {coverUrls[entry.id] ? (
                        <img
                          src={coverUrls[entry.id]}
                          alt={`${entry.title} cover`}
                          style={styles.coverImage}
                        />
                      ) : (
                        <span style={styles.coverFallback}>
                          <BookOpen size={30} />
                          <span>
                            {entry.title.slice(0, 1).toLocaleUpperCase()}
                          </span>
                        </span>
                      )}
                      <span style={styles.typePill}>
                        {entry.type === "manhwa" ? "Manga" : entry.type}
                      </span>
                    </div>
                    <div style={styles.cardBody}>
                      <h2 style={styles.seriesTitle}>{entry.title}</h2>
                      <p style={styles.metaText}>
                        {entry.chapterCount} chapters{" "}
                        <span aria-hidden="true">·</span> {entry.pageCount}{" "}
                        pages
                      </p>
                      {entry.resume ? (
                        <span style={styles.cardResume}>
                          {view === "continue" ? "Resume" : "Last read"} ·{" "}
                          {entry.resume.chapterTitle}
                        </span>
                      ) : null}
                      {entry.tags.length > 0 ? (
                        <ul style={styles.tagList}>
                          {entry.tags.slice(0, 3).map((tag) => (
                            <li key={tag} style={styles.tag}>
                              {tag}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </Link>
                  <button
                    type="button"
                    aria-label={
                      entry.isFavorite
                        ? `Remove ${entry.title} from favorites`
                        : `Add ${entry.title} to favorites`
                    }
                    aria-pressed={entry.isFavorite}
                    onClick={() => void toggleFavorite(entry)}
                    style={{
                      ...styles.favoriteButton,
                      ...(entry.isFavorite ? styles.favoriteActive : {}),
                    }}
                  >
                    <Heart
                      size={17}
                      fill={entry.isFavorite ? "currentColor" : "none"}
                    />
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--app-bg)",
    color: "var(--app-text)",
    padding: "clamp(20px, 3vw, 40px)",
    fontFamily: "var(--font-body)",
  },
  panel: {
    maxWidth: 1260,
    margin: "0 auto",
    display: "grid",
    gap: 25,
  },
  dropZone: {
    minHeight: 70,
    border: "1px dashed var(--app-border-strong)",
    borderRadius: 10,
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: 13,
    background: "#ffffff03",
    cursor: "pointer",
    transition: "border-color 140ms ease, background 140ms ease",
  },
  filters: {
    gap: 10,
  },
  filterField: { display: "grid", gap: 6 },
  filterLabel: { color: "var(--app-muted)", fontSize: 11, fontWeight: 700 },
  filterInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 11px",
    border: "1px solid var(--app-border)",
    borderRadius: 7,
    background: "var(--app-panel)",
    color: "var(--app-text)",
    font: "inherit",
  },
  searchField: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    paddingLeft: 11,
    border: "1px solid var(--app-border)",
    borderRadius: 7,
    background: "var(--app-panel)",
    color: "var(--app-muted)",
  },
  searchFieldInput: { flex: 1, minWidth: 0 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    padding: "10px 10px 10px 0",
    border: 0,
    outline: 0,
    background: "transparent",
    color: "var(--app-text)",
    font: "inherit",
  },
  sortField: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingLeft: 11,
    border: "1px solid var(--app-border)",
    borderRadius: 7,
    background: "var(--app-panel)",
    color: "var(--app-muted)",
  },
  sortSelect: {
    width: "100%",
    padding: "10px 11px 10px 0",
    border: 0,
    outline: 0,
    background: "transparent",
    color: "var(--app-text)",
    font: "inherit",
  },
  categoryChips: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    overflowX: "auto",
    paddingBottom: 2,
    scrollbarWidth: "thin",
  },
  categoryChip: {
    display: "inline-flex",
    minHeight: 31,
    flex: "0 0 auto",
    alignItems: "center",
    gap: 7,
    padding: "0 10px",
    border: "1px solid var(--app-border)",
    borderRadius: 7,
    background: "var(--app-panel)",
    color: "var(--app-muted)",
    fontSize: 10,
    fontWeight: 600,
    textTransform: "capitalize",
    cursor: "pointer",
  },
  categoryChipActive: {
    borderColor: "var(--app-border-strong)",
    background: "var(--app-panel-raised)",
    color: "var(--app-text)",
  },
  categoryDot: { width: 7, height: 7, borderRadius: "50%" },
  fileInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    pointerEvents: "none",
  },
  sectionTitle: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: 0,
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
    justifyContent: "space-between",
    gap: 20,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  kicker: {
    margin: 0,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--app-lime)",
    fontSize: 10,
    fontWeight: 700,
  },
  title: {
    margin: "6px 0 0",
    fontFamily: "var(--font-display)",
    fontSize: 38,
    fontWeight: 600,
    lineHeight: 1.12,
  },
  subtitle: { margin: "7px 0 0", color: "var(--app-muted)", fontSize: 13 },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 40,
    padding: "0 15px",
    border: "1px solid #e2fa94",
    borderRadius: 7,
    background: "var(--app-lime)",
    color: "#182014",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  safeModeButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    padding: "0 11px",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 7,
    background: "var(--app-panel)",
    color: "var(--app-lime)",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    padding: "13px 0",
    borderTop: "1px solid var(--app-border)",
    borderBottom: "1px solid var(--app-border)",
  },
  statItem: {
    display: "grid",
    gap: 2,
    padding: "0 17px",
    borderRight: "1px solid var(--app-border)",
  },
  statValue: {
    fontFamily: "var(--font-display)",
    fontSize: 21,
    fontWeight: 600,
  },
  statLabel: { color: "var(--app-muted)", fontSize: 11 },
  resumeSection: { display: "grid", gap: 14 },
  shelfSection: { display: "grid", gap: 17 },
  shelfHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  sectionDescription: {
    margin: "5px 0 0",
    color: "var(--app-muted)",
    fontSize: 12,
  },
  textLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "var(--app-lime)",
    fontSize: 12,
    fontWeight: 700,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  resumeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },
  resumeCard: {
    position: "relative",
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: 12,
    padding: 11,
    border: "1px solid var(--app-border)",
    borderRadius: 9,
    background: "var(--app-panel)",
    color: "inherit",
    textDecoration: "none",
    transition: "border-color 140ms ease, background 140ms ease",
  },
  resumeCover: {
    width: 48,
    height: 64,
    flex: "0 0 auto",
    borderRadius: 5,
    objectFit: "cover",
    background: "var(--app-panel-raised)",
  },
  resumeCoverFallback: {
    display: "grid",
    width: 48,
    height: 64,
    flex: "0 0 auto",
    placeItems: "center",
    borderRadius: 5,
    background: "#d5f36b16",
    color: "var(--app-lime)",
  },
  resumeDetails: { display: "grid", minWidth: 0, flex: 1, gap: 3 },
  resumeTitle: {
    overflow: "hidden",
    fontSize: 12,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resumeLabel: {
    overflow: "hidden",
    color: "var(--app-muted)",
    fontSize: 10,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  resumeArrow: { flex: "0 0 auto", color: "var(--app-lime)" },
  progressTrack: {
    height: 3,
    overflow: "hidden",
    marginTop: 3,
    borderRadius: 3,
    background: "#ffffff1a",
  },
  progressFill: {
    display: "block",
    height: "100%",
    borderRadius: 3,
    background: "var(--app-lime)",
  },
  dropIcon: {
    display: "grid",
    width: 36,
    height: 36,
    flex: "0 0 auto",
    placeItems: "center",
    border: "1px solid var(--app-border)",
    borderRadius: 8,
    background: "var(--app-panel)",
    color: "var(--app-lime)",
  },
  dropCopy: { display: "grid", minWidth: 0, flex: 1, gap: 3, fontSize: 12 },
  dropHint: { color: "var(--app-muted)", fontSize: 11 },
  dropBrowse: {
    padding: "7px 10px",
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    color: "var(--app-text)",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  uploadActions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
  },
  folderButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 31,
    padding: "0 9px",
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    background: "var(--app-panel)",
    color: "var(--app-text)",
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  importStatus: {
    display: "grid",
    gap: 7,
    padding: 12,
    border: "1px solid var(--app-border)",
    borderRadius: 8,
    background: "var(--app-panel)",
  },
  importStatusHeading: {
    color: "var(--app-text)",
    fontSize: 11,
    fontWeight: 700,
  },
  importStatusItem: {
    display: "grid",
    gridTemplateColumns: "8px minmax(100px, 1fr) auto",
    minWidth: 0,
    alignItems: "center",
    gap: 9,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--app-bg)",
    color: "var(--app-muted)",
    fontSize: 11,
  },
  importStatusFilename: {
    overflow: "hidden",
    color: "var(--app-text)",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  importStatusMessage: {
    gridColumn: "2 / -1",
    overflowWrap: "anywhere",
    color: "var(--app-muted)",
    fontSize: 10,
  },
  statusDot: {
    width: 7,
    height: 7,
    flex: "0 0 auto",
    borderRadius: "50%",
    background: "var(--app-lime)",
  },
  importStatusState: { color: "var(--app-text)", textTransform: "capitalize" },
  errorText: { margin: 0, color: "var(--app-danger)", fontSize: 12 },
  viewCount: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "var(--app-muted)",
    fontSize: 11,
  },
  cardShell: { position: "relative", minWidth: 0 },
  favoriteButton: {
    position: "absolute",
    zIndex: 2,
    top: 9,
    right: 9,
    display: "grid",
    width: 33,
    height: 33,
    placeItems: "center",
    border: "1px solid #ffffff36",
    borderRadius: 50,
    background: "#101311cc",
    color: "#f1f3ed",
    cursor: "pointer",
    backdropFilter: "blur(8px)",
  },
  favoriteActive: { color: "var(--app-coral)", borderColor: "#ff967988" },
  coverImage: { width: "100%", height: "100%", objectFit: "cover" },
  coverFallback: {
    display: "grid",
    width: "100%",
    height: "100%",
    placeItems: "center",
    alignContent: "center",
    gap: 9,
    background: "linear-gradient(145deg, #293a2d, #171c19 72%)",
    color: "#d5f36b",
    fontFamily: "var(--font-display)",
    fontSize: 28,
  },
  typePill: {
    position: "absolute",
    right: 9,
    bottom: 9,
    padding: "4px 7px",
    border: "1px solid #ffffff26",
    borderRadius: 4,
    background: "#101311dc",
    color: "var(--app-text)",
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  cardResume: {
    overflow: "hidden",
    color: "var(--app-coral)",
    fontSize: 10,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  linkButton: {
    color: "#182014",
    background: "var(--app-lime)",
    textDecoration: "none",
    borderRadius: 7,
    padding: "10px 15px",
    fontWeight: 700,
  },
  secondaryButton: {
    color: "var(--app-text)",
    background: "var(--app-panel-raised)",
    border: "1px solid var(--app-border)",
    borderRadius: 7,
    padding: "10px 18px",
    fontWeight: 700,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 172px), 1fr))",
    gap: 12,
  },
  seriesCard: {
    display: "grid",
    minWidth: 0,
    gap: 0,
    overflow: "hidden",
    borderRadius: 9,
    background: "var(--app-panel)",
    border: "1px solid var(--app-border)",
    textDecoration: "none",
    color: "inherit",
    transition:
      "transform 150ms ease, border-color 150ms ease, background 150ms ease",
  },
  coverPlaceholder: {
    position: "relative",
    aspectRatio: "0.72",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    background: "var(--app-panel-raised)",
    color: "var(--app-text)",
  },
  cardBody: {
    display: "grid",
    minWidth: 0,
    gap: 5,
    padding: "11px 11px 13px",
  },
  tagList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    listStyle: "none",
    padding: 0,
    margin: "2px 0 0",
  },
  tag: {
    borderRadius: 4,
    padding: "3px 7px",
    background: "#ffffff08",
    color: "#b8c1b9",
    fontSize: 10,
  },
  seriesTitle: {
    margin: 0,
    overflow: "hidden",
    fontFamily: "var(--font-display)",
    fontSize: 13,
    fontWeight: 600,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaText: {
    margin: 0,
    color: "var(--app-muted)",
    fontSize: 10,
  },
  emptyCard: {
    display: "grid",
    justifyItems: "center",
    gap: 10,
    padding: "48px 22px",
    borderRadius: 10,
    background: "var(--app-panel)",
    border: "1px dashed var(--app-border-strong)",
    color: "var(--app-muted)",
    textAlign: "center",
  },
  emptyText: {
    margin: 0,
    color: "var(--app-muted)",
  },
};
