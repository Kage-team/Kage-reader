import type { ReaderMode } from "../storage/types";

const READER_MODES: ReaderMode[] = ["flip", "webtoon", "novel"];

export function resolveReaderMode(
  mode?: ReaderMode,
  fallback: ReaderMode = "flip",
): ReaderMode {
  if (!mode || !READER_MODES.includes(mode)) {
    return READER_MODES.includes(fallback) ? fallback : "flip";
  }

  return mode;
}
