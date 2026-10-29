import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Download,
  MoreVertical,
  Search,
  Play,
  Plus,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react";
import { importArchiveSources } from "../../lib/import/importer";
import { UndoToast } from "../ui/UndoToast";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { StatusBadge } from "../ui/StatusBadge";
import { OverlayShell } from "../ui/OverlayShell";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import type { ImportProgressEvent } from "../../lib/import/types";
import {
  SCHEMA_VERSION,
  type Chapter,
  type Progress,
  type ReaderMode,
  type ReadingDirection,
  type Series,
  type SeriesType,
} from "../../lib/storage/types";
import {
  deleteSeriesWithContents,
  removeSeriesPageCache,
  getBlob,
  getSeries,
  listChapters,
  listProgress,
  saveBlob,
  putSeries,
  putProgress,
} from "../../lib/storage/db";
import { createSeriesExport } from "../../lib/storage/export";
import { filterAndSortChapters, getChapterDisplayTitle, type ChapterSortMode } from "./chapterList";

const SERIES_TYPES: Array<{ value: SeriesType; label: string }> = [
  { value: "manga", label: "Manga" },
  { value: "manhua", label: "Manhua" },
  { value: "manhwa", label: "Manhwa" },
  { value: "oel", label: "OEL" },
  { value: "novel", label: "Novel" },
];
const POPULAR_TAGS = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Supernatural",
  "Thriller",
];

function isAdultRating(ageRating: string): boolean {
  return /(18\+?|adult|mature|r-?18|nc-?17)/i.test(ageRating);
}

