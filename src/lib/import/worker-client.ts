import { extractArchiveBundle, type ArchiveProgress } from "./archive";
import type { ArchiveSource, ArchiveEntry } from "./types";

export type ArchiveBundlePayload = {
  entries: ArchiveEntry[];
  comicInfoXml?: string;
  coverImageName?: string;
};

export async function extractArchiveBundleInWorker(
  source: ArchiveSource,
  onProgress?: ArchiveProgress,
): Promise<ArchiveBundlePayload> {
  if (typeof Worker === "undefined") {
    return extractArchiveBundle(source, 0, onProgress);
  }

  return new Promise<ArchiveBundlePayload>((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });

    const requestId = crypto.randomUUID();

    worker.onmessage = (event: MessageEvent) => {
      const payload = event.data as
        | {
            id: string;
            kind: "result";
            bundle: ArchiveBundlePayload;
          }
        | { id: string; kind: "progress"; message: string }
        | { id: string; kind: "error"; message: string };

      if (payload.id !== requestId) {
        return;
      }

      if (payload.kind === "progress") {
        onProgress?.(payload.message);
        return;
      }

      worker.terminate();

      if (payload.kind === "error") {
        reject(new Error(payload.message));
        return;
      }

      resolve(payload.bundle);
    };

    worker.onerror = () => {
      worker.terminate();
      reject(new Error(`Worker failed while reading ${source.name}`));
    };

    worker.postMessage({
      id: requestId,
      source,
    });
  });
}
