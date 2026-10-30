import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  FileUp,
  FolderOpen,
  RefreshCw,
  Unlink,
  Upload,
} from "lucide-react";
import { importArchiveSources } from "../../lib/import/importer";
import { collectLinkedFolderSources } from "../../lib/import/linkedFolder";
import type { ImportProgressEvent } from "../../lib/import/types";
import {
  deleteLinkedFolder,
  getLinkedFolder,
  putLinkedFolder,
} from "../../lib/storage/db";
import type { ArchiveSource } from "../../lib/import/types";
import { StatusBadge, type StatusBadgeKind } from "../ui/StatusBadge";
import { OverlayShell } from "../ui/OverlayShell";
import { LoadingSkeleton } from "../ui/LoadingSkeleton";

type DirectoryPermissionHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
};

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options: {
    mode: "read";
  }) => Promise<DirectoryPermissionHandle>;
};

type ImportLogItem = ImportProgressEvent & { key: string };

function toArchiveSources(
  files: FileList | File[],
): Array<{ name: string; blob: Blob }> {
  return Array.from(files, (file) => ({
    name: file.webkitRelativePath || file.name,
    blob: file,
  }));
}

export function ImportPage() {
  const [statusItems, setStatusItems] = useState<ImportLogItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [importStartedAt, setImportStartedAt] = useState(0);
  const [expectedImportFileCount, setExpectedImportFileCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [linkedFolderName, setLinkedFolderName] = useState("");
  const [folderMessage, setFolderMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const importControllerRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);
  const resumeWaitersRef = useRef<Array<() => void>>([]);
  const latestSourcesRef = useRef<ArchiveSource[]>([]);
  const scanLinkedFolderRef = useRef<
    (
      directory?: FileSystemDirectoryHandle,
      requestPermission?: boolean,
    ) => Promise<void>
  >(() => Promise.resolve());
  const supportsDirectoryLinking =
    typeof (window as WindowWithDirectoryPicker).showDirectoryPicker ===
    "function";

  async function importSources(sources: ArchiveSource[]): Promise<void> {
    if (isImporting || sources.length === 0) return;

    setStatusItems([]);
    setIsImporting(true);
    setIsPaused(false);
    setImportStartedAt(Date.now());
    setExpectedImportFileCount(sources.length);
    pausedRef.current = false;
    latestSourcesRef.current = sources;
    const controller = new AbortController();
    importControllerRef.current = controller;
    const updateStatus = (event: ImportProgressEvent): void => {
      setStatusItems((current) => {
        const item = { ...event, key: String(event.index) };
        const existingIndex = current.findIndex(
          (entry) => entry.key === item.key,
        );
        if (existingIndex < 0) return [...current, item];
        return current.map((entry, index) =>
          index === existingIndex ? item : entry,
        );
      });
    };

    try {
      await importArchiveSources(sources, updateStatus, undefined, {
        signal: controller.signal,
        waitUntilResumed: () => {
          if (!pausedRef.current) return Promise.resolve();
          return new Promise<void>((resolve) =>
            resumeWaitersRef.current.push(resolve),
          );
        },
      });
    } catch (error) {
      updateStatus({
        fileName: "Import failed",
        index: 1,
        total: 1,
        state: "error",
        progress: 100,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsImporting(false);
      setIsPaused(false);
      pausedRef.current = false;
      importControllerRef.current = null;
      resumeWaitersRef.current.splice(0).forEach((resume) => resume());
    }
  }

  function toggleImportPause(): void {
    const nextPaused = !pausedRef.current;
    pausedRef.current = nextPaused;
    setIsPaused(nextPaused);
    if (!nextPaused) {
      resumeWaitersRef.current.splice(0).forEach((resume) => resume());
    }
  }

function cancelImport(): void {
  importControllerRef.current?.abort();
  pausedRef.current = false;
  setIsPaused(false);
  setIsImporting(false);
  resumeWaitersRef.current.splice(0).forEach((resume) => resume());
}

  async function retryImport(index: number): Promise<void> {
    const source = latestSourcesRef.current[index - 1];
    if (source) await importSources([source]);
  }

  async function importFiles(files: FileList | File[]): Promise<void> {
    await importSources(toArchiveSources(files));
  }

  async function scanLinkedFolder(
    directory?: FileSystemDirectoryHandle,
    requestPermission = true,
  ): Promise<void> {
    try {
      const handle = (directory ?? (await getLinkedFolder())?.handle) as
        | DirectoryPermissionHandle
        | undefined;
      if (!handle) {
        setFolderMessage("Link a folder before rescanning.");
        return;
      }

      let permission = await handle.queryPermission({ mode: "read" });
      if (permission !== "granted" && requestPermission) {
        permission = await handle.requestPermission({ mode: "read" });
      }
      if (permission !== "granted") {
        setFolderMessage("Rescan the linked folder to grant read access.");
        return;
      }

      const sources = await collectLinkedFolderSources(handle);
      if (sources.length === 0) {
        setFolderMessage(`No supported files found in ${handle.name}.`);
        return;
      }
      setFolderMessage(`Scanning ${sources.length} files from ${handle.name}.`);
      await importSources(sources);
      setFolderMessage(`Finished scanning ${handle.name}.`);
    } catch (error) {
      setFolderMessage(
        error instanceof Error ? error.message : "Could not scan this folder.",
      );
    }
  }

  useEffect(() => {
    scanLinkedFolderRef.current = scanLinkedFolder;
  });

  useEffect(() => {
    try {
      localStorage.removeItem("kage-reader:opds-catalogs");
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    directoryInputRef.current?.setAttribute("webkitdirectory", "");
    directoryInputRef.current?.setAttribute("directory", "");
    void getLinkedFolder().then((linkedFolder) => {
      if (!linkedFolder) return;
      setLinkedFolderName(linkedFolder.handle.name);
      void scanLinkedFolderRef.current(linkedFolder.handle, false);
    });
  }, []);

  async function linkLocalFolder(): Promise<void> {
    const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
    if (!picker) {
      setFolderMessage(
        "Persistent folder linking is unavailable in this browser.",
      );
      return;
    }

    try {
      const handle = await picker.call(window, { mode: "read" });
      await putLinkedFolder(handle);
      setLinkedFolderName(handle.name);
      await scanLinkedFolder(handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFolderMessage(
        error instanceof Error ? error.message : "Could not link this folder.",
      );
    }
  }

  async function unlinkLocalFolder(): Promise<void> {
    await deleteLinkedFolder();
    setLinkedFolderName("");
    setFolderMessage("Folder unlinked.");
  }

  const completedCount = statusItems.filter(
    (item) => item.state === "saved",
  ).length;
  const failedCount = statusItems.filter(
    (item) => item.state === "error",
  ).length;
  const cancelledCount = statusItems.filter(
    (item) => item.state === "cancelled",
  ).length;
  const importFileCount = statusItems[0]?.total ?? expectedImportFileCount;
  const processedFileCount = completedCount + failedCount + cancelledCount;
  const importProgressPercent = importFileCount
    ? Math.min(
        100,
        Math.round(
          statusItems.reduce(
            (total, item) =>
              total + (item.state === "working" ? (item.progress ?? 0) : 100),
            0,
          ) / importFileCount,
        ),
      )
    : 0;
  const currentImportItem = statusItems.find(
    (item) => item.state === "working",
  );
  const elapsedImportSeconds = importStartedAt
    ? (Date.now() - importStartedAt) / 1000
    : 0;
  const remainingImportSeconds =
    importProgressPercent > 0 && importProgressPercent < 100
      ? Math.ceil(
          (elapsedImportSeconds * (100 - importProgressPercent)) /
            importProgressPercent,
        )
      : null;
  const remainingImportLabel =
    remainingImportSeconds === null
      ? "Estimating time remaining"
      : remainingImportSeconds < 60
        ? `About ${remainingImportSeconds}s remaining`
        : `About ${Math.floor(remainingImportSeconds / 60)}m ${remainingImportSeconds % 60}s remaining`;

  return (
    <main className="importPage">
      <header className="importHeader">
        <div>
          <p className="importKicker">YOUR COLLECTION / ADD TITLES</p>
          <h1>Import</h1>
          <p className="importSubtitle">
            Add comics and novels to your local shelf.
          </p>
        </div>
        <Link to="/?view=all" className="importLibraryLink" aria-label="Open library">
          <span>Back to library</span>
          <ArrowRight size={16} />
        </Link>
      </header>

      {isImporting
        ? createPortal(
            <OverlayShell
              labelledBy="import-progress-title"
              describedBy="import-progress-status"
              initialFocus="none"
              className="importProgressBackdrop"
              contentClassName="importProgressModal"
            >
                <header className="importProgressModalHeader">
                  <div>
                    <p className="importKicker">LOCAL IMPORT</p>
                    <h2 id="import-progress-title">
                      {isPaused ? "Import paused" : "Adding to your library"}
                    </h2>
                  </div>
                  <strong>{importProgressPercent}%</strong>
                </header>
                <div
                  className="importProgressTrack"
                  role="progressbar"
                  aria-label="Overall import progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={importProgressPercent}
                >
                  <span style={{ width: `${importProgressPercent}%` }} />
                </div>
                <p className="importProgressFilename">
                  {currentImportItem?.fileName ?? "Preparing files…"}
                </p>
                <p
                  id="import-progress-status"
                  className="importProgressMessage"
                >
                  {currentImportItem?.message ?? "Preparing the import queue…"}
                </p>
                <div className="importProgressMeta">
                  <span>
                    {processedFileCount} of {importFileCount} files processed
                  </span>
                  <span>{remainingImportLabel}</span>
                </div>
                <div
                  className="importProgressItems"
                  role="list"
                  aria-label="Files in this import"
                >
                  {statusItems.length > 0 ? (
                    statusItems.map((item) => (
                      <div
                        key={item.key}
                        className="importProgressItem"
                        role="listitem"
                      >
                        <span
                          className="importProgressItemName"
                          title={item.fileName}
                        >
                          {item.fileName}
                        </span>
                        <span
                          className="importProgressItemState"
                          data-state={item.state}
                        >
                          {item.state}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="importProgressMessage">
                      Preparing the file list…
                    </p>
                  )}
                </div>
                <footer className="importProgressActions">
                  <button
                    type="button"
                    className="importSecondaryButton"
                    onClick={toggleImportPause}
                  >
                    {isPaused ? "Resume" : "Pause after current file"}
                  </button>
                  <button
                    type="button"
                    className="importSecondaryButton"
                    onClick={cancelImport}
                  >
                    Cancel remaining files
                  </button>
                </footer>
            </OverlayShell>,
            document.body,
          )
        : null}

      <input
        ref={fileInputRef}
        aria-label="Choose comic or novel files"
        accept=".cbz,.cbr,.zip,.rar,.7z,.cb7,.cbt,.tar,.tgz,.gz,.bz2,.xz,.epub,.txt,.html,.htm,.xhtml,.md,.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,.tif,.tiff,.jfif,.jpe,.svg,image/*"
        multiple
        onChange={(event) => {
          const files = event.currentTarget.files;
          if (files) void importFiles(files);
          event.currentTarget.value = "";
        }}
        className="importFileInput"
        type="file"
      />
      <input
        ref={directoryInputRef}
        aria-label="Choose a folder of images"
        multiple
        onChange={(event) => {
          const files = event.currentTarget.files;
          if (files) void importFiles(files);
          event.currentTarget.value = "";
        }}
        className="importFileInput"
        type="file"
      />

      <section
        className={`importDropZone${isDragging ? " importDropZoneActive" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!isImporting) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void importFiles(event.dataTransfer.files);
        }}
        aria-label="Drop archives or images to import"
      >
        <span className="importDropMark" aria-hidden="true">
          <Upload size={22} />
        </span>
        <h2>{isImporting ? "Adding to your shelf" : "Drop files to import"}</h2>
        <p>CBZ, ZIP, CBR, 7z, EPUB, text, and image files</p>
        <div className="importActions">
          <button
            type="button"
            className="importPrimaryButton"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp size={16} />
            Choose files
          </button>
          <button
            type="button"
            className="importSecondaryButton"
            disabled={isImporting}
            onClick={() => directoryInputRef.current?.click()}
          >
            <FolderOpen size={16} />
            Choose image folder
          </button>
          {supportsDirectoryLinking ? (
            <>
              <button
                type="button"
                className="importSecondaryButton"
                disabled={isImporting}
                onClick={() => void linkLocalFolder()}
              >
                <FolderOpen size={16} />
                {linkedFolderName
                  ? "Change linked folder"
                  : "Link local folder"}
              </button>
              {linkedFolderName ? (
                <>
                  <button
                    type="button"
                    className="importSecondaryButton"
                    disabled={isImporting}
                    onClick={() => void scanLinkedFolder()}
                  >
                    <RefreshCw size={16} />
                    Rescan linked folder
                  </button>
                  <button
                    type="button"
                    className="importSecondaryButton"
                    disabled={isImporting}
                    onClick={() => void unlinkLocalFolder()}
                  >
                    <Unlink size={16} />
                    Unlink folder
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
        <span className="importPrivacyNote">
          <Check size={13} /> Files stay on this device
        </span>
        {folderMessage ? (
          <p className="importPrivacyNote" role="status">
            {folderMessage}
          </p>
        ) : null}
      </section>

      {isImporting && statusItems.length === 0 ? (
        <LoadingSkeleton label="Preparing import results" lines={4} className="importResultsSkeleton" />
      ) : null}
      {statusItems.length > 0 ? (
      <section
        className="importQueue"
        aria-live="polite"
          aria-label="Import progress"
        >
          <header className="importQueueHeader">
            <div>
              <h2>
                {isImporting
                  ? isPaused
                    ? "Import paused"
                    : "Importing files"
                  : "Import complete"}
              </h2>
              <p>
                {completedCount} saved
                {failedCount > 0 ? ` · ${failedCount} failed` : ""}
                {cancelledCount > 0 ? ` · ${cancelledCount} cancelled` : ""}
                {isImporting ? ` · ${statusItems[0]?.total ?? 0} selected` : ""}
              </p>
            </div>
            {isImporting ? (
              <div className="importActions">
                <button
                  type="button"
                  className="importSecondaryButton"
                  onClick={toggleImportPause}
                >
                  {isPaused ? "Resume" : "Pause after current file"}
                </button>
                <button
                  type="button"
                  className="importSecondaryButton"
                  onClick={cancelImport}
                >
                  Cancel remaining files
                </button>
              </div>
            ) : null}
            {!isImporting && completedCount > 0 ? (
              <Link to="/?view=all" className="importQueueLink">
                Open library <ArrowRight size={15} />
              </Link>
            ) : null}
          </header>
          <div className="importQueueItems">
            {statusItems.map((item) => (
              <article className="importQueueItem" key={item.key}>
                <StatusBadge
  status={({ working: "importing", saved: "cached", error: "failed", cancelled: "cancelled" } as Record<ImportProgressEvent["state"], StatusBadgeKind>)[item.state]}
  className="importQueueStatusBadge"
/>
                <strong title={item.fileName}>{item.fileName}</strong>
                <span className="importQueueState">
                  {item.pageCount ? `${item.pageCount} pages` : item.state}
                </span>
                {item.message ? <p>{item.message}</p> : null}
                {item.state === "error" && !isImporting ? (
                  <button
                    type="button"
                    className="importSecondaryButton"
                    onClick={() => void retryImport(item.index)}
                  >
                    Retry
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
