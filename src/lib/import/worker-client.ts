import { extractArchiveEntries } from "./archive";
import type { ArchiveSource, ArchiveEntry } from "./types";

export async function extractArchiveEntriesInWorker(
  source: ArchiveSource,
): Promise<ArchiveEntry[]> {
  if (typeof Worker === "undefined") {
    return extractArchiveEntries(source);
  }

  return new Promise<ArchiveEntry[]>((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });

    const requestId = crypto.randomUUID();

    worker.onmessage = (event: MessageEvent) => {
      const payload = event.data as
        | { id: string; kind: "result"; entries: ArchiveEntry[] }
        | { id: string; kind: "error"; message: string };

      if (payload.id !== requestId) {
        return;
      }

      worker.terminate();

      if (payload.kind === "error") {
        reject(new Error(payload.message));
        return;
      }

      resolve(payload.entries);
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
