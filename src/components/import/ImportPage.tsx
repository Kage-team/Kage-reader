import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, FileUp, FolderOpen, Upload } from "lucide-react";
import { importArchiveSources } from "../../lib/import/importer";
import type { ImportProgressEvent } from "../../lib/import/types";

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
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    directoryInputRef.current?.setAttribute("webkitdirectory", "");
    directoryInputRef.current?.setAttribute("directory", "");
  }, []);

  async function importFiles(files: FileList | File[]): Promise<void> {
    if (isImporting || files.length === 0) return;

    setStatusItems([]);
    setIsImporting(true);
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
      await importArchiveSources(toArchiveSources(files), updateStatus);
    } catch (error) {
      updateStatus({
        fileName: "Import failed",
        index: 1,
        total: 1,
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsImporting(false);
    }
  }

  const completedCount = statusItems.filter(
    (item) => item.state === "saved",
  ).length;
  const failedCount = statusItems.filter(
    (item) => item.state === "error",
  ).length;

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
        <Link to="/" className="importLibraryLink" aria-label="Back to library">
          <span>Back to library</span>
          <ArrowRight size={16} />
        </Link>
      </header>

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
        </div>
        <span className="importPrivacyNote">
          <Check size={13} /> Files stay on this device
        </span>
      </section>

      {statusItems.length > 0 ? (
        <section
          className="importQueue"
          aria-live="polite"
          aria-label="Import progress"
        >
          <header className="importQueueHeader">
            <div>
              <h2>{isImporting ? "Importing files" : "Import complete"}</h2>
              <p>
                {completedCount} saved
                {failedCount > 0 ? ` · ${failedCount} failed` : ""}
                {isImporting ? ` · ${statusItems[0]?.total ?? 0} selected` : ""}
              </p>
            </div>
            {!isImporting && completedCount > 0 ? (
              <Link to="/" className="importQueueLink">
                Open library <ArrowRight size={15} />
              </Link>
            ) : null}
          </header>
          <div className="importQueueItems">
            {statusItems.map((item) => (
              <article className="importQueueItem" key={item.key}>
                <span className="importQueueStatus" data-state={item.state} />
                <strong title={item.fileName}>{item.fileName}</strong>
                <span className="importQueueState">
                  {item.pageCount ? `${item.pageCount} pages` : item.state}
                </span>
                {item.message ? <p>{item.message}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
