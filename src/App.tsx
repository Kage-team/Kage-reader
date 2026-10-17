import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { AppFrame } from "./components/layout/AppFrame";
import { ImportPage } from "./components/import/ImportPage";
import { LibraryPage } from "./components/library/LibraryPage";
import { ReaderPage } from "./components/reader/ReaderPage";
import { SettingsPage } from "./components/settings/SettingsPage";
import { SeriesPage } from "./components/series/SeriesPage";
import { AdultContentGate } from "./components/security/AdultContentGate";
import { AppFrameB } from "./components/experimental/AppFrameB";
import { ActivityB, HomeB, LibraryB, MoreB } from "./components/experimental/ScreensB";
import {
  applyPreferencesToDocument,
  getPreferences,
} from "./lib/preferences/preferences";
import type { PwaInstallPrompt } from "./lib/pwa/install";
import { applyStealthMode } from "./lib/security/stealth";

function RootRoute() {
  const [searchParams] = useSearchParams();
  const layout = searchParams.get("layout");
  const screen = searchParams.get("screen") ?? "home";

  if (layout === "b") {
    const screenContent = screen === "library" ? <LibraryB /> : screen === "activity" ? <ActivityB /> : screen === "more" ? <MoreB /> : <HomeB />;
    return <AppFrameB>{screenContent}</AppFrameB>;
  }

  return <AppFrame><LibraryPage /></AppFrame>;
}

export function App() {
  const [installPrompt, setInstallPrompt] = useState<PwaInstallPrompt | null>(
    null,
  );
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const preferences = getPreferences();
    applyPreferencesToDocument(preferences);
    applyStealthMode(preferences.stealthMode);
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
        <Route
          path="/"
          element={<RootRoute />}
        />
        <Route
          path="/import"
          element={
            <AppFrame>
              <ImportPage />
            </AppFrame>
          }
        />
        <Route
          path="/settings"
          element={
            <AppFrame>
              <SettingsPage
                installPrompt={installPrompt}
                isInstalled={isInstalled}
                onInstallPromptConsumed={() => setInstallPrompt(null)}
              />
            </AppFrame>
          }
        />
        <Route
          path="/series/:id"
          element={
            <AdultContentGate>
              <AppFrame>
                <SeriesPage />
              </AppFrame>
            </AdultContentGate>
          }
        />
        <Route
          path="/read/:chapterId"
          element={
            <AdultContentGate>
              <ReaderPage />
            </AdultContentGate>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
