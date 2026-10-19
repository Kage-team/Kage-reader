import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  applyPreferencesToDocument,
  DEFAULT_PREFERENCES,
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
import { BookOpen, Sparkles } from "lucide-react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";
import type { PwaInstallPrompt } from "../../lib/pwa/install";
import { measureStorageBreakdown, type StorageBreakdown } from "../../lib/storage/measurement";
import type {
  AccentColor,
  ColorTheme,
  ReadingDirection,
} from "../../lib/preferences/preferences";
import {
  clearAdultAccess,
  createAdultPinCredential,
  grantAdultAccess,
} from "../../lib/security/adultPin";
import { applyStealthMode } from "../../lib/security/stealth";

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
  {
    id: "stone",
    label: "Soft Stone",
    background: "#e6e3de",
    panel: "#f3f1ed",
    text: "#2d2c2a",
  },
  {
    id: "ocean",
    label: "Deep Ocean",
    background: "#0d1b24",
    panel: "#1b3845",
    text: "#e8f2f3",
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

const SETTINGS_TABS = [
  { id: "appearance", label: "Appearance" },
  { id: "reading", label: "Reading" },
  { id: "content", label: "Content" },
  { id: "privacy", label: "Privacy" },
  { id: "storage", label: "Storage" },
  { id: "backup", label: "Backup" },
] as const;

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
 const [previewTheme, setPreviewTheme] = useState<ColorTheme | null>(null);
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<(typeof SETTINGS_TABS)[number]["id"]>("appearance");
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({});
  const [seriesStorage, setSeriesStorage] = useState<SeriesStorageUsage[]>([]);
  const [storageBreakdown, setStorageBreakdown] = useState<StorageBreakdown | null>(null);
  const [storageMessage, setStorageMessage] = useState("");
  const [isRequestingPersistence, setIsRequestingPersistence] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [healthMessage, setHealthMessage] = useState("");
  const [isCheckingLibrary, setIsCheckingLibrary] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [installMessage, setInstallMessage] = useState("");
  const [adultPin, setAdultPin] = useState("");
  const [adultPinConfirmation, setAdultPinConfirmation] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");

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
    void Promise.all([readSeriesStorageUsage(), measureStorageBreakdown()])
      .then(([bySeries, breakdown]) => { setSeriesStorage(bySeries); setStorageBreakdown(breakdown); })
      .catch(() => {
        setStorageMessage("Could not calculate library storage by series.");
      });
  }, []);

  function updatePreferences(update: Partial<Preferences>): void {
  const nextPreferences = savePreferences({ ...preferences, ...update });
  setPreferences(nextPreferences);
  applyPreferencesToDocument(nextPreferences);
  applyStealthMode(nextPreferences.stealthMode);
  }

  function resetActiveSection(): void {
    const resets: Record<string, Partial<Preferences>> = {
      appearance: { theme: DEFAULT_PREFERENCES.theme, accent: DEFAULT_PREFERENCES.accent, highContrast: DEFAULT_PREFERENCES.highContrast },
      reading: { defaultReaderMode: DEFAULT_PREFERENCES.defaultReaderMode, defaultReadingDirection: DEFAULT_PREFERENCES.defaultReadingDirection, textScale: DEFAULT_PREFERENCES.textScale },
      content: { safeMode: DEFAULT_PREFERENCES.safeMode, adultPinSalt: DEFAULT_PREFERENCES.adultPinSalt, adultPinHash: DEFAULT_PREFERENCES.adultPinHash },
      privacy: { stealthMode: DEFAULT_PREFERENCES.stealthMode },
      storage: { lastBackupAt: DEFAULT_PREFERENCES.lastBackupAt },
      backup: { lastBackupAt: DEFAULT_PREFERENCES.lastBackupAt },
    };
    setPreviewTheme(null);
    updatePreferences(resets[activeSettingsTab] ?? {});
  }

  async function saveAdultPin(): Promise<void> {
    if (!/^\d{4,6}$/.test(adultPin)) {
      setSecurityMessage("PIN must contain 4 to 6 digits.");
      return;
    }
    if (adultPin !== adultPinConfirmation) {
      setSecurityMessage("PIN entries do not match.");
      return;
    }

    try {
      const credential = await createAdultPinCredential(adultPin);
      updatePreferences({
        adultPinSalt: credential.salt,
        adultPinHash: credential.hash,
      });
      grantAdultAccess(credential.hash);
      setAdultPin("");
      setAdultPinConfirmation("");
      setSecurityMessage("Adult access PIN saved.");
    } catch {
      setSecurityMessage("Could not create a PIN in this browser.");
    }
  }

  function removeAdultPin(): void {
    clearAdultAccess();
    updatePreferences({
      adultPinSalt: "",
      adultPinHash: "",
      safeMode: true,
    });
    setSecurityMessage("Adult access PIN removed; Safe mode is on.");
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
      updatePreferences({ lastBackupAt: Date.now() });
      setStorageBreakdown((current) => current ? { ...current, backupBytes: backup.size } : current);
      setBackupMessage(`Backup downloaded (${formatBytes(backup.size)}).`);
    } catch (error) {
      setBackupMessage(
        error instanceof Error ? error.message : "Could not create backup.",
      );
    } finally {
      setIsBackingUp(false);
    }
  }

  async function checkLibraryHealth(): Promise<void> {
    setIsCheckingLibrary(true);
    setHealthMessage("");
    try {
      const [pages, series] = await Promise.all([listAllPages(), listSeries()]);
      const missingPages = await Promise.all(
        pages.map(async (page) =>
          (await getBlob(page.storageKey)) ? undefined : page.storageKey,
        ),
      );
      const missingCovers = await Promise.all(
        series
          .filter((entry) => entry.coverPageKey)
          .map(async (entry) =>
            (await getBlob(entry.coverPageKey!))
              ? undefined
              : entry.coverPageKey,
          ),
      );
      const missingPageCount = missingPages.filter(Boolean).length;
      const missingCoverCount = missingCovers.filter(Boolean).length;
      setHealthMessage(
        missingPageCount === 0 && missingCoverCount === 0
          ? `Checked ${pages.length} pages and ${series.length} series. No missing files found.`
          : `Found ${missingPageCount} missing page files and ${missingCoverCount} missing covers.`,
      );
    } catch {
      setHealthMessage("Could not complete the library check.");
    } finally {
      setIsCheckingLibrary(false);
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
  setIsClearDialogOpen(false);
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
    <main className="settingsPage" style={styles.page}>
      <section className="settingsPagePanel" style={styles.panel}>
        <header style={styles.header}>
          <div>
            <p style={styles.kicker}>Preferences</p>
            <h1 style={styles.title}>Settings</h1>
          </div>
          <Link to="/?view=all" style={styles.linkButton}>
            Back to library
          </Link>
        </header>

        <nav
          className="settingsSectionNav"
          style={styles.settingsJumpNav}
          aria-label="Settings categories"
        >
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="settingsTab"
              aria-pressed={activeSettingsTab === tab.id}
              onClick={() => setActiveSettingsTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <button type="button" className="settingsResetButton" onClick={resetActiveSection}>
            Reset {SETTINGS_TABS.find((tab) => tab.id === activeSettingsTab)?.label ?? "section"}
          </button>
        </nav>

        <section
          className="settingsSection"
          style={styles.section}
          aria-labelledby="appearance-heading"
          hidden={activeSettingsTab !== "appearance"}
        >
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
                className="settingsThemeOption"
  aria-pressed={(previewTheme ?? preferences.theme) === theme.id}
  onClick={() => setPreviewTheme(theme.id) }
                style={{
                  ...styles.themeOption,
                  ...(preferences.theme === theme.id
                    ? styles.selectedThemeOption
                    : {}),
                  background: "transparent",
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
          {(() => {
            const selectedTheme = COLOR_THEMES.find((theme) => theme.id === (previewTheme ?? preferences.theme)) ?? COLOR_THEMES[0];
            return (
              <div className="settingsPreviewBand" style={{ ...styles.themePreviewBand, background: selectedTheme.panel, color: selectedTheme.text }}>
                <span style={styles.themePreviewLabel}>
                  <Sparkles size={15} /> Contrast preview
                </span>
                <span style={styles.themePreviewSample}>Readable body text · Aa 123</span>
                <span className="settingsContrastSample">Icon and label</span>
                {previewTheme && previewTheme !== preferences.theme ? (
                  <button type="button" style={styles.themePreviewButton} onClick={() => { updatePreferences({ theme: previewTheme }); setPreviewTheme(null); }}>
                    Apply theme
                  </button>
                ) : null}
              </div>
            );
          })()}
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

        <section
          className="settingsSection"
          style={styles.section}
          aria-labelledby="reading-heading"
          hidden={activeSettingsTab !== "reading"}
        >
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
                className="settingsModeOption"
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

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Reader tap behavior</span>
            <select
              aria-label="Reader tap behavior"
              value={preferences.readerTapBehavior}
              onChange={(event) =>
                updatePreferences({
                  readerTapBehavior: event.currentTarget
                    .value as Preferences["readerTapBehavior"],
                })
              }
              style={styles.select}
            >
              <option value="controls">Tap to reveal controls</option>
              <option value="toggle-controls">Tap to toggle controls</option>
              <option value="page-turn">Tap page edges to turn</option>
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

        <section
          className="settingsSection"
          style={styles.section}
          aria-labelledby="content-heading"
          hidden={activeSettingsTab !== "content"}
        >
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

        <section
          className="settingsSection"
          style={styles.section}
          aria-labelledby="adult-access-heading"
          hidden={activeSettingsTab !== "privacy"}
        >
          <div>
            <h2 id="adult-access-heading" style={styles.sectionTitle}>
              Adult access
            </h2>
            <p style={styles.description}>
              A local privacy gate only. It does not encrypt imported files or
              protect data from someone with browser storage access.
            </p>
          </div>
          <p style={styles.description}>
            {preferences.adultPinHash ? "PIN is set." : "No PIN is set."}
          </p>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>New 4–6 digit PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{4,6}"
              maxLength={6}
              value={adultPin}
              onChange={(event) => setAdultPin(event.currentTarget.value)}
              style={styles.select}
            />
          </label>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Confirm PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{4,6}"
              maxLength={6}
              value={adultPinConfirmation}
              onChange={(event) =>
                setAdultPinConfirmation(event.currentTarget.value)
              }
              style={styles.select}
            />
          </label>
          <div style={styles.backupActions}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => void saveAdultPin()}
            >
              Save PIN
            </button>
            {preferences.adultPinHash ? (
              <button
                type="button"
                style={styles.dangerButton}
                onClick={removeAdultPin}
              >
                Remove PIN
              </button>
            ) : null}
          </div>
          {securityMessage ? (
            <p role="status" style={styles.description}>
              {securityMessage}
            </p>
          ) : null}
          <label style={styles.toggleRow}>
            <span>
              <span style={styles.fieldLabel}>Stealth disguise</span>
              <span style={styles.description}>
                Use a neutral browser-tab title and icon.
              </span>
            </span>
            <input
              type="checkbox"
              checked={preferences.stealthMode}
              onChange={(event) =>
                updatePreferences({ stealthMode: event.currentTarget.checked })
              }
            />
          </label>
        </section>

        <section
          className="settingsSection"
          style={styles.section}
          aria-labelledby="storage-heading"
          hidden={activeSettingsTab !== "storage"}
        >
          <div>
            <h2 id="storage-heading" style={styles.sectionTitle}>
              Browser storage
            </h2>
            <p style={styles.description}>
              Your imported files stay on this device.
            </p>
          </div>
          {storageStatus.usage === undefined ? (
            <LoadingSkeleton label="Loading storage usage" lines={4} />
          ) : null}
          <dl style={styles.storageGrid} aria-busy={storageStatus.usage === undefined}>
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
          <div className="storageBreakdown" aria-label="Measured storage breakdown">
            <div><span>Page images</span><strong>{formatBytes(storageBreakdown?.pageBytes)}</strong></div>
            <div><span>Cover images</span><strong>{formatBytes(storageBreakdown?.coverBytes)}</strong></div>
            <div><span>Metadata</span><strong>{formatBytes(storageBreakdown?.metadataBytes)}</strong></div>
            <div><span>Bookmarks</span><strong>{formatBytes(storageBreakdown?.bookmarkBytes)}</strong></div>
            <div><span>Reading progress</span><strong>{formatBytes(storageBreakdown?.progressBytes)}</strong></div>
            <div><span>Last backup generated</span><strong>{formatBytes(storageBreakdown?.backupBytes)}</strong></div>
          </div>
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
                      <BookOpen size={16} strokeWidth={1.8} />
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
          <button
            type="button"
            onClick={() => void checkLibraryHealth()}
            disabled={isCheckingLibrary}
            style={styles.secondaryButton}
          >
            {isCheckingLibrary ? "Checking files..." : "Check library files"}
          </button>
          {healthMessage ? (
            <p role="status" style={styles.description}>
              {healthMessage}
            </p>
          ) : null}
          {storageMessage ? (
            <p role="status" style={styles.description}>
              {storageMessage}
            </p>
          ) : null}
        </section>

        <section
          className="settingsSection"
          style={styles.section}
          aria-labelledby="backup-heading"
          hidden={activeSettingsTab !== "backup"}
        >
          <div>
            <h2 id="backup-heading" style={styles.sectionTitle}>
              Backup and recovery
            </h2>
            <p style={styles.description}>
              Backups include your local series, reading positions, bookmarks,
              and preferences. Restoring merges records and replaces matching
              IDs.
            </p>
            <div className="settingsDangerNotice" role="note">
              <strong>Clear all books and local data</strong>
              <span>This removes imported books, pages, chapters, progress, bookmarks, linked folders, and cached files from this device. Create a backup first if you may need to restore them.</span>
            </div>
            <p
              role="status"
              style={{
                ...styles.description,
                color:
                  !preferences.lastBackupAt ||
                  Date.now() - preferences.lastBackupAt >
                    7 * 24 * 60 * 60 * 1000
                    ? "var(--app-danger)"
                    : "var(--app-muted)",
              }}
            >
              {!preferences.lastBackupAt
                ? "No backup has been downloaded on this device yet."
                : Date.now() - preferences.lastBackupAt >
                    7 * 24 * 60 * 60 * 1000
                  ? "Your last backup is more than 7 days old."
                  : `Last backup: ${new Date(preferences.lastBackupAt).toLocaleDateString()}.`}
            </p>
          </div>
          {isBackingUp || isRestoring ? (
            <LoadingSkeleton
              label={isRestoring ? "Restoring backup" : "Creating backup"}
              lines={3}
              className="settingsBackupSkeleton"
            />
          ) : null}
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
  onClick={() => setIsClearDialogOpen(true)}
  disabled={isBackingUp || isRestoring || isClearing}
              style={styles.dangerButton}
            >
              {isClearing ? "Clearing all books..." : "Clear all books"}
            </button>
          </div>
          {backupMessage ? (
            <p role="status" style={styles.description}>
              {backupMessage}
            </p>
          ) : null}
        </section>

        <section
          className="settingsSection"
          style={styles.section}
          aria-labelledby="shortcuts-heading"
          hidden={activeSettingsTab !== "reading"}
        >
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

        <section
          className="settingsSection"
          style={styles.section}
          aria-labelledby="install-heading"
          hidden={activeSettingsTab !== "appearance"}
        >
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
      <ConfirmDialog
        open={isClearDialogOpen}
        title="Clear all books and local data?"
        description="This action permanently removes every imported series, chapter, page, reading position, bookmark, linked folder, and cached file from this device."
        consequence="This cannot be undone. Create a backup first if you may need to restore your library."
        confirmLabel="Clear all books"
        busy={isClearing}
        onConfirm={() => void clearLibrary()}
        onCancel={() => setIsClearDialogOpen(false)}
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
    maxWidth: 1240,
    margin: "0 auto",
    display: "grid",
    gap: 22,
  },
  settingsJumpNav: {
    position: "sticky",
    zIndex: 4,
    top: "var(--settings-nav-top, 66px)",
    display: "flex",
    flexWrap: "nowrap",
    gap: 6,
    overflowX: "auto",
    overscrollBehaviorX: "contain",
    scrollbarWidth: "none",
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
    background: "var(--app-text)",
    color: "var(--app-panel)",
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
    color: "var(--app-text)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  title: {
    margin: "7px 0 0",
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 600,
  },
  section: {
    display: "grid",
    gap: 16,
    padding: "28px 24px",
    border: "1px solid var(--app-border)",
    borderRadius: 14,
    scrollMarginTop: 124,
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
    outline: "2px solid var(--app-text)",
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
