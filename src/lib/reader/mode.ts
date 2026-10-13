import type { ReaderMode } from "../storage/types";

const READER_MODES: ReaderMode[] = ["flip", "webtoon", "novel"];

export function resolveReaderMode(mode?: ReaderMode): ReaderMode {
  if (!mode || !READER_MODES.includes(mode)) {
    return "flip";
  }

  return mode;
}
