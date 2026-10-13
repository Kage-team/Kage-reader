import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getPreferences,
  savePreferences,
  type Preferences,
} from "../../lib/preferences/preferences";
import type { ReaderMode } from "../../lib/storage/types";

type StorageStatus = {
  usage?: number;
  quota?: number;
  persistent?: boolean;
};

function formatBytes(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) {
    return "Unavailable";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsPage() {
  const [preferences, setPreferences] = useState<Preferences>(getPreferences);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({});
  const [storageMessage, setStorageMessage] = useState("");
  const [isRequestingPersistence, setIsRequestingPersistence] = useState(false);

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

  function updatePreferences(update: Partial<Preferences>): void {
    const nextPreferences = savePreferences({ ...preferences, ...update });
    setPreferences(nextPreferences);
    document.body.style.filter = nextPreferences.highContrast
      ? "contrast(1.18)"
      : "";
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

        <section style={styles.section} aria-labelledby="reading-heading">
          <div>
            <h2 id="reading-heading" style={styles.sectionTitle}>
              Reading
            </h2>
            <p style={styles.description}>
              Set the defaults used when opening a series.
            </p>
          </div>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Default reader mode</span>
            <select
              value={preferences.defaultReaderMode}
              onChange={(event) =>
                updatePreferences({
                  defaultReaderMode: event.currentTarget.value as ReaderMode,
                })
              }
              style={styles.select}
            >
              <option value="flip">Page</option>
              <option value="webtoon">Vertical</option>
              <option value="novel">Text</option>
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Novel text size</span>
            <span style={styles.rangeRow}>
              <input
                aria-label="Novel text size"
                type="range"
                min="80"
                max="150"
                step="5"
                value={preferences.textScale}
                onChange={(event) =>
                  updatePreferences({
                    textScale: Number(event.currentTarget.value),
                  })
                }
                style={styles.range}
              />
              <output style={styles.rangeOutput}>
                {preferences.textScale}%
              </output>
            </span>
          </label>

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
    gap: 22,
  },
  header: {
    display: "flex",
    alignItems: "end",
    justifyContent: "space-between",
    gap: 16,
  },
  kicker: {
    margin: 0,
    color: "#8fc49a",
    fontSize: 12,
    textTransform: "uppercase",
  },
  title: { margin: "8px 0 0", fontSize: 40 },
  section: {
    display: "grid",
    gap: 18,
    padding: "20px 0",
    borderTop: "1px solid rgba(143, 196, 154, 0.22)",
  },
  sectionTitle: { margin: 0, fontSize: 21 },
  description: { margin: "6px 0 0", color: "#afc1b2", lineHeight: 1.5 },
  field: { display: "grid", gap: 8, maxWidth: 360 },
  fieldLabel: { display: "block", fontWeight: 700 },
  select: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid rgba(143, 196, 154, 0.35)",
    borderRadius: 6,
    background: "#17221b",
    color: "#e6f2e8",
    font: "inherit",
  },
  rangeRow: { display: "flex", alignItems: "center", gap: 14 },
  range: { width: "100%", accentColor: "#8fc49a" },
  rangeOutput: { minWidth: 48, color: "#dfeae1", textAlign: "right" },
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
  storageLabel: { color: "#afc1b2", fontSize: 14 },
  storageValue: { margin: "5px 0 0", fontWeight: 700 },
  linkButton: {
    color: "#0b1210",
    background: "#8fc49a",
    textDecoration: "none",
    borderRadius: 6,
    padding: "10px 16px",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  secondaryButton: {
    justifySelf: "start",
    color: "#e6f2e8",
    background: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(143, 196, 154, 0.3)",
    borderRadius: 6,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
};
