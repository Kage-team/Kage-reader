import type { ReaderMode } from "../storage/types";

const PREFERENCES_KEY = "kage-reader:preferences";
const READER_MODES: ReaderMode[] = ["flip", "webtoon", "novel"];

export type Preferences = {
  defaultReaderMode: ReaderMode;
  textScale: number;
  highContrast: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  defaultReaderMode: "flip",
  textScale: 100,
  highContrast: false,
};

function isReaderMode(value: unknown): value is ReaderMode {
  return (
    typeof value === "string" && READER_MODES.includes(value as ReaderMode)
  );
}

function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PREFERENCES };
  }

  const candidate = value as Partial<Preferences>;
  const textScale = Number(candidate.textScale);

  return {
    defaultReaderMode: isReaderMode(candidate.defaultReaderMode)
      ? candidate.defaultReaderMode
      : DEFAULT_PREFERENCES.defaultReaderMode,
    textScale: Number.isFinite(textScale)
      ? Math.min(150, Math.max(80, Math.round(textScale / 5) * 5))
      : DEFAULT_PREFERENCES.textScale,
    highContrast:
      typeof candidate.highContrast === "boolean"
        ? candidate.highContrast
        : DEFAULT_PREFERENCES.highContrast,
  };
}

export function getPreferences(
  storage: Storage | undefined = globalThis.localStorage,
): Preferences {
  if (!storage) {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const storedValue = storage.getItem(PREFERENCES_KEY);
    return storedValue
      ? normalizePreferences(JSON.parse(storedValue) as unknown)
      : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(
  preferences: Preferences,
  storage: Storage | undefined = globalThis.localStorage,
): Preferences {
  const normalized = normalizePreferences(preferences);
  try {
    storage?.setItem(PREFERENCES_KEY, JSON.stringify(normalized));
  } catch {
    return normalized;
  }
  return normalized;
}
