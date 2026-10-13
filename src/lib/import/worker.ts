/// <reference lib="webworker" />

import { extractArchiveBundle } from "./archive";
import type { ArchiveSource } from "./types";

export {};

type ImportWorkerRequest = {
  id: string;
  source: ArchiveSource;
};

self.onmessage = async (event: MessageEvent<ImportWorkerRequest>) => {
  const { id, source } = event.data;

  try {
    const bundle = await extractArchiveBundle(source, 0, (message) => {
      self.postMessage({ id, kind: "progress", message });
    });
    self.postMessage({ id, kind: "result", bundle });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id, kind: "error", message });
  }
};
