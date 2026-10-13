import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  applyPreferencesToDocument,
  getPreferences,
  savePreferences,
  type Preferences,
} from "../../lib/preferences/preferences";
import {
  createLibraryBackup,
  restoreLibraryBackup,
} from "../../lib/storage/backup";
import {
  clearLibraryData,
  getBlob,
  listAllChapters,
  listAllPages,
  listSeries,
} from "../../lib/storage/db";
import { Sparkles } from "lucide-react";
import type { PwaInstallPrompt } from "../../lib/pwa/install";
import type {
  AccentColor,
  ColorTheme,
  ReadingDirection,
} from "../../lib/preferences/preferences";

type StorageStatus = {
  usage?: number;
  quota?: number;
  persistent?: boolean;
};

type SeriesStorageUsage = {
  id: string;
  title: string;
  bytes: number;
  chapterCount: number;
  pageCount: number;
};

type SettingsPageProps = {
  installPrompt: PwaInstallPrompt | null;
  isInstalled: boolean;
  onInstallPromptConsumed: () => void;
};

const COLOR_THEMES: Array<{
  id: ColorTheme;
  label: string;
  background: string;
  panel: string;
  text: string;
}> = [
  {
    id: "oled",
    label: "True OLED",
    background: "#030404",
    panel: "#101212",
    text: "#f3f5f4",
  },
  {
    id: "midnight",
    label: "Midnight Navy",
    background: "#101725",
    panel: "#202d42",
    text: "#f1f4fa",
  },
  {
    id: "parchment",
    label: "Warm Parchment",
    background: "#f1e9da",
    panel: "#f9f4e9",
    text: "#25241f",
  },
  {
    id: "forest",
    label: "Forest Pine",
    background: "#08130f",
    panel: "#183125",
    text: "#eaf4ed",
  },
  {
    id: "cyber",
    label: "Cyber Void",
    background: "#0b0a12",
    panel: "#201a2d",
    text: "#f5f0fb",
  },
  {
    id: "crimson",
    label: "Night Crimson",
    background: "#140d10",
    panel: "#2b1b21",
    text: "#f8eef0",
  },
];

const ACCENT_SWATCHES: Array<{
  id: AccentColor;
  label: string;
  color: string;
}> = [
  { id: "pure", label: "Pure", color: "#f4f5f4" },
  { id: "jade", label: "Jade", color: "#00a982" },
  { id: "cyber", label: "Cyber", color: "#00c6f2" },
  { id: "electric", label: "Electric", color: "#ad79ff" },
  { id: "cobalt", label: "Cobalt", color: "#528bff" },
];

