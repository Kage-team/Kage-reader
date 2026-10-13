import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LibraryPage } from "./components/library/LibraryPage";
import { ReaderPage } from "./components/reader/ReaderPage";
import { SettingsPage } from "./components/settings/SettingsPage";
import { SeriesPage } from "./components/series/SeriesPage";
import { getPreferences } from "./lib/preferences/preferences";
import type { PwaInstallPrompt } from "./lib/pwa/install";

export function App() {
  const [installPrompt, setInstallPrompt] = useState<PwaInstallPrompt | null>(
    null,
  );
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    document.body.style.filter = getPreferences().highContrast
      ? "contrast(1.18)"
      : "";
    setIsInstalled(window.matchMedia("(display-mode: standalone)").matches);

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as PwaInstallPrompt);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route
          path="/settings"
          element={
            <SettingsPage
              installPrompt={installPrompt}
              isInstalled={isInstalled}
              onInstallPromptConsumed={() => setInstallPrompt(null)}
            />
          }
        />
        <Route path="/series/:id" element={<SeriesPage />} />
        <Route path="/read/:chapterId" element={<ReaderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
