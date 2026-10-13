/// <reference lib="webworker" />

import { extractArchiveEntries } from "./archive";
import type { ArchiveSource } from "./types";

export {};

type ImportWorkerRequest = {
  id: string;
  source: ArchiveSource;
};

self.onmessage = async (event: MessageEvent<ImportWorkerRequest>) => {
  const { id, source } = event.data;

  try {
    const entries = await extractArchiveEntries(source);
    self.postMessage({ id, kind: "result", entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id, kind: "error", message });
  }
};
