import { AsyncUnzipInflate, Unzip, type UnzipFile } from "fflate";
import { naturalSort } from "./naturalSort";
import type { ArchiveEntry, ArchiveSource } from "./types";

const SUPPORTED_IMAGE_EXTENSIONS = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".gif", "image/gif"],
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
  return baseName === "thumbs.db" || baseName === ".ds_store";
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

function readArchiveEntry(file: UnzipFile): Promise<ArchiveEntry> {
  const chunks: Uint8Array[] = [];
  const mime = mimeTypeForArchiveEntry(file.name);

  return new Promise<ArchiveEntry>((resolve, reject) => {
    file.ondata = (error, chunk, final) => {
      if (error) {
        reject(error);
        return;
      }

      if (chunk.length > 0) {
        chunks.push(chunk);
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
): Promise<ArchiveBundle> {
  const supportedEntries: Promise<ArchiveEntry>[] = [];
  const metadataEntries: Promise<void>[] = [];
  let comicInfoXml: string | undefined;
  const unzipper = new Unzip((file) => {
    if (isMetadataEntry(file.name)) {
      metadataEntries.push(
        readArchiveTextEntry(file).then((text) => {
          comicInfoXml = text;
        }),
      );
      return;
    }

    if (!isSupportedArchiveEntry(file.name)) {
      return;
    }

    supportedEntries.push(readArchiveEntry(file));
  });

  unzipper.register(AsyncUnzipInflate);

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
    throw new Error(`Failed to read ${source.name}: ${message}`);
  } finally {
    reader.releaseLock();
  }

  await Promise.all(metadataEntries);
  const entries = sortArchiveEntries(await Promise.all(supportedEntries));
  if (entries.length === 0) {
    throw new Error(
      `No supported image or text entries found in ${source.name}`,
    );
  }

  return { entries, comicInfoXml };
}

export async function extractArchiveEntries(
  source: ArchiveSource,
): Promise<ArchiveEntry[]> {
  return (await extractArchiveBundle(source)).entries;
}
