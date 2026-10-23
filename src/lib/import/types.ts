export type ArchiveSource = {
  name: string;
  blob: Blob;
  rootFolderName?: string;
};

export type ArchiveEntry = {
  name: string;
  mime: string;
  blob: Blob;
};

export type ImportProgressEvent = {
  fileName: string;
  index: number;
  total: number;
  state: "working" | "saved" | "error" | "cancelled";
  message?: string;
  progress?: number;
  pageCount?: number;
};

export type ImportControl = {
  signal?: AbortSignal;
  waitUntilResumed?: () => Promise<void>;
};

export type ImportedChapterSummary = {
  id: string;
  title: string;
  pageCount: number;
  sourceName: string;
};

export type ImportRunResult = {
  imported: ImportedChapterSummary[];
  errors: string[];
};
