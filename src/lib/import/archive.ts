import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import { naturalSort } from "./naturalSort";
import { extractWithLibarchive } from "./libarchive";
import type { ArchiveEntry, ArchiveSource } from "./types";

export type ArchiveProgress = (message: string) => void;

const SUPPORTED_IMAGE_EXTENSIONS = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"],
  [".jpe", "image/jpeg"],
  [".jfif", "image/jpeg"],
  [".svg", "image/svg+xml"],
]);

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".html",
  ".htm",
  ".xhtml",
  ".xml",
  ".md",
]);

function normalizeEntryName(name: string): string {
  return name.replaceAll("\\", "/");
}

function getBaseName(name: string): string {
  const normalized = normalizeEntryName(name);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function getExtension(name: string): string {
  const baseName = getBaseName(name);
  const dotIndex = baseName.lastIndexOf(".");
  return dotIndex >= 0 ? baseName.slice(dotIndex).toLowerCase() : "";
}

function isArchiveContainer(name: string): boolean {
  return /\.(?:cbz|zip|epub|cbr|rar|7z|cb7|cbt|tar|tgz|gz|bz2|xz)$/i.test(name);
}

function isZipContainer(name: string): boolean {
  return /\.(?:cbz|zip|epub)$/i.test(name);
}

function withoutExtension(name: string): string {
  return name.replace(/\.[^./]+$/u, "");
}

function joinEntryPath(parent: string, child: string): string {
  return [parent, child].filter(Boolean).join("/").replaceAll("\\", "/");
}

function formatByteCount(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createProgressReporter(
  sourceName: string,
  onProgress?: ArchiveProgress,
): (message: string, force?: boolean) => void {
  let lastReportedAt = 0;
  return (message, force = false) => {
    const now = Date.now();
    if (!onProgress || (!force && now - lastReportedAt < 400)) return;
    lastReportedAt = now;
    onProgress(`${sourceName}: ${message}`);
  };
}

export function shouldSkipArchiveEntry(name: string): boolean {
  const normalized = normalizeEntryName(name).trim();
  if (!normalized || normalized.endsWith("/")) {
    return true;
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part.toLowerCase() === "__macosx")) {
    return true;
  }

  const baseName = getBaseName(normalized).toLowerCase();
  const lowerPath = normalized.toLowerCase();
  return (
    baseName === "thumbs.db" ||
    baseName === ".ds_store" ||
    lowerPath === "meta-inf/container.xml" ||
    baseName === "nav.xhtml" ||
    baseName.endsWith(".ncx")
  );
}

export function isSupportedArchiveEntry(name: string): boolean {
  if (shouldSkipArchiveEntry(name)) {
    return false;
  }

  const extension = getExtension(name);
  return (
    SUPPORTED_IMAGE_EXTENSIONS.has(extension) || TEXT_EXTENSIONS.has(extension)
  );
}

export function mimeTypeForArchiveEntry(name: string): string {
  const extension = getExtension(name);
  if (extension === ".txt") {
    return "text/plain;charset=utf-8";
  }
  if (extension === ".html" || extension === ".htm") {
    return "text/html;charset=utf-8";
  }
  if (extension === ".xhtml") {
    return "application/xhtml+xml;charset=utf-8";
  }
  if (extension === ".xml") {
    return "application/xml;charset=utf-8";
  }
  if (extension === ".md") {
    return "text/markdown;charset=utf-8";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }

  return (
    SUPPORTED_IMAGE_EXTENSIONS.get(extension) ?? "application/octet-stream"
  );
}

export function sortArchiveEntries(entries: ArchiveEntry[]): ArchiveEntry[] {
  return [...entries].sort((left, right) => naturalSort(left.name, right.name));
}

export type ArchiveBundle = {
  entries: ArchiveEntry[];
  comicInfoXml?: string;
};

function readArchiveEntry(
  file: UnzipFile,
  reportProgress?: (message: string, force?: boolean) => void,
): Promise<ArchiveEntry> {
  const chunks: Uint8Array[] = [];
  const mime = mimeTypeForArchiveEntry(file.name);
  let bytesRead = 0;

  return new Promise<ArchiveEntry>((resolve, reject) => {
    file.ondata = (error, chunk, final) => {
      if (error) {
        reject(error);
        return;
      }

      if (chunk.length > 0) {
        chunks.push(chunk);
        bytesRead += chunk.length;
        reportProgress?.(
          `Extracting ${getBaseName(file.name)} (${formatByteCount(bytesRead)})…`,
          final,
        );
      }

      if (final) {
        resolve({
          name: normalizeEntryName(file.name),
          mime,
          blob: new Blob(chunks, { type: mime }),
        });
      }
    };

    try {
      file.start();
    } catch (error) {
      reject(error);
    }
  });
}

function isMetadataEntry(name: string): boolean {
  const fileName = name.replaceAll("\\", "/").split("/").pop()?.toLowerCase();
  return fileName === "comicinfo.xml" || fileName === "package.opf";
}

function readArchiveTextEntry(file: UnzipFile): Promise<string> {
  const chunks: Uint8Array[] = [];

  return new Promise<string>((resolve, reject) => {
    file.ondata = (error, chunk, final) => {
      if (error) {
        reject(error);
        return;
      }

      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      if (final) {
        new Blob(chunks)
          .arrayBuffer()
          .then((buffer) => resolve(new TextDecoder().decode(buffer)))
          .catch(reject);
      }
    };

    try {
      file.start();
    } catch (error) {
      reject(error);
    }
  });
}

export async function extractArchiveBundle(
  source: ArchiveSource,
  depth = 0,
  onProgress?: ArchiveProgress,
): Promise<ArchiveBundle> {
  if (depth > 4) {
    throw new Error(`Nested archives are too deep in "${source.name}".`);
  }

  if (TEXT_EXTENSIONS.has(getExtension(source.name))) {
    onProgress?.(`${source.name}: Reading text document…`);
    return {
      entries: [
        {
          name: getBaseName(source.name),
          mime: mimeTypeForArchiveEntry(source.name),
          blob: source.blob,
        },
      ],
    };
  }

  const useCompatibilityExtractor =
    !isZipContainer(source.name) ||
    (depth > 0 && typeof Worker !== "undefined" && typeof File !== "undefined");
  if (useCompatibilityExtractor) {
    if (depth > 0) {
      onProgress?.(`${source.name}: Opening chapter archive…`);
    }
    const files = await extractWithLibarchive(source, onProgress);
    return processExtractedFiles(files, source.name, depth, onProgress);
  }

  const supportedEntries: Promise<ArchiveEntry>[] = [];
  const nestedEntries: Promise<ArchiveEntry>[] = [];
  const metadataEntries: Promise<void>[] = [];
  const ignoredNames: string[] = [];
  const reportProgress = createProgressReporter(source.name, onProgress);
  let discoveredEntries = 0;
  let comicInfoXml: string | undefined;
  const unzipper = new Unzip((file) => {
    discoveredEntries += 1;
    if (discoveredEntries === 1 || discoveredEntries % 10 === 0) {
      reportProgress(
        `Scanning archive entries (${discoveredEntries} found)…`,
        true,
      );
    }
    if (isMetadataEntry(file.name)) {
      metadataEntries.push(
        readArchiveTextEntry(file).then((text) => {
          comicInfoXml = text;
        }),
      );
      return;
    }

    if (!isSupportedArchiveEntry(file.name)) {
      if (isArchiveContainer(file.name)) {
        nestedEntries.push(readArchiveEntry(file, reportProgress));
      } else if (!shouldSkipArchiveEntry(file.name)) {
        ignoredNames.push(file.name);
      }
      return;
    }

    supportedEntries.push(readArchiveEntry(file, reportProgress));
  });

  unzipper.register(UnzipInflate);

  const reader = source.blob.stream().getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        unzipper.push(value, done);
      }

      if (done) {
        break;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const files = await extractWithLibarchive(source, onProgress);
      return processExtractedFiles(files, source.name, depth, onProgress);
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error
          ? fallbackError.message
          : String(fallbackError);
      throw new Error(
        `Could not read "${source.name}" as a ZIP/CBZ/EPUB archive. It may be damaged, mislabeled, or use an unsupported compression method. ${message} ${fallbackMessage}`,
      );
    }
  } finally {
    reader.releaseLock();
  }

  await Promise.all(metadataEntries);
  const directEntries = await Promise.all(supportedEntries);
  const nestedFiles = await Promise.all(nestedEntries);
  const nestedBundles: ArchiveBundle[] = [];
  for (const [index, entry] of nestedFiles.entries()) {
    reportProgress(
      `Opening nested archive ${index + 1} of ${nestedFiles.length}: ${getBaseName(entry.name)}…`,
      true,
    );
    let nested: ArchiveBundle;
    try {
      nested = await extractArchiveBundle(
        { name: entry.name, blob: entry.blob },
        depth + 1,
        onProgress,
      );
    } catch (error) {
      if (depth !== 0) throw error;

      const firstError = error instanceof Error ? error.message : String(error);
      reportProgress(
        "Retrying collection with the compatibility extractor…",
        true,
      );
      try {
        const files = await extractWithLibarchive(source, onProgress);
        return await processExtractedFiles(
          files,
          source.name,
          depth,
          onProgress,
        );
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);
        throw new Error(
          `Could not extract nested archive "${entry.name}". ZIP extraction failed: ${firstError} Compatibility extraction failed: ${fallbackMessage}`,
        );
      }
    }
    const prefix = withoutExtension(entry.name);
    nestedBundles.push({
      entries: nested.entries.map((page) => ({
        ...page,
        name: joinEntryPath(prefix, page.name),
      })),
      comicInfoXml: nested.comicInfoXml,
    });
  }
  const entries = sortArchiveEntries([
    ...directEntries,
    ...nestedBundles.flatMap((bundle) => bundle.entries),
  ]);
  comicInfoXml ??=
    nestedBundles.length === 1 ? nestedBundles[0]?.comicInfoXml : undefined;
  if (entries.length === 0) {
    const found = ignoredNames.slice(0, 6).join(", ");
    throw new Error(
      `No readable pages found in "${source.name}".${found ? ` Entries found: ${found}.` : " The archive appears to be empty."} Supported pages: JPG, PNG, WebP, AVIF, GIF, BMP, TIFF, SVG, and EPUB text. Nested CBR/RAR/7z archives are supported; password-protected or split-volume RAR files are not.`,
    );
  }

  reportProgress(`Extracted ${entries.length} readable files.`, true);

  return { entries, comicInfoXml };
}

