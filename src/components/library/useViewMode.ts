import { useEffect, useState } from "react";

export type ViewMode = "grid" | "list";

export function useViewMode(storageKey: string): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>("grid");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "grid" || stored === "list") setMode(stored);
    } catch {
      // Storage can be unavailable in private browsing or embedded previews.
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, mode);
    } catch {
      // View mode remains usable when persistence is unavailable.
    }
  }, [mode, storageKey]);

  return [mode, setMode];
}