function formatBytes(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) {
    return "Unavailable";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readSeriesStorageUsage(): Promise<SeriesStorageUsage[]> {
  const [seriesRows, chapters, pages] = await Promise.all([
    listSeries(),
    listAllChapters(),
    listAllPages(),
  ]);
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const sizes = await Promise.all(
    pages.map(async (page) => ({
      seriesId: chapterById.get(page.chapterId)?.seriesId,
      size: (await getBlob(page.storageKey))?.size ?? 0,
    })),
  );
  const usageBySeries = new Map<string, number>();
  const pageTotals = new Map<string, number>();
  for (const item of sizes) {
    if (item.seriesId) {
      usageBySeries.set(
        item.seriesId,
        (usageBySeries.get(item.seriesId) ?? 0) + item.size,
      );
      pageTotals.set(item.seriesId, (pageTotals.get(item.seriesId) ?? 0) + 1);
    }
  }
  const chapterTotals = new Map<string, number>();
  for (const chapter of chapters) {
    chapterTotals.set(
      chapter.seriesId,
      (chapterTotals.get(chapter.seriesId) ?? 0) + 1,
    );
  }
  return seriesRows
    .map((series) => ({
      id: series.id,
      title: series.title,
      bytes: usageBySeries.get(series.id) ?? 0,
      chapterCount: chapterTotals.get(series.id) ?? 0,
      pageCount: pageTotals.get(series.id) ?? 0,
    }))
    .sort((left, right) => right.bytes - left.bytes);
}

export function SettingsPage({
  installPrompt,
  isInstalled,
  onInstallPromptConsumed,
}: SettingsPageProps) {
  const [preferences, setPreferences] = useState<Preferences>(getPreferences);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({});
  const [seriesStorage, setSeriesStorage] = useState<SeriesStorageUsage[]>([]);
  const [storageMessage, setStorageMessage] = useState("");
  const [isRequestingPersistence, setIsRequestingPersistence] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [installMessage, setInstallMessage] = useState("");

  useEffect(() => {
    const storageManager = navigator.storage;
    if (!storageManager) {
      setStorageMessage("Storage details are unavailable in this browser.");
      return;
    }

    void Promise.all([storageManager.estimate(), storageManager.persisted()])
      .then(([estimate, persistent]) => {
        setStorageStatus({
          usage: estimate.usage,
          quota: estimate.quota,
          persistent,
        });
      })
      .catch(() => {
        setStorageMessage("Could not read browser storage details.");
      });
  }, []);

  useEffect(() => {
    void readSeriesStorageUsage()
      .then(setSeriesStorage)
      .catch(() => {
        setStorageMessage("Could not calculate library storage by series.");
      });
  }, []);

  function updatePreferences(update: Partial<Preferences>): void {
    const nextPreferences = savePreferences({ ...preferences, ...update });
    setPreferences(nextPreferences);
    applyPreferencesToDocument(nextPreferences);
  }

  async function requestPersistentStorage(): Promise<void> {
    const storageManager = navigator.storage;
    if (!storageManager?.persist) {
      setStorageMessage("Persistent storage is unavailable in this browser.");
      return;
    }

    setIsRequestingPersistence(true);
    try {
      const persistent = await storageManager.persist();
      setStorageStatus((current) => ({ ...current, persistent }));
      setStorageMessage(
        persistent
          ? "The browser will protect this library from routine storage cleanup."
          : "The browser did not grant persistent storage.",
      );
    } catch {
      setStorageMessage("Could not request persistent storage.");
    } finally {
      setIsRequestingPersistence(false);
    }
  }

  async function downloadBackup(): Promise<void> {
    setIsBackingUp(true);
    setBackupMessage("");
    try {
      const backup = await createLibraryBackup();
      const downloadUrl = URL.createObjectURL(backup);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `kage-reader-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setBackupMessage("Backup downloaded.");
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? error.message : "Could not create backup.",
      );
    } finally {
      setIsBackingUp(false);
    }
  }

  async function restoreBackup(file: File): Promise<void> {
    setIsRestoring(true);
    setBackupMessage("");
    try {
      const result = await restoreLibraryBackup(file);
      setSeriesStorage(await readSeriesStorageUsage());
      setBackupMessage(
        `Merged ${result.seriesCount} series, ${result.chapterCount} chapters, and ${result.pageCount} pages.`,
      );
      const estimate = await navigator.storage?.estimate();
      if (estimate) {
        setStorageStatus((current) => ({
          ...current,
          usage: estimate.usage,
          quota: estimate.quota,
        }));
      }
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? error.message : "Could not restore backup.",
      );
    } finally {
      setIsRestoring(false);
    }
  }

  async function clearLibrary(): Promise<void> {
    const confirmed = window.confirm(
      "Delete every imported series, page, bookmark, and reading position from this device? This cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    setIsClearing(true);
    setBackupMessage("");
    try {
      await clearLibraryData();
      setSeriesStorage([]);
      setBackupMessage("Local library cleared.");
      const estimate = await navigator.storage?.estimate();
      if (estimate) {
        setStorageStatus((current) => ({
          ...current,
          usage: estimate.usage,
          quota: estimate.quota,
        }));
      }
    } catch (error) {
      setBackupMessage(
        error instanceof Error
          ? error.message
          : "Could not clear local library.",
      );
    } finally {
      setIsClearing(false);
    }
  }

  async function installApp(): Promise<void> {
    if (!installPrompt) {
      setInstallMessage("Installation is not available in this browser yet.");
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      onInstallPromptConsumed();
      setInstallMessage(
        choice.outcome === "accepted"
          ? "Installation started."
          : "Installation was dismissed.",
      );
    } catch {
      setInstallMessage("Could not open the installation prompt.");
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.panel}>
        <header style={styles.header}>
          <div>
            <p style={styles.kicker}>Preferences</p>
            <h1 style={styles.title}>Settings</h1>
          </div>
          <Link to="/" style={styles.linkButton}>
            Back to library
          </Link>
        </header>

        <nav style={styles.settingsJumpNav} aria-label="Settings sections">
          <a href="#appearance-heading" style={styles.settingsJumpLink}>
            Appearance
          </a>
          <a href="#reading-heading" style={styles.settingsJumpLink}>
            Reading
          </a>
          <a href="#content-heading" style={styles.settingsJumpLink}>
            Content
          </a>
          <a href="#storage-heading" style={styles.settingsJumpLink}>
            Storage
          </a>
          <a href="#backup-heading" style={styles.settingsJumpLink}>
            Backup
          </a>
          <a href="#shortcuts-heading" style={styles.settingsJumpLink}>
            Shortcuts
          </a>
        </nav>

        <section style={styles.section} aria-labelledby="appearance-heading">
          <div>
            <h2 id="appearance-heading" style={styles.sectionTitle}>
              Color themes & appearance
            </h2>
            <p style={styles.description}>
              Choose a canvas and accent for browsing and reading.
            </p>
          </div>
          <div style={styles.themeGrid} role="group" aria-label="Color theme">
            {COLOR_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                aria-pressed={preferences.theme === theme.id}
                onClick={() => updatePreferences({ theme: theme.id })}
                style={{
                  ...styles.themeOption,
                  ...(preferences.theme === theme.id
                    ? styles.selectedThemeOption
                    : {}),
                  background: theme.background,
                  color: theme.text,
                }}
              >
                <span
                  style={{
                    ...styles.themePreview,
                    background: theme.panel,
                    color: theme.text,
                  }}
                >
                  Aa
                </span>
                <span>{theme.label}</span>
              </button>
            ))}
          </div>
          <div style={styles.accentSection}>
            <span style={styles.fieldLabel}>UI accent</span>
            <div
              style={styles.accentGrid}
              role="group"
              aria-label="Accent color"
            >
              {ACCENT_SWATCHES.map((accent) => (
                <button
                  key={accent.id}
                  type="button"
                  aria-label={`${accent.label} accent`}
                  aria-pressed={preferences.accent === accent.id}
                  onClick={() => updatePreferences({ accent: accent.id })}
                  style={styles.accentOption}
                >
                  <span
                    style={{
                      ...styles.accentSwatch,
                      background: accent.color,
                      outline:
                        preferences.accent === accent.id
                          ? `3px solid ${accent.color}55`
                          : "none",
                    }}
                  />
                  <span>{accent.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={styles.themePreviewBand}>
            <span style={styles.themePreviewLabel}>
              <Sparkles size={15} /> Preview
            </span>
            <span style={styles.themePreviewSample}>
              A quiet reading surface
            </span>
            <button type="button" style={styles.themePreviewButton}>
              Accent
            </button>
          </div>
          <label style={styles.toggleRow}>
            <span>
              <span style={styles.fieldLabel}>High contrast</span>
              <span style={styles.description}>
                Increase contrast throughout the app.
              </span>
            </span>
            <input
              type="checkbox"
              checked={preferences.highContrast}
              onChange={(event) =>
                updatePreferences({ highContrast: event.currentTarget.checked })
              }
            />
          </label>
        </section>

        <section style={styles.section} aria-labelledby="reading-heading">
          <div style={styles.readerSettingsHeader}>
            <h2 id="reading-heading" style={styles.sectionTitle}>
              Reading mode & format
            </h2>
            <p style={styles.description}>
              Pick the layout you want, then tune the reading flow to match it.
            </p>
          </div>

          <div style={styles.modeGrid}>
            {[
              {
                mode: "flip" as const,
                title: "Flip Mode",
                description:
                  "Classic page-flip layout. Supports Japanese RTL (Right-to-Left) or LTR with single & double page spread.",
              },
              {
                mode: "webtoon" as const,
                title: "Scroll Mode",
                description:
                  "Vertical continuous scroll. Smooth infinite strip layout optimized for mobile and webtoon series.",
              },
              {
                mode: "novel" as const,
                title: "Novel Mode",
                description:
                  "Text-first reading with broader paragraph spacing and a cleaner flow for EPUB novels.",
              },
            ].map((option) => (
              <button
                key={option.mode}
                type="button"
                aria-pressed={preferences.defaultReaderMode === option.mode}
                onClick={() =>
                  updatePreferences({
                    defaultReaderMode: option.mode,
                  })
                }
                style={{
                  ...styles.modeCard,
                  ...(preferences.defaultReaderMode === option.mode
                    ? styles.modeCardActive
                    : {}),
                }}
              >
                <span style={styles.modeCardTitle}>{option.title}</span>
                <span style={styles.modeCardText}>{option.description}</span>
              </button>
            ))}
          </div>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Default reading direction</span>
            <select
              aria-label="Default reading direction"
              value={preferences.defaultReadingDirection}
              onChange={(event) =>
                updatePreferences({
                  defaultReadingDirection: event.currentTarget
                    .value as ReadingDirection,
                })
              }
              style={styles.select}
            >
              <option value="ltr">Left to right</option>
              <option value="rtl">Right to left</option>
            </select>
          </label>

          <label style={styles.toggleRow}>
            <span>
              <span style={styles.fieldLabel}>Hide reader controls</span>
              <span style={styles.description}>
                Fade the header and reading dock after you stop interacting. Tap
                or move to bring them back.
              </span>
            </span>
            <input
              type="checkbox"
              checked={preferences.readerAutoHide}
              onChange={(event) =>
                updatePreferences({
                  readerAutoHide: event.currentTarget.checked,
                })
              }
            />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Hide controls after</span>
            <select
              aria-label="Reader controls hide delay"
              value={preferences.readerAutoHideDelay}
              onChange={(event) =>
                updatePreferences({
                  readerAutoHideDelay: Number(event.currentTarget.value),
                })
              }
              style={styles.select}
            >
              <option value={1500}>1.5 seconds</option>
              <option value={2500}>2.5 seconds</option>
              <option value={4000}>4 seconds</option>
              <option value={6000}>6 seconds</option>
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Comic page fit</span>
            <select
              aria-label="Default comic page fit"
              value={preferences.readerPageFit}
              onChange={(event) =>
                updatePreferences({
                  readerPageFit: event.currentTarget
                    .value as Preferences["readerPageFit"],
                })
              }
              style={styles.select}
            >
              <option value="screen">Fit screen</option>
              <option value="width">Fit width</option>
              <option value="height">Fit height</option>
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Default comic zoom</span>
            <span style={styles.rangeRow}>
              <input
                aria-label="Default comic zoom"
                type="range"
                min="50"
                max="200"
                step="10"
                value={preferences.readerZoom}
                onChange={(event) =>
                  updatePreferences({
                    readerZoom: Number(event.currentTarget.value),
                  })
                }
                style={styles.range}
              />
              <output style={styles.rangeOutput}>
                {preferences.readerZoom}%
              </output>
            </span>
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Reading width</span>
            <span style={styles.rangeRow}>
              <input
                aria-label="Reader content width"
                type="range"
                min="60"
                max="100"
                step="5"
                value={Math.min(
                  100,
                  Math.max(
                    60,
                    Math.round(
                      60 +
                        ((preferences.readerWidth - 280) /
                          Math.max(
                            1,
                            Math.min(
                              1800,
                              Math.max(280, (window.innerWidth || 1280) - 32),
                            ) - 280,
                          )) *
                          40,
                    ),
                  ),
                )}
                onChange={(event) => {
                  const percent = Number(event.currentTarget.value);
                  const maxWidth = Math.min(
                    1800,
                    Math.max(280, (window.innerWidth || 1280) - 32),
                  );
                  const nextWidth = Math.round(
                    280 + ((percent - 60) / 40) * (maxWidth - 280),
                  );
                  updatePreferences({ readerWidth: nextWidth });
                }}
                style={styles.range}
              />
              <output style={styles.rangeOutput}>
                {Math.min(
                  100,
                  Math.max(
                    60,
                    Math.round(
                      60 +
                        ((preferences.readerWidth - 280) /
                          Math.max(
                            1,
                            Math.min(
                              1800,
                              Math.max(280, (window.innerWidth || 1280) - 32),
                            ) - 280,
                          )) *
                          40,
                    ),
                  ),
                )}
                %
              </output>
            </span>
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Default novel font size</span>
            <span style={styles.rangeRow}>
              <input
                aria-label="Novel text size"
                type="range"
                min="14"
                max="30"
                step="1"
                value={preferences.novelFontSize}
                onChange={(event) =>
                  updatePreferences({
                    novelFontSize: Number(event.currentTarget.value),
                  })
                }
                style={styles.range}
              />
              <output style={styles.rangeOutput}>
                {preferences.novelFontSize}px
              </output>
            </span>
          </label>

          <label style={styles.toggleRow}>
            <span>
              <span style={styles.fieldLabel}>
                Comic & Manga infinite scroll
              </span>
              <span style={styles.description}>
                Automatically load the next chapter while scrolling to the end
                of the current chapter.
              </span>
            </span>
            <input
              type="checkbox"
              checked={preferences.comicInfiniteScroll}
              onChange={(event) =>
                updatePreferences({
                  comicInfiniteScroll: event.currentTarget.checked,
                })
              }
            />
          </label>

          <label style={styles.toggleRow}>
            <span>
              <span style={styles.fieldLabel}>Novel infinite text scroll</span>
              <span style={styles.description}>
                Scroll through novel and EPUB text infinitely without having to
                press “Next Chapter”.
              </span>
            </span>
            <input
              type="checkbox"
              checked={preferences.novelInfiniteScroll}
              onChange={(event) =>
                updatePreferences({
                  novelInfiniteScroll: event.currentTarget.checked,
                })
              }
            />
          </label>

          <label style={styles.toggleRow}>
            <span>
              <span style={styles.fieldLabel}>Immersive view</span>
              <span style={styles.description}>
                Hide the chrome and keep the page in a cleaner, distraction-free
                reading space.
              </span>
            </span>
            <input
              type="checkbox"
              checked={preferences.immersiveMode}
              onChange={(event) =>
                updatePreferences({
                  immersiveMode: event.currentTarget.checked,
                })
              }
            />
          </label>
        </section>

        <section style={styles.section} aria-labelledby="content-heading">
          <div>
            <h2 id="content-heading" style={styles.sectionTitle}>
              Content filter
            </h2>
            <p style={styles.description}>
              Hide mature-rated series from browsing.
            </p>
          </div>
          <label style={styles.toggleRow}>
            <span>
              <span style={styles.fieldLabel}>Safe mode</span>
              <span style={styles.description}>
                Exclude titles marked 18+, Adult, Mature, R18, or NC-17.
              </span>
            </span>
            <input
              type="checkbox"
              checked={preferences.safeMode}
              onChange={(event) =>
                updatePreferences({ safeMode: event.currentTarget.checked })
              }
            />
          </label>
        </section>

        <section style={styles.section} aria-labelledby="storage-heading">
          <div>
            <h2 id="storage-heading" style={styles.sectionTitle}>
              Browser storage
            </h2>
            <p style={styles.description}>
              Your imported files stay on this device.
            </p>
          </div>
          <dl style={styles.storageGrid}>
            <div>
              <dt style={styles.storageLabel}>In use</dt>
              <dd style={styles.storageValue}>
                {formatBytes(storageStatus.usage)}
              </dd>
            </div>
            <div>
              <dt style={styles.storageLabel}>Available quota</dt>
              <dd style={styles.storageValue}>
                {formatBytes(storageStatus.quota)}
              </dd>
            </div>
            <div>
              <dt style={styles.storageLabel}>Persistence</dt>
              <dd style={styles.storageValue}>
                {storageStatus.persistent === undefined
                  ? "Checking"
                  : storageStatus.persistent
                    ? "Protected"
                    : "Not protected"}
              </dd>
            </div>
          </dl>
          <details style={styles.storageDetails}>
            <summary style={styles.storageSummary}>
              Storage by series
              <span>
                {seriesStorage.length}{" "}
                {seriesStorage.length === 1 ? "book" : "books"}
              </span>
            </summary>
            {seriesStorage.length > 0 ? (
              <div style={styles.storageRows}>
                {seriesStorage.map((item) => (
                  <div key={item.id} style={styles.storageRow}>
                    <span style={styles.storageBookIcon} aria-hidden="true">
                      ▤
                    </span>
                    <span style={styles.storageBookDetails}>
                      <strong style={styles.storageBookTitle}>
                        {item.title}
                      </strong>
                      <span style={styles.storageBookMeta}>
                        {item.chapterCount} chapters · {item.pageCount} pages
                      </span>
                    </span>
                    <strong style={styles.storageBookSize}>
                      {formatBytes(item.bytes)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p style={styles.description}>
                Your books will appear here after import.
              </p>
            )}
          </details>
          <button
            type="button"
            onClick={() => void requestPersistentStorage()}
            disabled={isRequestingPersistence || storageStatus.persistent}
            style={styles.secondaryButton}
          >
            {isRequestingPersistence
              ? "Requesting..."
              : "Protect local library"}
          </button>
          {storageMessage ? (
            <p role="status" style={styles.description}>
              {storageMessage}
            </p>
          ) : null}
        </section>

        <section style={styles.section} aria-labelledby="backup-heading">
          <div>
            <h2 id="backup-heading" style={styles.sectionTitle}>
              Backup and recovery
            </h2>
            <p style={styles.description}>
              Backups include your local series, reading positions, bookmarks,
              and preferences. Restoring merges records and replaces matching
              IDs.
            </p>
          </div>
          <div style={styles.backupActions}>
            <button
              type="button"
              onClick={() => void downloadBackup()}
              disabled={isBackingUp || isRestoring || isClearing}
              style={styles.secondaryButton}
            >
              {isBackingUp ? "Preparing backup..." : "Download backup"}
            </button>
            <label style={styles.fileButton}>
              {isRestoring ? "Restoring..." : "Restore backup"}
              <input
                type="file"
                accept=".zip,application/zip"
                disabled={isBackingUp || isRestoring || isClearing}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) {
                    void restoreBackup(file);
                  }
                  event.currentTarget.value = "";
                }}
                style={styles.hiddenFileInput}
              />
            </label>
            <button
              type="button"
              onClick={() => void clearLibrary()}
              disabled={isBackingUp || isRestoring || isClearing}
              style={styles.dangerButton}
            >
              {isClearing ? "Clearing..." : "Clear local library"}
            </button>
          </div>
          {backupMessage ? (
            <p role="status" style={styles.description}>
              {backupMessage}
            </p>
          ) : null}
        </section>

        <section style={styles.section} aria-labelledby="shortcuts-heading">
          <div>
            <h2 id="shortcuts-heading" style={styles.sectionTitle}>
              Keyboard controls
            </h2>
            <p style={styles.description}>
              Navigate pages and open reader tools without leaving the keyboard.
            </p>
          </div>
          <dl style={styles.shortcutList}>
            <div style={styles.shortcutRow}>
              <dt style={styles.shortcutTerm}>Previous / next page</dt>
              <dd style={styles.shortcutKeys}>
                <kbd style={styles.keycap}>←</kbd>
                <kbd style={styles.keycap}>→</kbd>
              </dd>
            </div>
            <div style={styles.shortcutRow}>
              <dt style={styles.shortcutTerm}>Previous / next page</dt>
              <dd style={styles.shortcutKeys}>
                <kbd style={styles.keycap}>Page Up</kbd>
                <kbd style={styles.keycap}>Page Down</kbd>
              </dd>
            </div>
            <div style={styles.shortcutRow}>
              <dt style={styles.shortcutTerm}>Page grid</dt>
              <dd style={styles.shortcutKeys}>
                <kbd style={styles.keycap}>G</kbd>
              </dd>
            </div>
            <div style={styles.shortcutRow}>
              <dt style={styles.shortcutTerm}>Toggle fullscreen</dt>
              <dd style={styles.shortcutKeys}>
                <kbd style={styles.keycap}>F</kbd>
              </dd>
            </div>
          </dl>
        </section>

        <section style={styles.section} aria-labelledby="install-heading">
          <div>
            <h2 id="install-heading" style={styles.sectionTitle}>
              App installation
            </h2>
            <p style={styles.description}>
              {isInstalled
                ? "Kage Reader is installed on this device."
                : "Install Kage Reader for a standalone app window and offline access."}
            </p>
          </div>
          {!isInstalled ? (
            <button
              type="button"
              onClick={() => void installApp()}
              disabled={!installPrompt}
              style={styles.secondaryButton}
            >
              Install app
            </button>
          ) : null}
          {installMessage ? (
            <p role="status" style={styles.description}>
              {installMessage}
            </p>
          ) : null}
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
    maxWidth: 900,
    margin: "0 auto",
    display: "grid",
    gap: 22,
  },
  settingsJumpNav: {
    position: "sticky",
    zIndex: 4,
    top: 66,
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: "9px 0",
    borderBottom: "1px solid var(--app-border)",
    background: "color-mix(in srgb, var(--app-bg) 94%, transparent)",
    backdropFilter: "blur(12px)",
  },
  settingsJumpLink: {
    padding: "6px 9px",
    border: "1px solid transparent",
    borderRadius: 6,
    color: "var(--app-muted)",
    fontSize: 10,
    fontWeight: 600,
    textDecoration: "none",
  },
  themePreviewBand: {
    display: "flex",
    minHeight: 48,
    alignItems: "center",
    gap: 10,
    padding: "7px 10px",
    border: "1px solid var(--app-border)",
    borderRadius: 8,
    background: "var(--app-panel)",
  },
  themePreviewLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "var(--app-muted)",
    fontSize: 10,
  },
  themePreviewSample: { flex: 1, color: "var(--app-text)", fontSize: 11 },
  themePreviewButton: {
    minHeight: 29,
    padding: "0 11px",
    border: 0,
    borderRadius: 5,
    background: "var(--app-lime)",
    color: "var(--app-bg)",
    fontSize: 10,
    fontWeight: 700,
  },
  header: {
    display: "flex",
    alignItems: "end",
    justifyContent: "space-between",
    gap: 16,
  },
  kicker: {
    margin: 0,
    color: "var(--app-lime)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  title: {
    margin: "7px 0 0",
    fontFamily: "var(--font-display)",
    fontSize: 36,
    fontWeight: 600,
  },
  section: {
    display: "grid",
    gap: 16,
    padding: "22px 0",
    borderTop: "1px solid var(--app-border)",
  },
  themeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
    gap: 9,
  },
  themeOption: {
    display: "grid",
    gap: 8,
    padding: 9,
    border: "1px solid var(--app-border)",
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 700,
    textAlign: "left",
    cursor: "pointer",
  },
  selectedThemeOption: {
    outline: "2px solid var(--app-lime)",
    outlineOffset: 1,
  },
  themePreview: {
    display: "flex",
    height: 38,
    alignItems: "center",
    padding: "0 10px",
    border: "1px solid #ffffff16",
    borderRadius: 5,
    fontFamily: "var(--font-display)",
    fontSize: 15,
  },
  accentSection: { display: "grid", gap: 10 },
  accentGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  accentOption: {
    display: "grid",
    justifyItems: "center",
    gap: 7,
    minWidth: 52,
    padding: 5,
    border: "1px solid transparent",
    borderRadius: 7,
    background: "transparent",
    color: "var(--app-muted)",
    fontSize: 10,
    cursor: "pointer",
  },
  accentSwatch: {
    display: "block",
    width: 24,
    height: 24,
    border: "2px solid #ffffff22",
    borderRadius: "50%",
  },
  safeModeButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    padding: "0 10px",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 7,
    background: "var(--app-panel)",
    color: "var(--app-text)",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  sectionTitle: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 19,
    fontWeight: 600,
  },
  description: {
    margin: "6px 0 0",
    color: "var(--app-muted)",
    lineHeight: 1.55,
    fontSize: 12,
  },
  readerSettingsHeader: { display: "grid", gap: 4 },
  modeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  modeCard: {
    display: "grid",
    gap: 8,
    minHeight: 158,
    padding: 18,
    border: "1px solid var(--app-border)",
    borderRadius: 12,
    background: "var(--app-panel)",
    color: "var(--app-text)",
    textAlign: "left",
    cursor: "pointer",
    transition: "border-color 140ms ease, transform 140ms ease",
  },
  modeCardActive: {
    border: "1px solid var(--app-border-strong)",
    background: "var(--app-panel-raised)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
  },
  modeCardTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 600,
  },
  modeCardText: {
    color: "var(--app-muted)",
    fontSize: 12,
    lineHeight: 1.55,
  },
  field: { display: "grid", gap: 8, maxWidth: 390 },
  fieldLabel: { display: "block", fontSize: 12, fontWeight: 700 },
  select: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 7,
    background: "var(--app-panel)",
    color: "var(--app-text)",
    font: "inherit",
  },
  rangeRow: { display: "flex", alignItems: "center", gap: 14 },
  range: { width: "100%", accentColor: "var(--app-lime)" },
  rangeOutput: {
    minWidth: 48,
    color: "var(--app-lime)",
    textAlign: "right",
    fontSize: 12,
  },
  toggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    maxWidth: 500,
  },
  storageGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 16,
    margin: 0,
  },
  storageDetails: {
    overflow: "hidden",
    border: "1px solid var(--app-border)",
    borderRadius: 8,
    background: "var(--app-panel)",
  },
  storageSummary: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "11px 12px",
    color: "var(--app-text)",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  storageRows: {
    display: "grid",
    maxHeight: 260,
    overflowY: "auto",
    padding: "0 9px 9px",
  },
  storageRow: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: 10,
    padding: "9px 5px",
    borderTop: "1px solid var(--app-border)",
  },
  storageBookIcon: {
    display: "grid",
    width: 28,
    height: 28,
    flex: "0 0 auto",
    placeItems: "center",
    borderRadius: 6,
    background: "var(--app-panel-raised)",
    color: "var(--app-lime)",
    fontSize: 14,
  },
  storageBookDetails: { display: "grid", minWidth: 0, flex: 1, gap: 3 },
  storageBookTitle: {
    overflow: "hidden",
    color: "var(--app-text)",
    fontSize: 10,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  storageBookMeta: { color: "var(--app-muted)", fontSize: 9 },
  storageBookSize: {
    flex: "0 0 auto",
    color: "var(--app-text)",
    fontFamily: "var(--font-display)",
    fontSize: 10,
  },
  storageLabel: { color: "var(--app-muted)", fontSize: 11 },
  storageValue: {
    margin: "5px 0 0",
    fontFamily: "var(--font-display)",
    fontSize: 16,
    fontWeight: 600,
  },
  linkButton: {
    color: "#182014",
    background: "var(--app-lime)",
    textDecoration: "none",
    borderRadius: 7,
    padding: "10px 16px",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifySelf: "start",
    color: "var(--app-text)",
    background: "var(--app-panel-raised)",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 7,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  backupActions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  fileButton: {
    position: "relative",
    color: "var(--app-text)",
    background: "var(--app-panel-raised)",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 7,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  hiddenFileInput: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    opacity: 0,
    cursor: "pointer",
  },
  dangerButton: {
    color: "#ffe5e1",
    background: "#562522",
    border: "1px solid #8f473e",
    borderRadius: 7,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  shortcutList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 8,
    margin: 0,
  },
  shortcutRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    padding: "9px 11px",
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    background: "var(--app-panel)",
  },
  shortcutTerm: { color: "var(--app-muted)", fontSize: 10 },
  shortcutKeys: { display: "inline-flex", gap: 4, margin: 0 },
  keycap: {
    padding: "3px 6px",
    border: "1px solid var(--app-border-strong)",
    borderRadius: 4,
    background: "var(--app-panel-raised)",
    color: "var(--app-text)",
    fontFamily: "var(--font-body)",
    fontSize: 9,
  },
};