async function processExtractedFiles(
  files: Array<{ name: string; blob: Blob }>,
  sourceName: string,
  depth: number,
  onProgress?: ArchiveProgress,
): Promise<ArchiveBundle> {
  const entries: ArchiveEntry[] = [];
  const nestedBundles: ArchiveBundle[] = [];
  let comicInfoXml: string | undefined;
  const ignoredNames: string[] = [];

  for (const [fileIndex, file] of files.entries()) {
    if (fileIndex === 0 || (fileIndex + 1) % 10 === 0) {
      onProgress?.(
        `${sourceName}: Reading extracted file ${fileIndex + 1}/${files.length}…`,
      );
    }
    if (isMetadataEntry(file.name)) {
      if (file.name.toLowerCase().endsWith("comicinfo.xml")) {
        comicInfoXml ??= await file.blob.text();
      }
      continue;
    }
    if (isSupportedArchiveEntry(file.name)) {
      const mime = mimeTypeForArchiveEntry(file.name);
      entries.push({
        name: file.name.replaceAll("\\", "/"),
        mime,
        blob: new Blob([file.blob], { type: mime }),
      });
      continue;
    }
    if (isArchiveContainer(file.name)) {
      try {
        nestedBundles.push(
          await extractArchiveBundle(
            { name: file.name, blob: file.blob },
            depth + 1,
            onProgress,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Nested archive "${file.name}" failed: ${message}`);
      }
      continue;
    }
    if (!shouldSkipArchiveEntry(file.name)) ignoredNames.push(file.name);
  }

  for (const [index, bundle] of nestedBundles.entries()) {
    const nestedFile = files.filter((file) => isArchiveContainer(file.name))[
      index
    ];
    const prefix = nestedFile ? withoutExtension(nestedFile.name) : "";
    entries.push(
      ...bundle.entries.map((entry) => ({
        ...entry,
        name: joinEntryPath(prefix, entry.name),
      })),
    );
    if (nestedBundles.length === 1) comicInfoXml ??= bundle.comicInfoXml;
  }

  if (entries.length === 0) {
    const found = ignoredNames.slice(0, 6).join(", ");
    throw new Error(
      `No readable pages found in "${sourceName}".${found ? ` Entries found: ${found}.` : " The archive appears to be empty."} Supported pages: JPG, PNG, WebP, AVIF, GIF, BMP, TIFF, SVG, and EPUB text.`,
    );
  }

  onProgress?.(`${sourceName}: Extracted ${entries.length} readable files.`);
  return { entries: sortArchiveEntries(entries), comicInfoXml };
}

export async function extractArchiveEntries(
  source: ArchiveSource,
): Promise<ArchiveEntry[]> {
  return (await extractArchiveBundle(source)).entries;
}
