import { Archive } from "libarchive.js";
import type { ArchiveSource } from "./types";

type ExtractedFileLike = Blob & {
  name?: string;
  fileName?: string;
};

export type ExtractedArchiveFile = {
  name: string;
  blob: Blob;
};

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}

function isExtractedFile(value: unknown): value is ExtractedFileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).size === "number"
  );
}

function joinPath(parent: string, child: string): string {
  return normalizePath([parent, child].filter(Boolean).join("/"));
}

export async function extractWithLibarchive(
  source: ArchiveSource,
  onProgress?: (message: string) => void,
): Promise<ExtractedArchiveFile[]> {
  if (typeof Worker === "undefined" || typeof File === "undefined") {
    throw new Error(
      "This archive format requires a browser with Web Worker support.",
    );
  }

  Archive.init({
    workerUrl: `${import.meta.env.BASE_URL}libarchive/worker-bundle.js`,
  });

  let archive: Awaited<ReturnType<typeof Archive.open>> | undefined;
  try {
    archive = await Archive.open(new File([source.blob], source.name));
    if (await archive.hasEncryptedData()) {
      throw new Error(
        `"${source.name}" is password-protected. Encrypted archives are not supported yet.`,
      );
    }

    const tree = await archive.extractFiles(
      (entry: {
        file?: { name?: string; fileName?: string };
        path?: string;
      }) => {
        const name =
          entry.file?.fileName ?? entry.file?.name ?? entry.path ?? "file";
        onProgress?.(`${source.name}: Extracting ${name}…`);
      },
    );
    const extracted: ExtractedArchiveFile[] = [];

    const collect = (value: unknown, path: string): void => {
      if (isExtractedFile(value)) {
        const file = value as ExtractedFileLike;
        const name = normalizePath(file.fileName || file.name || path);
        if (name) extracted.push({ name, blob: file });
        return;
      }

      if (!value || typeof value !== "object") return;
      for (const [name, child] of Object.entries(value)) {
        collect(child, joinPath(path, name));
      }
    };

    collect(tree, "");
    return extracted;
  } catch (error) {
    if (error instanceof Error && /password|encrypted/i.test(error.message)) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not extract "${source.name}". The archive may be damaged, use an unsupported compression method, or be a split-volume RAR. ${detail}`,
    );
  } finally {
    await archive?.close().catch(() => undefined);
  }
}
