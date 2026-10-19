import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDownWideNarrow,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Grid2X2,
  Heart,
  List,
  ListChecks,
  MoreHorizontal,
  Plus,
  Search,
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
  deleteSeriesWithContents,
  putSeries,
} from "../../lib/storage/db";
import type { Series, SeriesType } from "../../lib/storage/types";
import { useViewMode } from "./useViewMode";
import { ViewModeToggle } from "./ViewModeToggle";
import { ConfirmDialog } from "../ui/ConfirmDialog";

const SERIES_TYPES: SeriesType[] = [
  "manga",
  "manhwa",
  "manhua",
  "oel",
  "novel",
];
const SERIES_TYPE_COLORS: Record<SeriesType, string> = {
  manga: "#a675ff",
  manhua: "#ffae42",
  manhwa: "#38a9ff",
  oel: "#ff6262",
  novel: "#00b892",
};
const SERIES_TYPE_LABELS: Record<SeriesType, string> = {
  manga: "Manga & manhwa",
  manhwa: "Manhwa",
  manhua: "Manhua",
  oel: "OEL",
  novel: "Novel",
};

function formatHistoryAge(timestamp: number): string {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}

export function LibraryPage() {
  const [searchParams] = useSearchParams();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [recentChapters, setRecentChapters] = useState<
    Array<{
      id: string;
      seriesId: string;
      title: string;
      number?: number;
      seriesTitle: string;
      pageIndex: number;
      pageCount: number;
      updatedAt: number;
    }>
  >([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState<SeriesType | "all">("all");
  const [sortBy, setSortBy] = useState("recent");
  const [selectionMode, setSelectionMode] = useState(false);
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkMessage, setBulkMessage] = useState("");
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");
  const adultAccessUnlocked = true;
  const [preferences, setPreferences] = useState<Preferences>(getPreferences);
  const [libraryViewMode, setLibraryViewMode] = useViewMode("kage-library-view-mode");
  const [historyViewMode, setHistoryViewMode] = useViewMode("kage-history-view-mode");
  const requestedView = searchParams.get("view");
  const normalizedView = requestedView === "saved" ? "favorites" : requestedView;
  const view =
    normalizedView === "favorites" ||
    normalizedView === "continue" ||
    normalizedView === "adult" ||
    normalizedView === "queue" ||
    normalizedView === "history" ||
    normalizedView === "insights"
      ? normalizedView
      : "all";

  async function loadEntries(): Promise<void> {
    setIsLoading(true);
    try {
      const [series, chapters, progress] = await Promise.all([
        listSeries(),
        listAllChapters(),
        listProgress(),
      ]);
      setEntries(buildLibraryEntries(series, chapters, progress));
      const chapterById = new Map(
        chapters.map((chapter) => [chapter.id, chapter]),
      );
      const seriesById = new Map(series.map((entry) => [entry.id, entry]));
      setRecentChapters(
        progress
          .flatMap((record) => {
            const chapter = chapterById.get(record.chapterId);
            const owner = chapter ? seriesById.get(chapter.seriesId) : undefined;
            return chapter && owner
              ? [
                  {
                    id: chapter.id,
                    seriesId: owner.id,
                    title: chapter.title,
                    number: chapter.number,
                    seriesTitle: owner.title,
                    pageIndex: record.pageIndex,
                    pageCount: chapter.pageCount,
                    updatedAt: record.updatedAt,
                  },
                ]
              : [];
          })
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .slice(0, 50),
      );
    } catch {
      setEntries([]);
      setRecentChapters([]);
      setFavoriteError("Could not load your library. Please reload and try again.");
    } finally {
      setIsLoading(false);
    }
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

  async function updateSelectedSeries(
    update: (series: Series) => Series,
  ): Promise<void> {
    const selected = entries.filter((entry) => selectedSeriesIds.has(entry.id));
    try {
      await Promise.all(
        selected.map(async (entry) => {
          const series = await getSeries(entry.id);
          if (series) await putSeries(update(series));
        }),
      );
      setBulkMessage(`Updated ${selected.length} series.`);
      await loadEntries();
    } catch {
      setBulkMessage("Could not update the selected series.");
    }
  }

  async function bulkAddTag(): Promise<void> {
    const tag = window.prompt("Tag to add to the selected series:")?.trim();
    if (!tag) return;
    await updateSelectedSeries((series) => ({
      ...series,
      tags: Array.from(new Set([...(series.tags ?? []), tag])),
      updatedAt: Date.now(),
    }));
  }

  async function bulkAddCollection(): Promise<void> {
    const collection = window
      .prompt("Shelf name for the selected series:")
      ?.trim();
    if (!collection) return;
    await updateSelectedSeries((series) => ({
      ...series,
      collections: Array.from(
        new Set([...(series.collections ?? []), collection]),
      ),
      updatedAt: Date.now(),
    }));
  }

  async function bulkToggleFavorite(): Promise<void> {
    const selected = entries.filter((entry) => selectedSeriesIds.has(entry.id));
    const nextFavoriteValue = !selected.every((entry) => entry.isFavorite);
    await updateSelectedSeries((series) => ({
      ...series,
      isFavorite: nextFavoriteValue,
      updatedAt: Date.now(),
    }));
  }

  async function bulkDelete(): Promise<void> {
    const selected = [...selectedSeriesIds];
    if (selected.length === 0) return;
    setIsBulkDeleteDialogOpen(false);
    try {
      await Promise.all(selected.map((id) => deleteSeriesWithContents(id)));
      setSelectedSeriesIds(new Set());
      setBulkMessage(`Deleted ${selected.length} series.`);
      await loadEntries();
    } catch {
      setBulkMessage("Could not delete all selected series.");
    }
  }

  async function toggleQueue(entry: LibraryEntry): Promise<void> {
    const series = await getSeries(entry.id);
    if (!series) return;
    const queueOrder =
      series.queueOrder === undefined
        ? Math.max(-1, ...entries.map((item) => item.queueOrder ?? -1)) + 1
        : undefined;
    await putSeries({ ...series, queueOrder, updatedAt: Date.now() });
    await loadEntries();
  }

  async function moveQueueEntry(
    entry: LibraryEntry,
    offset: -1 | 1,
  ): Promise<void> {
    const queued = entries
      .filter((item) => item.queueOrder !== undefined)
      .sort((left, right) => (left.queueOrder ?? 0) - (right.queueOrder ?? 0));
    const index = queued.findIndex((item) => item.id === entry.id);
    const neighbor = queued[index + offset];
    if (index < 0 || !neighbor) return;
    const [currentSeries, neighborSeries] = await Promise.all([
      getSeries(entry.id),
      getSeries(neighbor.id),
    ]);
    if (!currentSeries || !neighborSeries) return;
    await Promise.all([
      putSeries({
        ...currentSeries,
        queueOrder: neighbor.queueOrder,
        updatedAt: Date.now(),
      }),
      putSeries({
        ...neighborSeries,
        queueOrder: entry.queueOrder,
        updatedAt: Date.now(),
      }),
    ]);
    await loadEntries();
  }

  function updateDailyGoal(minutes: number): void {
    const next = savePreferences({
      ...preferences,
      dailyReadingGoalMinutes: minutes,
    });
    setPreferences(next);
  }

  const accessibleEntries = entries.filter(
    (entry) =>
      adultAccessUnlocked ||
      !/(18\+?|adult|mature|r-?18|nc-?17)/i.test(entry.ageRating ?? ""),
  );

  const filteredEntries = filterLibraryEntries(accessibleEntries, {
    query,
    type: selectedType,
    favoriteOnly: view === "favorites",
    continueOnly: view === "continue",
    queueOnly: view === "queue",
    historyOnly: view === "history",
    safeOnly: view !== "adult" && preferences.safeMode,
    adultOnly: view === "adult",
  });
  const visibleEntries = [...filteredEntries].sort((left, right) => {
    if (view === "queue") {
      return (
        (left.queueOrder ?? 0) - (right.queueOrder ?? 0) ||
        left.title.localeCompare(right.title)
      );
    }
    if (view === "history") {
      return (
        (right.lastReadAt ?? 0) - (left.lastReadAt ?? 0) ||
        left.title.localeCompare(right.title)
      );
    }
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
  const visibleRecentChapters = recentChapters.filter((item) =>
    filteredEntries.some((entry) => entry.id === item.seriesId),
  );
  const landingContinueEntries = entries
    .filter((entry) => entry.resume && entry.resume.pageCount > 0)
    .sort((left, right) => (right.resume?.updatedAt ?? 0) - (left.resume?.updatedAt ?? 0))
    .slice(0, 3);
  const landingQueueEntries = entries
    .filter((entry) => entry.queueOrder !== undefined)
    .sort((left, right) => (left.queueOrder ?? 0) - (right.queueOrder ?? 0))
    .slice(0, 6);
  const landingFavoriteEntries = entries.filter((entry) => entry.isFavorite).slice(0, 6);
  const activityTitleCount = new Set(visibleRecentChapters.map((item) => item.seriesId)).size;
  const latestActivity = visibleRecentChapters[0];
  const pageTitle =
    view === "adult"
      ? "18+ Vault"
      : view === "favorites"
        ? "Favorites"
        : view === "continue"
          ? "Continue reading"
          : view === "queue"
            ? "Reading queue"
              : view === "history"
                ? "Activity"
              : view === "insights"
                ? "Reading insights"
                : "Your library";
  const hasActiveFilters = Boolean(query.trim()) || selectedType !== "all";
  function clearFilters(): void {
    setQuery("");
    setSelectedType("all");
  }

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <header
          className="libraryHeader"
          data-view={view}
          style={styles.headerRow}
        >
          {!["favorites", "continue", "queue"].includes(view) ? (
              <div className="libraryHeaderCopy">
              <h1 className={view === "all" ? "sr-only" : undefined} style={styles.title}>{pageTitle}</h1>
            </div>
          ) : null}
          {view === "favorites" || view === "queue" || view === "history" || view === "insights" ? (
            <div className="libraryHeaderActions libraryContextActions" style={styles.headerActions}>
              {view === "favorites" || view === "queue" ? (
                <div className="librarySavedSegmented" aria-label="Saved library views">
                  <Link className={view === "favorites" ? "is-active" : ""} to="/?view=favorites">Favorites</Link>
                  <Link className={view === "queue" ? "is-active" : ""} to="/?view=queue">Queue</Link>
                </div>
              ) : null}
              {view === "history" || view === "insights" ? (
                <nav className="activitySegmented" aria-label="Activity views">
                  <Link className={view === "history" ? "is-active" : ""} to="/?view=history">History</Link>
                  <Link className={view === "insights" ? "is-active" : ""} to="/?view=insights">Insights</Link>
                </nav>
              ) : null}
            </div>
          ) : null}
        </header>

        {view === "all" && !isLoading ? (
          <section className="libraryLanding" aria-label="Library overview">
            {landingContinueEntries.length > 0 ? (
              <section className="libraryLandingSection" aria-labelledby="continue-reading-title">
                <div className="libraryLandingHeader">
                  <div><p className="libraryLandingEyebrow">Pick up where you left off</p><h2 id="continue-reading-title">Continue reading</h2></div>
                  <Link to="/?view=continue">View all</Link>
                </div>
                <div className="libraryContinueRail">
                  {landingContinueEntries.map((entry) => (
                    <Link className="libraryContinueCard" key={entry.id} to={`/read/${encodeURIComponent(entry.resume!.chapterId)}`}>
                      <span className="libraryContinueCover">{coverUrls[entry.id] ? <img src={coverUrls[entry.id]} alt="" /> : <BookOpen size={20} />}</span>
                      <span className="libraryContinueCopy"><strong>{entry.title}</strong><span>{entry.resume!.chapterTitle}</span><span className="libraryRailProgress"><i style={{ width: `${Math.min(100, ((entry.resume!.pageIndex + 1) / entry.resume!.pageCount) * 100)}%` }} /></span><small>Page {Math.min(entry.resume!.pageIndex + 1, entry.resume!.pageCount)} of {entry.resume!.pageCount}</small></span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
            {landingQueueEntries.length > 0 ? (
              <section className="libraryLandingSection" aria-labelledby="queue-title">
                <div className="libraryLandingHeader"><h2 id="queue-title">Queue</h2><Link to="/?view=queue">View all</Link></div>
                <div className="libraryCompactRail">{landingQueueEntries.map((entry) => <Link className="libraryCompactCard" key={entry.id} to={`/series/${encodeURIComponent(entry.id)}`}><span>{coverUrls[entry.id] ? <img src={coverUrls[entry.id]} alt="" /> : <BookOpen size={18} />}</span><strong>{entry.title}</strong></Link>)}</div>
              </section>
            ) : null}
            {landingFavoriteEntries.length > 0 ? (
              <section className="libraryLandingSection" aria-labelledby="favorites-title">
                <div className="libraryLandingHeader"><h2 id="favorites-title">Favorites</h2><Link to="/?view=favorites">View all</Link></div>
                <div className="libraryCompactRail">{landingFavoriteEntries.map((entry) => <Link className="libraryCompactCard" key={entry.id} to={`/series/${encodeURIComponent(entry.id)}`}><span>{coverUrls[entry.id] ? <img src={coverUrls[entry.id]} alt="" /> : <Heart size={18} />}</span><strong>{entry.title}</strong></Link>)}</div>
              </section>
            ) : null}
          </section>
        ) : null}

        {view === "insights" ? (
          <section
            style={styles.resumeSection}
            aria-labelledby="insights-title"
          >
            <h2 id="insights-title" style={styles.sectionTitle}>
              Your reading activity
            </h2>
            <div style={styles.statsRow}>
              <div style={styles.statItem}>
                <span style={styles.statValue}>
                  {Math.round(
                    accessibleEntries.reduce(
                      (total, entry) => total + entry.timeSpentSeconds,
                      0,
                    ) / 3600,
                  )}
                </span>
                <span style={styles.statLabel}>Hours read</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statValue}>
                  {accessibleEntries.reduce(
                    (total, entry) => total + entry.completedChapterCount,
                    0,
                  )}
                </span>
                <span style={styles.statLabel}>Completed chapters</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statValue}>
                  {Math.floor(preferences.todayReadingSeconds / 60)}
                </span>
                <span style={styles.statLabel}>Minutes today</span>
              </div>
            </div>
            <label style={styles.filterField}>
              <span style={styles.filterLabel}>
                Daily reading goal (minutes)
              </span>
              <input
                type="number"
                min="5"
                max="300"
                step="5"
                value={preferences.dailyReadingGoalMinutes}
                onChange={(event) =>
                  updateDailyGoal(Number(event.currentTarget.value))
                }
                style={styles.filterInput}
              />
            </label>
            <progress
              max={preferences.dailyReadingGoalMinutes}
              value={Math.min(
                preferences.dailyReadingGoalMinutes,
                Math.floor(preferences.todayReadingSeconds / 60),
              )}
              aria-label="Daily reading goal progress"
              style={{ width: "100%" }}
            />
          </section>
        ) : null}

        {view === "history" ? (
          <section
            style={styles.resumeSection}
            aria-labelledby="recent-chapters-title"
          >
            {latestActivity ? (
              <div className="activitySummary" aria-label="Activity summary">
                <div className="activitySummaryStat">
                  <strong>{activityTitleCount}</strong>
                  <span>recently read {activityTitleCount === 1 ? "title" : "titles"}</span>
                </div>
                <time
                  className="activitySummaryTime"
                  dateTime={new Date(latestActivity.updatedAt).toISOString()}
                >
                  Last read {formatHistoryAge(latestActivity.updatedAt)}
                </time>
                <Link
                  className="activitySummaryResume"
                  to={`/read/${encodeURIComponent(latestActivity.id)}`}
                >
                  Continue where you left off
                </Link>
              </div>
            ) : null}
            <div className="historySectionHeader">
              <h2 style={styles.sectionTitle}>Recently read</h2>
              <div className="viewModeToggle" role="group" aria-label="History view">
                <button type="button" className={historyViewMode === "grid" ? "is-active" : ""} aria-label="History grid view" aria-pressed={historyViewMode === "grid"} onClick={() => setHistoryViewMode("grid")}><Grid2X2 size={15} /></button>
                <button type="button" className={historyViewMode === "list" ? "is-active" : ""} aria-label="History list view" aria-pressed={historyViewMode === "list"} onClick={() => setHistoryViewMode("list")}><List size={15} /></button>
              </div>
            </div>
            {visibleRecentChapters.length > 0 ? (
              <ul className={`historyEntries ${historyViewMode === "grid" ? "is-grid" : "is-list"}`} style={styles.list}>
                {visibleRecentChapters.map((item) => (
                  <li key={item.id} style={styles.listItem}>
                    <Link
                      to={`/read/${encodeURIComponent(item.id)}`}
                      style={styles.historyLink}
                    >
                      <span className="historyThumb" aria-hidden="true">
                        {coverUrls[item.seriesId] ? (
                          <img src={coverUrls[item.seriesId]} alt="" />
                        ) : (
                          <BookOpen size={18} />
                        )}
                      </span>
                      <span className="historyCopy">
                        <strong>{item.seriesTitle}</strong>
                        <span className="historyMeta">
                          {item.number !== undefined
                            ? `Chapter ${item.number}`
                            : item.title} · Page {Math.min(item.pageIndex + 1, item.pageCount)} of{" "}
                          {item.pageCount}
                        </span>
                        <span className="historyProgress" aria-hidden="true">
                          <span
                            style={{
                              width: `${item.pageCount > 0 ? Math.min(100, ((item.pageIndex + 1) / item.pageCount) * 100) : 0}%`,
                            }}
                          />
                        </span>
                      </span>
                      <time
                        className="historyDate"
                        dateTime={new Date(item.updatedAt).toISOString()}
                      >
                        {formatHistoryAge(item.updatedAt)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={styles.emptyText}>No recently read chapters.</p>
            )}
          </section>
        ) : null}

        {favoriteError ? (
          <p role="alert" style={styles.errorText}>
            {favoriteError}
          </p>
        ) : null}

        <section
          className="libraryShelfSection"
          style={styles.shelfSection}
          aria-label="Browse series"
          hidden={view === "insights" || view === "history"}
        >
          <header
            className="libraryShelfHeader"
            style={styles.shelfHeader}
            hidden={["favorites", "continue", "queue"].includes(view)}
          >
            <div className="libraryShelfHeaderCopy">
              <h2 style={styles.sectionTitle}>
                {view === "favorites"
                  ? "Saved series"
                  : view === "continue"
                    ? "Reading in progress"
                    : view === "adult"
                      ? "Vault titles"
                      : view === "queue"
                        ? "Reading queue"
                        : "Series Library"}
              </h2>
              <span className="librarySeriesCount">{visibleEntries.length} series</span>
              {hasActiveFilters ? (
                <p style={styles.sectionDescription}>
                  {visibleEntries.length} matching titles
                </p>
              ) : null}
            </div>
          </header>

          <div
            className="librarySearchSortRow"
            style={styles.filters}
            aria-label="Filter library"
          >
            <label className="librarySearchFilter" style={styles.filterField}>
              <span style={styles.searchField}>
                <Search size={16} />
                <input
                  type="search"
                  aria-label="Search library"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Find a title or tag"
                  style={styles.searchInput}
                />
              </span>
            </label>
            <label className="librarySortFilter" style={styles.filterField}>
              <span className="sortField" style={styles.sortField}>
                <ArrowDownWideNarrow size={15} />
                <select
                  value={sortBy}
                  aria-label="Sort library"
                  onChange={(event) => setSortBy(event.currentTarget.value)}
                  style={styles.sortSelect}
                >
                  <option value="recent">Recently added</option>
                  <option value="title">Title A-Z</option>
                  <option value="chapters">Most chapters</option>
                </select>
              </span>
            </label>
            <ViewModeToggle
              value={libraryViewMode}
              onChange={setLibraryViewMode}
              label="Library view"
            />
            <button
              type="button"
              className="librarySelectToggle"
              aria-label={selectionMode ? "Done selecting series" : "Select series"}
              aria-pressed={selectionMode}
              title={selectionMode ? "Done selecting" : "Select series"}
              onClick={() => {
                setSelectionMode((current) => !current);
                setSelectedSeriesIds(new Set());
                setBulkMessage("");
              }}
            >
              <ListChecks size={16} />
              <span className="librarySelectToggleLabel">{selectionMode ? "Done" : "Select"}</span>
            </button>
          </div>

          <div className="librarySecondaryControls">
            <div className="libraryFilterRail" aria-label="Library filters">
              <div
                className="libraryTypeFilters"
                role="group"
                aria-label="Content type"
              >
                <button
                  type="button"
                  aria-pressed={selectedType === "all"}
                  onClick={() => setSelectedType("all")}
                  style={{
                    ...styles.categoryChip,
                    ...(selectedType === "all" ? styles.categoryChipActive : {}),
                  }}
                >
                  All types <span>{accessibleEntries.length}</span>
                </button>
                {SERIES_TYPES.map((type) => {
                  const count = accessibleEntries.filter((entry) =>
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
                        ...(selectedType === type
                          ? styles.categoryChipActive
                          : {}),
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
            </div>
          </div>

          <div className={`librarySelectionToolbar${selectionMode ? " is-active" : ""}`}>
            {selectionMode ? (
              <>
                <button
                  type="button"
                  className="librarySelectionDone"
                  onClick={() => {
                    setSelectionMode(false);
                    setSelectedSeriesIds(new Set());
                    setBulkMessage("");
                  }}
                >
                  Done
                </button>
                <span className="librarySelectionCount" aria-live="polite">
                  {selectedSeriesIds.size} selected
                </span>
                <div className="librarySelectionPrimaryActions">
                  <button
                    type="button"
                    className="libraryBulkAction libraryBulkActionPrimary"
                    style={styles.secondaryButton}
                    onClick={() =>
                      setSelectedSeriesIds(
                        new Set(visibleEntries.map((entry) => entry.id)),
                      )
                    }
                  >
                    Select visible
                  </button>
                  <button
                    type="button"
                    className="libraryBulkAction"
                    style={styles.secondaryButton}
                    disabled={selectedSeriesIds.size === 0}
                    onClick={() => void bulkAddTag()}
                  >
                    Add tag
                  </button>
                  <button
                    type="button"
                    className="libraryBulkAction"
                    style={styles.secondaryButton}
                    onClick={() => setSelectedSeriesIds(new Set())}
                    disabled={selectedSeriesIds.size === 0}
                  >
                    Clear selection
                  </button>
                </div>
                <details className="libraryBulkMore">
                  <summary>More</summary>
                  <div className="libraryBulkMoreMenu">
                    <button
                      type="button"
                      className="libraryBulkAction"
                      style={styles.secondaryButton}
                      disabled={selectedSeriesIds.size === 0}
                      onClick={() => void bulkToggleFavorite()}
                    >
                      Toggle favorites ({selectedSeriesIds.size})
                    </button>
                    <button
                      type="button"
                      className="libraryBulkAction"
                      style={styles.secondaryButton}
                      disabled={selectedSeriesIds.size === 0}
                      onClick={() => void bulkAddCollection()}
                    >
                      Add to shelf
                    </button>
                  </div>
                </details>
                <button
                  type="button"
                  className="libraryBulkAction libraryBulkActionDanger"
                  style={styles.dangerButton}
                  disabled={selectedSeriesIds.size === 0}
      onClick={() => setIsBulkDeleteDialogOpen(true)}
      >
      Delete selected
                </button>
              </>
            ) : null}
            {hasActiveFilters ? (
              <button
                type="button"
                className="libraryClearFilters"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : null}
          </div>
          {bulkMessage ? <p role="status">{bulkMessage}</p> : null}

          {isLoading ? (
            <div className="libraryLoadingGrid" aria-label="Loading library" aria-busy="true">
              {Array.from({ length: 6 }, (_, index) => (
                <div className="librarySkeletonCard" key={index}>
                  <div className="librarySkeletonCover" />
                  <div className="librarySkeletonLine librarySkeletonLineWide" />
                  <div className="librarySkeletonLine" />
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div style={styles.emptyCard}>
              <BookOpen size={25} />
              <strong>Your shelf is waiting.</strong>
              <span>
                Import a comic archive or EPUB to start reading locally.
              </span>
              <Link to="/import" style={styles.primaryButton}>
                <Plus size={16} /> Add files
              </Link>
            </div>
          ) : visibleEntries.length === 0 ? (
            <div style={styles.emptyCard}>
              <BookOpen size={22} />
              <strong>
                {view === "adult"
                  ? "No saved 18+ titles"
                  : view === "favorites"
                    ? "No favorites yet"
                    : view === "continue"
                      ? "Nothing in progress"
                      : "No matches found"}
              </strong>
              {view !== "favorites" ? (
                <span>
                  {view === "adult"
                    ? "Titles marked for mature readers will appear here after they are added to your library."
                    : view === "continue"
                      ? "Open any chapter and your reading position will appear here."
                      : "Try another title, tag, or content type."}
                </span>
              ) : null}
              <div className="libraryEmptyActions">
                {view === "favorites" || view === "continue" || view === "adult" ? (
                  <Link to="/?view=all" className="libraryEmptyAction">
                    Browse library
                  </Link>
                ) : null}
                {view !== "all" && view !== "favorites" && view !== "continue" && view !== "adult" ? (
                  <button type="button" className="libraryEmptyAction" onClick={clearFilters}>
                    Clear filters
                  </button>
                ) : null}
                {view === "continue" || view === "all" ? (
                  <Link to="/import" className="libraryEmptyAction libraryEmptyActionPrimary">
                    Import books
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={`libraryEntries ${libraryViewMode === "list" ? "is-list" : "is-grid"}`}>
              {visibleEntries.map((entry) => (
                <article
                  key={entry.id}
                  className={`libraryCard${selectedSeriesIds.has(entry.id) ? " is-selected" : ""}${entry.resume ? " has-resume" : ""}`}
                  style={styles.cardShell}
                  data-card-index={visibleEntries.indexOf(entry)}
                  data-revealed={
                    revealedCardId === entry.id ? "true" : undefined
                  }
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setRevealedCardId(entry.id);
                    setOpenCardMenuId(entry.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setOpenCardMenuId(null);
                  }}
                >
                  {selectionMode ? (
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "8px 12px 0",
                        color: "var(--app-muted)",
                        fontSize: 12,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSeriesIds.has(entry.id)}
                        onChange={(event) =>
                          setSelectedSeriesIds((current) => {
                            const next = new Set(current);
                            if (event.currentTarget.checked) next.add(entry.id);
                            else next.delete(entry.id);
                            return next;
                          })
                        }
                      />
                      Select
                    </label>
                  ) : null}
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
                      <span className="coverChapterBadge">
                        {entry.chapterCount} Chs
                      </span>
                      <div className="coverProgressOverlay">
                        <span>
                          {entry.completedChapterCount}/{entry.chapterCount}{" "}
                          Read
                        </span>
                        <span className="coverProgressTrack" aria-hidden="true">
                          <span
                            style={{
                              width: `${entry.chapterCount > 0 ? Math.min(100, (entry.completedChapterCount / entry.chapterCount) * 100) : 0}%`,
                            }}
                          />
                        </span>
                      </div>
                    </div>
                    <div style={styles.cardBody}>
                      <h2 style={styles.seriesTitle}>{entry.title}</h2>
                    </div>
                  </Link>
                  <button
                    type="button"
                    className="seriesCardMenuTrigger"
                    aria-label={`More actions for ${entry.title}`}
                    aria-expanded={openCardMenuId === entry.id}
                    onClick={() => {
                      setRevealedCardId(entry.id);
                      setOpenCardMenuId((current) =>
                        current === entry.id ? null : entry.id,
                      );
                    }}
                  >
                    <MoreHorizontal size={17} />
                  </button>
                  {openCardMenuId === entry.id ? (
                    <div
                      className="seriesCardMenu"
                      role="group"
                      aria-label={`${entry.title} actions`}
                      onBlur={(event) => {
                        if (
                          !event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                          )
                        ) {
                          setOpenCardMenuId(null);
                        }
                      }}
                    >
                      <button
                        type="button"
                        aria-pressed={entry.isFavorite}
                        onClick={() => {
                          void toggleFavorite(entry);
                          setOpenCardMenuId(null);
                        }}
                      >
                        <Heart
                          size={14}
                          fill={entry.isFavorite ? "currentColor" : "none"}
                        />
                        {entry.isFavorite
                          ? "Remove from favorites"
                          : "Add to favorites"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void toggleQueue(entry);
                          setOpenCardMenuId(null);
                        }}
                      >
                        {entry.queueOrder === undefined
                          ? "Add to queue"
                          : "Remove from queue"}
                      </button>
                      {view === "queue" ? (
                        <>
                          <button
                            type="button"
                            aria-label={`Move ${entry.title} up in queue`}
                            onClick={() => {
                              void moveQueueEntry(entry, -1);
                              setOpenCardMenuId(null);
                            }}
                          >
                            <ArrowUp size={14} /> Move up
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${entry.title} down in queue`}
                            onClick={() => {
                              void moveQueueEntry(entry, 1);
                              setOpenCardMenuId(null);
                            }}
                          >
                            <ArrowDown size={14} /> Move down
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
      <ConfirmDialog
        open={isBulkDeleteDialogOpen}
        title={`Delete ${selectedSeriesIds.size} selected series?`}
        description="This removes the selected series, chapters, reading progress, bookmarks, and page files."
        consequence="This cannot be undone. Export a backup first if you may need to restore these books."
        confirmLabel="Delete selected"
        onConfirm={() => void bulkDelete()}
        onCancel={() => setIsBulkDeleteDialogOpen(false)}
      />
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
  filters: { gap: 8 },
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
    border: 0,
    borderRadius: 6,
    background: "var(--app-panel-raised)",
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
    border: 0,
    borderRadius: 6,
    background: "var(--app-panel-raised)",
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
    fontSize: 11,
  },
  categoryChips: {
    display: "flex",
    alignItems: "center",
    gap: 7,
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
    gap: 0,
  },
  listItem: {
    borderBottom: "1px solid var(--app-border)",
  },
  headerRow: {
    justifyContent: "space-between",
    gap: 20,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
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
    fontSize: 20,
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
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: "8px 22px",
    padding: "9px 0",
    borderTop: "1px solid var(--app-border)",
    borderBottom: "1px solid var(--app-border)",
  },
  statItem: {
    display: "grid",
    alignItems: "baseline",
    gridTemplateColumns: "auto auto",
    gap: 6,
  },
  statValue: {
    fontFamily: "var(--font-display)",
    fontSize: 14,
    fontWeight: 600,
  },
  statLabel: { color: "var(--app-muted)", fontSize: 12 },
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
    padding: "11px 0",
    borderBottom: "1px solid var(--app-border)",
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
  queueButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 30,
    padding: "0 9px",
    border: "1px solid var(--app-border)",
    borderRadius: 5,
    background: "var(--app-panel)",
    color: "var(--app-text)",
    font: "inherit",
    fontSize: 11,
    cursor: "pointer",
  },
  historyLink: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    alignItems: "start",
    gap: 4,
    width: "100%",
    padding: "14px 2px",
    color: "var(--app-text)",
    textDecoration: "none",
  },
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
    top: 9,
    left: 9,
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
    gap: 16,
  },
  seriesCard: {
    display: "grid",
    minWidth: 0,
    gap: 4,
    overflow: "hidden",
    background: "transparent",
    border: 0,
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
    padding: "7px 2px 10px",
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