export function SeriesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [series, setSeries] = useState<Series | null>(null);
  const [isSeriesLoading, setIsSeriesLoading] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [progressByChapter, setProgressByChapter] = useState<
    Record<string, Progress>
  >({});
  const [coverUrl, setCoverUrl] = useState("");
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
  const [isSeriesActionsOpen, setIsSeriesActionsOpen] = useState(false);
  const [isAppending, setIsAppending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftType, setDraftType] = useState<SeriesType>("manga");
  const [draftWriter, setDraftWriter] = useState("");
  const [draftAgeRating, setDraftAgeRating] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [draftPreferredMode, setDraftPreferredMode] = useState<ReaderMode | "">(
    "",
  );
  const [draftPreferredDirection, setDraftPreferredDirection] = useState<
    ReadingDirection | ""
  >("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [undoAction, setUndoAction] = useState<(() => void) | null>(null);
  const [undoMessage, setUndoMessage] = useState("");
  const [appendMessage, setAppendMessage] = useState("");
  const [appendProgress, setAppendProgress] = useState<ImportProgressEvent | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [chapterQuery, setChapterQuery] = useState("");
  const [chapterSortMode, setChapterSortMode] = useState<ChapterSortMode>("oldest");
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  function resetDrafts(record: Series): void {
    setDraftTitle(record.title);
    setDraftType(record.type);
    setDraftWriter(record.writer ?? "");
    setDraftAgeRating(record.ageRating ?? "");
    setDraftSummary(record.summary ?? "");
    setDraftNotes(record.notes ?? "");
    setDraftTags(record.tags ?? []);
    setTagInput("");
    setDraftPreferredMode(record.preferredMode ?? "");
    setDraftPreferredDirection(record.preferredDirection ?? "");
    setCoverFile(null);
  }

  useEffect(() => {
    if (!id) {
      return;
    }

    setIsSeriesLoading(true);
    void (async () => {
      const decodedId = decodeURIComponent(id);
      const [seriesRecord, chapterRows, progressRows] = await Promise.all([
        getSeries(decodedId),
        listChapters(decodedId),
        listProgress(),
      ]);
      setSeries(seriesRecord ?? null);
      setChapters(chapterRows);
      const chapterIds = new Set(chapterRows.map((chapter) => chapter.id));
      setProgressByChapter(
        Object.fromEntries(
          progressRows
            .filter((progress) => chapterIds.has(progress.chapterId))
            .map((progress) => [progress.chapterId, progress]),
        ),
      );
      if (seriesRecord) resetDrafts(seriesRecord);
      setIsSeriesLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [coverFile]);

  useEffect(() => {
    if (!series?.coverPageKey) {
      setCoverUrl("");
      return;
    }

    let isCancelled = false;
    let objectUrl = "";
    void getBlob(series.coverPageKey).then((blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      if (isCancelled) {
        URL.revokeObjectURL(objectUrl);
      } else {
        setCoverUrl(objectUrl);
      }
    });

    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [series?.coverPageKey]);

  async function saveSeriesDetails(): Promise<void> {
    if (!series) {
      return;
    }

    const title = draftTitle.trim();
    if (!title) {
      setActionError("A series title is required.");
      return;
    }

    try {
      let coverPageKey = series.coverPageKey;
      if (coverFile) {
        coverPageKey = `series:${series.id}/custom-cover`;
        await saveBlob(coverPageKey, coverFile);
      }
      const updatedSeries: Series = {
        ...series,
        title,
        type: draftType,
        writer: draftWriter.trim() || undefined,
        ageRating: draftAgeRating || undefined,
        summary: draftSummary.trim() || undefined,
        notes: draftNotes.trim() || undefined,
        coverPageKey,
        tags: draftTags.length > 0 ? draftTags : undefined,
        preferredMode: draftPreferredMode || undefined,
        preferredDirection: draftPreferredDirection || undefined,
        updatedAt: Date.now(),
      };
      await putSeries(updatedSeries);
      setSeries(updatedSeries);
      setCoverFile(null);
      setIsEditing(false);
      setActionError("");
    } catch {
      setActionError("Could not save series details.");
    }
  }

  function addDraftTag(value: string): void {
    const nextTag = value.trim();
    if (
      nextTag &&
      !draftTags.some(
        (tag) => tag.toLocaleLowerCase() === nextTag.toLocaleLowerCase(),
      )
    ) {
      setDraftTags((current) => [...current, nextTag]);
    }
    setTagInput("");
  }

  async function appendChapters(files: FileList | File[]): Promise<void> {
    if (!series || isAppending) return;
    const sources = Array.from(files, (file) => ({
      name: file.webkitRelativePath || file.name,
      blob: file,
    }));
    if (sources.length === 0) return;

    setIsAppending(true);
    setAppendMessage("");
    setAppendProgress(null);
    setActionError("");
    try {
      const result = await importArchiveSources(
        sources,
        (event) => {
          setAppendProgress(event);
          setAppendMessage(event.message ?? "Importing chapters...");
        },
        series.id,
      );
      const [chapterRows, progressRows] = await Promise.all([
        listChapters(series.id),
        listProgress(),
      ]);
      setChapters(chapterRows);
      const chapterIds = new Set(chapterRows.map((chapter) => chapter.id));
      setProgressByChapter(
        Object.fromEntries(
          progressRows
            .filter((progress) => chapterIds.has(progress.chapterId))
            .map((progress) => [progress.chapterId, progress]),
        ),
      );
      setAppendProgress({
        fileName: result.imported.at(-1)?.sourceName ?? "",
        index: sources.length,
        total: sources.length,
        state: result.errors.length > 0 ? "error" : "saved",
        progress: 100,
        message: result.errors.length > 0 ? "Import finished with errors" : "Import complete",
      });
      setAppendMessage(
        result.errors.length > 0
          ? `${result.imported.length} chapter(s) added. ${result.errors.join(" ")}`
          : result.imported.length > 0
            ? `${result.imported.length} chapter(s) added to ${series.title}.`
            : "No new chapters were added; those archives may already be in this series.",
      );
      const updatedSeries = await getSeries(series.id);
      if (updatedSeries) setSeries(updatedSeries);
    } catch (error) {
      setAppendMessage(
        error instanceof Error ? error.message : "Could not add chapters.",
      );
    } finally {
      setIsAppending(false);
      window.setTimeout(() => setAppendProgress(null), 1800);
    }
  }

  async function clearSeriesCache(): Promise<void> {
    if (!series || isClearingCache) return;
    setIsClearingCache(true);
    setActionError("");
    try {
      await removeSeriesPageCache(series.id);
      setCoverUrl("");
      setCoverPreviewUrl("");
      setActionMessage("Page images removed. Metadata and reading progress were kept.");
    } catch {
      setActionError("Could not remove this series' page cache.");
    } finally {
      setIsClearingCache(false);
    }
  }

  async function removeSeries(): Promise<void> {
    if (!series || isDeleting) {
      return;
    }
    setIsDeleteDialogOpen(false);
    setIsDeleting(true);
    setActionError("");
    try {
      await deleteSeriesWithContents(series.id);
      navigate("/?view=all", { replace: true });
    } catch {
      setIsDeleting(false);
      setActionError(
        "Could not delete this series. Its records were left in the library.",
      );
    }
  }

  function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportSeries(): Promise<void> {
    if (!series) return;
    setIsExporting(true);
    setExportMessage("");
    try {
      const archive = await createSeriesExport(series.id);
      downloadBlob(
        archive,
        `${series.title.replace(/[<>:"/\\|?*]/g, "_")}.zip`,
      );
      setExportMessage("Series export downloaded.");
    } catch (error) {
      setExportMessage(
        error instanceof Error
          ? error.message
          : "Could not export this series.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  async function markSelectedChapters(completed: boolean): Promise<void> {
    const previousProgress = new Map<string, Progress | undefined>();
    for (const chapterId of selectedChapterIds) previousProgress.set(chapterId, progressByChapter[chapterId]);
    await Promise.all(
      chapters
        .filter((chapter) => selectedChapterIds.has(chapter.id))
        .map(async (chapter) => {
          const existing = progressByChapter[chapter.id];
          const updated: Progress = {
            ...existing,
            schemaVersion: SCHEMA_VERSION,
            chapterId: chapter.id,
            pageIndex: existing?.pageIndex ?? 0,
            scrollRatio: existing?.scrollRatio ?? 0,
            updatedAt: Date.now(),
            ...(completed ? { completedAt: Date.now() } : { completedAt: undefined }),
          };
          await putProgress(updated);
        }),
    );
    setProgressByChapter((current) => {
      const next = { ...current };
      for (const chapterId of selectedChapterIds) {
        const existing = next[chapterId];
        if (existing) next[chapterId] = completed ? { ...existing, completedAt: Date.now() } : { ...existing, completedAt: undefined };
      }
      return next;
    });
    setSelectedChapterIds(new Set());
    const selectedCount = previousProgress.size;
    setUndoMessage(`${selectedCount} chapter${selectedCount === 1 ? "" : "s"} marked ${completed ? "read" : "unread"}.`);
    setUndoAction(() => () => {
      void Promise.all([...previousProgress.entries()].map(async ([chapterId, previous]) => {
        if (previous) await putProgress(previous);
        setProgressByChapter((current) => {
          const next = { ...current };
          if (previous) next[chapterId] = previous;
          else delete next[chapterId];
          return next;
        });
      }));
      setUndoAction(null);
      setUndoMessage("");
    });
  }

  async function toggleChapterCompletion(chapter: Chapter): Promise<void> {
    const existing = progressByChapter[chapter.id];
    const updated: Progress = {
      ...existing,
      schemaVersion: SCHEMA_VERSION,
      chapterId: chapter.id,
      pageIndex: existing?.pageIndex ?? Math.max(0, chapter.pageCount - 1),
      scrollRatio: existing?.scrollRatio ?? 0,
      updatedAt: Date.now(),
      timeSpentSeconds: existing?.timeSpentSeconds ?? 0,
      completedAt: existing?.completedAt ? undefined : Date.now(),
    };
    await putProgress(updated);
    setProgressByChapter((current) => ({ ...current, [chapter.id]: updated }));
  }

  if (isSeriesLoading) {
    return (
      <main className="seriesPage" style={styles.page}>
        <section style={styles.panel}>
          <LoadingSkeleton label="Loading series" lines={6} className="seriesLoadingSkeleton" />
        </section>
      </main>
    );
  }

  if (!series) {
    return (
      <main className="seriesPage" style={styles.page}>
        <section style={styles.panel}>
          <p style={styles.emptyText}>Series not found.</p>
          <Link to="/?view=all" style={styles.linkButton}>
            Back to library
          </Link>
        </section>
      </main>
    );
  }

  const mostRecentChapter = chapters
    .map((chapter) => ({ chapter, progress: progressByChapter[chapter.id] }))
    .filter((entry) => entry.progress)
    .sort(
      (left, right) =>
        (right.progress?.updatedAt ?? 0) - (left.progress?.updatedAt ?? 0),
    )[0]?.chapter;
  const featuredChapter = mostRecentChapter ?? chapters[0];
  const completedChapterIds = new Set(
    Object.values(progressByChapter)
      .filter((progress) => Boolean(progress.completedAt))
      .map((progress) => progress.chapterId),
  );
  const visibleChapters = filterAndSortChapters(
    chapters,
    chapterQuery,
    chapterSortMode,
    completedChapterIds,
  );

  return (
    <main className="seriesPage" style={styles.page}>
      <section style={styles.panel}>
        <header style={styles.headerRow}>
          <Link to="/?view=all" style={styles.backLink}>
            <ArrowLeft size={15} /> Library
          </Link>
          <div className="seriesMaintenanceActions" style={styles.headerActions}>
            <button
              type="button"
              className="seriesEditButton"
              aria-label={isEditing ? "Close editor" : "Edit series details"}
              style={styles.secondaryButton}
              onClick={() => {
                resetDrafts(series);
                setActionError("");
                setIsEditing((current) => !current);
              }}
            >
              <Settings2 size={14} />
              {isEditing ? "Close editor" : "Edit details"}
            </button>
            <div className="seriesActionsMenu">
              <button
                type="button"
                className="seriesActionsTrigger"
                aria-label="Series actions"
                aria-haspopup="menu"
                aria-expanded={isSeriesActionsOpen}
                onClick={() => setIsSeriesActionsOpen((current) => !current)}
              >
                <MoreVertical size={18} />
              </button>
              {isSeriesActionsOpen ? (
                <div className="seriesActionsPopover" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isClearingCache || chapters.length === 0}
                    onClick={() => {
                      void clearSeriesCache();
                      setIsSeriesActionsOpen(false);
                    }}
                  >
                    <Trash2 size={15} />
                    {isClearingCache ? "Removing page cache..." : "Remove page images"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={isExporting || chapters.length === 0}
                    onClick={() => {
                      void exportSeries();
                      setIsSeriesActionsOpen(false);
                    }}
                  >
                    <Download size={15} />
                    {isExporting ? "Preparing export..." : "Export series ZIP"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="seriesDeleteAction"
                    disabled={isDeleting}
      onClick={() => {
        setIsDeleteDialogOpen(true);
        setIsSeriesActionsOpen(false);
      }}
                  >
                    <Trash2 size={15} />
                    {isDeleting ? "Deleting..." : "Delete series"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <input
          ref={archiveInputRef}
          type="file"
          accept=".cbz,.cbr,.zip,.rar,.7z,.cb7,.cbt,.tar,.tgz,.gz,.bz2,.xz,.epub,.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,.tif,.tiff,.jfif,.jpe,.svg"
          multiple
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files?.length) void appendChapters(files);
            event.currentTarget.value = "";
          }}
          style={styles.hiddenInput}
        />

        <section style={styles.seriesHero}>
          <div className="seriesCover" style={styles.seriesCover}>
            {coverPreviewUrl || coverUrl ? (
              <img
                src={coverPreviewUrl || coverUrl}
                alt={`${series.title} cover`}
                style={styles.seriesCoverImage}
              />
            ) : (
              <span style={styles.seriesCoverFallback}>
                <BookOpen size={36} />
              </span>
            )}
          </div>
          <div style={styles.seriesHeroContent}>
            <p style={styles.kicker}>
              {series.type} <span aria-hidden="true">/</span> {chapters.length}{" "}
              chapters
            </p>
            <h1 style={styles.title} title={series.title}>{series.title}</h1>
            <div style={styles.heroFacts}>
              {series.writer ? <span>{series.writer}</span> : null}
              {series.ageRating ? <span>{series.ageRating}</span> : null}
              <span>
                {chapters.reduce(
                  (total, chapter) => total + chapter.pageCount,
                  0,
                )}{" "}
                pages
              </span>
            </div>
            {series.notes ? <p className="seriesNotes" title={series.notes}>{series.notes}</p> : null}
            {series.tags?.length ? (
              <ul style={styles.tagList} aria-label="Series tags">
                {series.tags.map((tag) => (
                  <li key={tag} style={styles.tag}>
                    {tag}
                  </li>
                ))}
              </ul>
            ) : null}
            {series.summary ? (
              <div className="seriesSynopsis">
                <p className={isSynopsisExpanded ? "" : "line-clamp-3"} style={styles.seriesSummary}>{series.summary}</p>
                <button
                  type="button"
                  className="seriesSynopsisToggle"
                  onClick={() => setIsSynopsisExpanded((current) => !current)}
                >
                  {isSynopsisExpanded ? "Show less" : "Show more"}
                </button>
              </div>
            ) : null}
            {featuredChapter ? (
              <Link
                to={`/read/${encodeURIComponent(featuredChapter.id)}`}
                style={styles.startReadingButton}
              >
                <Play size={15} fill="currentColor" />
                {mostRecentChapter ? "Continue reading" : "Start reading"}
                <ArrowRight size={15} />
              </Link>
            ) : (
              <p style={styles.emptyText}>Import a chapter to start reading.</p>
            )}
          </div>
        </section>

        {isEditing
          ? createPortal(
              <OverlayShell
                labelledBy="edit-series-title"
                onEscape={() => setIsEditing(false)}
                className="seriesEditorBackdrop"
                contentClassName="seriesEditorDialog"
              >
                <form
                  className="seriesEditorForm"
                  style={styles.editor}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setIsEditing(false);
                  }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveSeriesDetails();
                  }}
                >
                  <header className="seriesEditorHeader">
                    <h2 id="edit-series-title">Edit series details</h2>
                    <button type="button" onClick={() => setIsEditing(false)}>
                      Close
                    </button>
                  </header>
                  <section className="seriesEditorDetails" style={styles.detailsGrid}>
                    <div className="coverEditor seriesCoverEditor" style={styles.coverEditor}>
                      {coverPreviewUrl || coverUrl ? (
                        <img
                          src={coverPreviewUrl || coverUrl}
                          alt="Series cover preview"
                          style={styles.editorCover}
                        />
                      ) : (
                        <div style={styles.editorCoverFallback}>
                          <BookOpen size={28} />
                        </div>
                      )}
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          setCoverFile(event.currentTarget.files?.[0] ?? null)
                        }
                        style={styles.hiddenInput}
                      />
                      <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={() => coverInputRef.current?.click()}
                      >
                        <Upload size={14} /> Upload custom cover
                      </button>
                    </div>
                    <div className="metadataFields" style={styles.metadataFields}>
                      <label style={styles.field}>
                        <span style={styles.fieldLabel}>
                          Display title / series name
                        </span>
                        <input
                          value={draftTitle}
                          onChange={(event) =>
                            setDraftTitle(event.currentTarget.value)
                          }
                          style={styles.textInput}
                          required
                        />
                      </label>
                      <div style={styles.overrideGrid}>
                        <label style={styles.field}>
                          <span style={styles.fieldLabel}>
                            Author / creator
                          </span>
                          <input
                            value={draftWriter}
                            onChange={(event) =>
                              setDraftWriter(event.currentTarget.value)
                            }
                            placeholder="Author or creator"
                            style={styles.textInput}
                          />
                        </label>
                        <label style={styles.field}>
                          <span style={styles.fieldLabel}>
                            Category / format
                          </span>
                          <select
                            value={draftType}
                            onChange={(event) =>
                              setDraftType(
                                event.currentTarget.value as SeriesType,
                              )
                            }
                            style={styles.textInput}
                          >
                            {SERIES_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label style={styles.field}>
                        <span style={styles.fieldLabel}>
                          Synopsis / summary
                        </span>
                        <textarea
                          value={draftSummary}
                          onChange={(event) =>
                            setDraftSummary(event.currentTarget.value)
                          }
                          placeholder="Brief description or blurb"
                          rows={4}
                          className="seriesEditorTextarea"
                          style={styles.textarea}
                        />
                      </label>
                      <label style={styles.field}>
                        <span style={styles.fieldLabel}>Private notes</span>
                        <textarea
                          value={draftNotes}
                          onChange={(event) => setDraftNotes(event.currentTarget.value)}
                          placeholder="Add reading notes, reminders, or a favorite arc"
                          rows={4}
                          className="seriesEditorTextarea"
                          style={styles.textarea}
                        />
                      </label>
                      <label style={styles.adultToggle}>
                        <span>
                          <strong>18+ Adult Content</strong>
                          <span style={styles.overrideDescription}>
                            Hidden while Safe Mode is enabled.
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          checked={isAdultRating(draftAgeRating)}
                          onChange={(event) =>
                            setDraftAgeRating(
                              event.currentTarget.checked ? "18+" : "Everyone",
                            )
                          }
                        />
                      </label>
                    </div>
                  </section>
                  <section className="seriesEditorSection" style={styles.tagEditor}>
                    <div>
                      <strong>Tags &amp; organization</strong>
                      <p style={styles.overrideDescription}>
                        Add genres to organize and filter your library.
                      </p>
                    </div>
                    <div className="tagComposer">
                      {draftTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="tagChip"
                          aria-label={`Remove ${tag} tag`}
                          onClick={() =>
                            setDraftTags((current) =>
                              current.filter((entry) => entry !== tag),
                            )
                          }
                        >
                          {tag} <span aria-hidden="true">×</span>
                        </button>
                      ))}
                      <input
                        value={tagInput}
                        onChange={(event) => setTagInput(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === ",") {
                            event.preventDefault();
                            addDraftTag(tagInput);
                          }
                        }}
                        placeholder="Add genre..."
                      />
                    </div>
                    <div style={styles.popularTags}>
                      <span style={styles.overrideDescription}>
                        Popular genres:
                      </span>
                      {POPULAR_TAGS.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          style={styles.popularTag}
                          onClick={() => addDraftTag(tag)}
                        >
                          <Plus size={11} /> {tag}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="seriesEditorSection" style={styles.overrideSection}>
                    <div>
                      <strong>Custom Reading Overrides</strong>
                      <p style={styles.overrideDescription}>
                        Choose how this series opens without changing global
                        settings.
                      </p>
                    </div>
                    <div style={styles.overrideGrid}>
                      <label style={styles.field}>
                        <span style={styles.fieldLabel}>Reading mode</span>
                        <select
                          value={draftPreferredMode}
                          onChange={(event) =>
                            setDraftPreferredMode(
                              event.currentTarget.value as ReaderMode | "",
                            )
                          }
                          style={styles.textInput}
                        >
                          <option value="">Use Global Settings</option>
                          <option value="flip">Paginated</option>
                          <option value="webtoon">Continuous Scroll</option>
                          <option value="novel">Novel</option>
                        </select>
                      </label>
                      <label style={styles.field}>
                        <span style={styles.fieldLabel}>Reading direction</span>
                        <select
                          value={draftPreferredDirection}
                          onChange={(event) =>
                            setDraftPreferredDirection(
                              event.currentTarget.value as
                                | ReadingDirection
                                | "",
                            )
                          }
                          style={styles.textInput}
                        >
                          <option value="">Use Global Settings</option>
                          <option value="ltr">Left to Right</option>
                          <option value="rtl">Right to Left</option>
                        </select>
                      </label>
                    </div>
                  </section>
                  <div className="seriesEditorActions" style={styles.editorActions}>
                    <button type="submit" style={styles.linkButton}>
                      Save details
                    </button>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => {
                        resetDrafts(series);
                        setIsEditing(false);
                        setActionError("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </OverlayShell>,
              document.body,
            )
          : null}

      {undoAction && undoMessage ? (
        <UndoToast message={undoMessage} onUndo={undoAction} onDismiss={() => { setUndoAction(null); setUndoMessage(""); }} />
      ) : null}
      {actionMessage ? <p className="seriesActionMessage" role="status">{actionMessage}</p> : null}
      {actionError ? (
        <p role="alert" style={styles.errorText}>
          {actionError}
        </p>
      ) : null}

        <section
          className="seriesChapterSection"
          style={styles.chapterSection}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (event.dataTransfer.files.length) {
              void appendChapters(event.dataTransfer.files);
            }
          }}
        >
      {appendProgress ? (
        <div className="seriesImportProgress" role="status" aria-live="polite">
          <div className="seriesImportProgressHeader">
            <span>{appendProgress.message ?? "Importing chapters..."}</span>
            <strong>{appendProgress.index} of {appendProgress.total}</strong>
          </div>
          <div className="seriesImportProgressTrack" aria-hidden="true">
            <span style={{ width: `${Math.max(4, appendProgress.progress ?? 0)}%` }} />
          </div>
          <div className="seriesImportProgressMeta">
            <span>{appendProgress.fileName || "Preparing chapter files"}</span>
            <span>{Math.round(appendProgress.progress ?? 0)}%</span>
          </div>
        </div>
      ) : appendMessage ? (
        <p role="status" style={styles.appendMessage}>
          {appendMessage}
        </p>
      ) : null}
          {exportMessage ? <p role="status">{exportMessage}</p> : null}
          <header className="seriesChapterHeader" style={styles.chapterHeader}>
            <h2 className="seriesChapterHeading" style={styles.chapterHeading}>Chapters · {chapters.length}</h2>
            <div className="seriesChapterActions">
              <span style={styles.chapterCount}>{visibleChapters.length} of {chapters.length}</span>
              <button
                type="button"
                className="seriesAddChapters"
                aria-label={isAppending ? "Adding chapters" : "Add chapters"}
                title={isAppending ? "Adding chapters" : "Add chapters"}
                aria-busy={isAppending}
                disabled={isAppending}
                onClick={() => archiveInputRef.current?.click()}
              >
                <Plus size={16} />
              </button>
            </div>
          </header>
          {chapters.length === 0 ? (
            <div className="seriesEmptyState">
              <p style={styles.emptyText}>
                No chapters are available for this series yet.
              </p>
              <button type="button" className="libraryEmptyAction" onClick={() => archiveInputRef.current?.click()}>
                Add chapter files
              </button>
            </div>
          ) : (
            <>
              <div className="seriesChapterTools">
                <label className="seriesChapterSelectAll">
                  <input
                    type="checkbox"
                    checked={visibleChapters.length > 0 && visibleChapters.every((chapter) => selectedChapterIds.has(chapter.id))}
                    onChange={(event) => setSelectedChapterIds(event.currentTarget.checked ? new Set(visibleChapters.map((chapter) => chapter.id)) : new Set())}
                  />
                  <span>Select</span>
                </label>
                <label className="seriesChapterSearch">
                  <Search size={15} aria-hidden="true" />
                  <span className="sr-only">Search chapters</span>
                  <input value={chapterQuery} onChange={(event) => setChapterQuery(event.currentTarget.value)} placeholder="Search chapters" />
                </label>
                {selectedChapterIds.size > 0 ? (
                  <div className="seriesChapterBulkActions">
                    <button type="button" onClick={() => void markSelectedChapters(true)}>Mark read</button>
                    <button type="button" onClick={() => void markSelectedChapters(false)}>Mark unread</button>
                  </div>
                ) : null}
                <div className="seriesChapterSortControl" role="group" aria-label="Chapter order">
                  <button
                    type="button"
                    className={chapterSortMode === "oldest" ? "is-active" : ""}
                    aria-pressed={chapterSortMode === "oldest"}
                    onClick={() => setChapterSortMode("oldest")}
                  >
                    Ascending
                  </button>
                  <button
                    type="button"
                    className={chapterSortMode === "newest" ? "is-active" : ""}
                    aria-pressed={chapterSortMode === "newest"}
                    onClick={() => setChapterSortMode("newest")}
                  >
                    Descending
                  </button>
                  <button
                    type="button"
                    className={chapterSortMode === "unread" ? "is-active" : ""}
                    aria-pressed={chapterSortMode === "unread"}
                    onClick={() => setChapterSortMode("unread")}
                  >
                    Unread
                  </button>
                  <button
                    type="button"
                    className={chapterSortMode === "completed" ? "is-active" : ""}
                    aria-pressed={chapterSortMode === "completed"}
                    onClick={() => setChapterSortMode("completed")}
                  >
                    Completed
                  </button>
                </div>
              </div>
              {visibleChapters.length === 0 ? (
                <div className="seriesEmptyState">
                  <p style={styles.emptyText}>No chapters match your current search or filter.</p>
                  <button
                    type="button"
                    className="libraryEmptyAction"
                    onClick={() => {
                      setChapterQuery("");
                      setChapterSortMode("oldest");
                    }}
                  >
                    Clear chapter filters
                  </button>
                </div>
              ) : null}
              <ul style={styles.list}>
{visibleChapters.map((chapter, chapterIndex) => (
              <li key={chapter.id} style={styles.listItem}>
                {(() => {
                  const progress = progressByChapter[chapter.id];
                  const previousChapter = visibleChapters[chapterIndex - 1];
                  const startsVolumeGroup = chapterIndex === 0 || previousChapter?.volume !== chapter.volume;
                  const volumeLabel = chapter.volume !== undefined ? `Volume ${chapter.volume}` : "Other chapters";
  const titleLabel = getChapterDisplayTitle(chapter, chapterIndex + 1);
                    const progressPercent = progress
                      ? progress.completedAt
                        ? 100
                        : Math.min(
                            100,
                            ((progress.pageIndex + 1) /
                              Math.max(1, chapter.pageCount)) *
                              100,
                          )
                      : 0;
                    return (
                      <>
                        {startsVolumeGroup ? <div className="chapterVolumeGroup" aria-label={volumeLabel}>{volumeLabel}</div> : null}
                      <div className={`seriesChapterItem${mostRecentChapter?.id === chapter.id ? " is-resume" : ""}`}>
                        <div className="seriesChapterRow">
                          <input
                            type="checkbox"
                            className="seriesChapterCheckbox"
                            checked={selectedChapterIds.has(chapter.id)}
                            onChange={(event) => {
                              const isChecked = event.currentTarget.checked;
                              setSelectedChapterIds((current) => {
                                const next = new Set(current);
                                if (isChecked) next.add(chapter.id); else next.delete(chapter.id);
                                return next;
                              });
                            }}
                            aria-label={`Select ${titleLabel}`}
                          />
                          <Link
                            to={`/read/${encodeURIComponent(chapter.id)}`}
                            style={{ ...styles.chapterLink, flex: 1 }}
                          >
                            <span className="chapterTitleLine">
                              <strong>
                                <span className="chapterTitleText" title={titleLabel}>{titleLabel}</span>
                                {progress?.completedAt ? <StatusBadge status="completed" /> : progress?.pageIndex ? <StatusBadge status="in-progress" /> : mostRecentChapter?.id === chapter.id ? <StatusBadge status="in-progress" /> : <StatusBadge status="unread" />}
                                {chapter.volume !== undefined
                                  ? ` · Vol. ${chapter.volume}`
                                  : ""}
                                {chapter.number !== undefined
                                  ? ` · #${chapter.number}`
                                  : ""}
                              </strong>
                            </span>
                            <span className="chapterPageCount">
                              {mostRecentChapter?.id === chapter.id ? "Resume · " : ""}{chapter.pageCount} pages
                            </span>
                          </Link>
                          <button
                            type="button"
                            className="chapterStatusToggle"
                            aria-label={`${progress?.completedAt ? "Mark unread" : "Mark read"}: ${titleLabel}`}
                            aria-pressed={Boolean(progress?.completedAt)}
                            title={
                              progress?.completedAt
                                ? "Mark unread"
                                : "Mark read"
                            }
                            onClick={() =>
                              void toggleChapterCompletion(chapter)
                            }
                          >
                            <span className="chapterStatusActionText">
                              {progress?.completedAt ? "Read" : "Mark read"}
                            </span>
                          </button>
                        </div>
                        {progress ? (
                          <div
                            className="seriesChapterProgress"
                            role="progressbar"
                            aria-label={`${titleLabel} reading progress`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(progressPercent)}
                          >
                            <span style={{ width: `${progressPercent}%` }} />
                          </div>
                        ) : null}
                      </div>
                      </>
                    );
                  })()}
                </li>
              ))}
              </ul>
            </>
          )}
        </section>
      </section>
      {series ? (
        <ConfirmDialog
          open={isDeleteDialogOpen}
          title={`Delete ${series.title}?`}
          description="This removes the series, chapters, reading progress, bookmarks, and page files."
          consequence="This cannot be undone. Use Remove page images instead if you only want to free storage."
          confirmLabel="Delete series"
          busy={isDeleting}
          onConfirm={() => void removeSeries()}
          onCancel={() => setIsDeleteDialogOpen(false)}
        />
      ) : null}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--app-bg)",
    color: "var(--app-text)",
    padding: "clamp(14px, 2vw, 28px)",
    fontFamily: "var(--font-body)",
  },
  panel: {
    maxWidth: 1160,
    margin: "0 auto",
    display: "grid",
    gap: 16,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
  },
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "var(--app-muted)",
    fontSize: 12,
    fontWeight: 600,
    textDecoration: "none",
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
  },
  hiddenInput: { display: "none" },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(110px, 0.35fr) minmax(0, 1.65fr)",
    gap: 18,
  },
  coverEditor: {
    display: "grid",
    alignContent: "start",
    justifyItems: "center",
    gap: 10,
  },
  editorCover: {
    width: "100%",
    maxWidth: 180,
    aspectRatio: "0.72",
    objectFit: "cover",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 8,
  },
  editorCoverFallback: {
    display: "grid",
    width: "100%",
    maxWidth: 180,
    aspectRatio: "0.72",
    placeItems: "center",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 8,
    color: "var(--app-muted)",
  },
  metadataFields: { display: "grid", gap: 14, minWidth: 0 },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical",
    padding: "10px 12px",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 6,
    background: "var(--app-bg)",
    color: "var(--app-text)",
    font: "inherit",
  },
  adultToggle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: 12,
    border: "1px solid var(--app-border)",
    borderRadius: 8,
    background: "var(--app-bg)",
  },
  tagEditor: {
    display: "grid",
    gap: 12,
    padding: 16,
    border: "1px solid var(--app-border)",
    borderRadius: 8,
    background: "var(--app-bg)",
  },
  tagInputRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 8,
  },
  draftTagList: { display: "flex", flexWrap: "wrap", gap: 6 },
  draftTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "5px 8px",
    border: "1px solid var(--app-border)",
    borderRadius: 999,
    background: "var(--app-panel-raised)",
    color: "var(--app-text)",
    cursor: "pointer",
  },
  popularTags: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  popularTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: "5px 7px",
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    background: "transparent",
    color: "var(--app-muted)",
    cursor: "pointer",
  },
  overrideSection: {
    display: "grid",
    gap: 14,
    padding: 16,
    border: "1px solid var(--app-border)",
    borderRadius: 8,
    background: "var(--app-bg)",
  },
  overrideDescription: {
    margin: "5px 0 0",
    color: "var(--app-muted)",
    fontSize: 12,
  },
  overrideGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  field: { display: "grid", gap: 6 },
  fieldLabel: { fontWeight: 700 },
  textInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 6,
    background: "var(--app-bg)",
    color: "var(--app-text)",
    font: "inherit",
  },
  editorActions: { display: "flex", flexWrap: "wrap", gap: 10 },
  errorText: { margin: 0, color: "#ffaaa0" },
  kicker: {
    margin: 0,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--app-text)",
    fontSize: 10,
    fontWeight: 700,
  },
  title: {
    margin: "8px 0 0",
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1.08,
    overflowWrap: "anywhere",
  },
  seriesHero: {
    display: "grid",
    gridTemplateColumns: "minmax(108px, 0.7fr) minmax(0, 1.6fr)",
    gap: "clamp(14px, 3vw, 34px)",
    alignItems: "center",
    padding: "8px 0",
  },
  seriesCover: {
    aspectRatio: "0.72",
    overflow: "hidden",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 8,
    background: "var(--app-panel-raised)",
  },
  seriesCoverImage: { width: "100%", height: "100%", objectFit: "cover" },
  seriesCoverFallback: {
    display: "grid",
    width: "100%",
    height: "100%",
    placeItems: "center",
    color: "var(--app-text)",
  },
  seriesHeroContent: {
    display: "grid",
    justifyItems: "start",
    gap: 15,
    minWidth: 0,
  },
  seriesSummary: {
    maxWidth: 760,
    margin: 0,
    color: "var(--app-muted)",
    fontSize: 13,
    lineHeight: 1.6,
  },
  heroFacts: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px 16px",
    color: "var(--app-muted)",
    fontSize: 12,
  },
  startReadingButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    marginTop: 8,
    padding: "8px 11px",
    border: "1px solid var(--app-text)",
    borderRadius: 7,
    background: "var(--app-text)",
    color: "#182014",
    fontSize: 11,
    fontWeight: 700,
    textDecoration: "none",
  },
  appendSection: {
    display: "grid",
    gap: 12,
    padding: 16,
    border: "1px solid var(--app-border)",
    borderRadius: 10,
    background: "var(--app-panel)",
  },
  appendHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  appendMessage: { margin: 0, color: "var(--app-muted)", fontSize: 12 },
  chapterSection: { display: "grid", gap: 10 },
  chapterHeader: {
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 10,
  },
  chapterHeading: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 600,
  },
  chapterSubheading: {
    margin: "5px 0 0",
    color: "var(--app-muted)",
    fontSize: 12,
  },
  chapterCount: { color: "var(--app-muted)", fontSize: 12 },
  linkButton: {
    color: "#182014",
    background: "var(--app-text)",
    textDecoration: "none",
    borderRadius: 7,
    padding: "10px 14px",
    fontWeight: 700,
  },
  secondaryButton: {
    color: "var(--app-text)",
    background: "var(--app-panel-raised)",
    border: "1px solid var(--app-border)",
    borderRadius: 7,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  deleteButton: {
    color: "#ffe5e1",
    background: "#562522",
    border: "1px solid #8f473e",
    borderRadius: 7,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  summaryCard: {
    display: "grid",
    gap: 4,
    background: "var(--app-panel)",
    border: "1px solid var(--app-border)",
    borderRadius: 9,
    padding: 16,
  },
  metaText: {
    margin: 0,
    color: "var(--app-text)",
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
    background: "#ffffff08",
    color: "#b8c1b9",
    fontSize: 10,
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: 0,
  },
  listItem: {
    borderBottom: "1px solid var(--app-border)",
  },
  chapterLink: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    textDecoration: "none",
    color: "inherit",
    padding: "8px 2px",
  },
  emptyText: {
    margin: 0,
    color: "var(--app-muted)",
  },
};
