import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppFrame } from "./components/layout/AppFrame";
import { RouteErrorBoundary } from "./components/layout/RouteErrorBoundary";
import { LibraryPage } from "./components/library/LibraryPage";
const ImportPage = lazy(() => import("./components/import/ImportPage").then((module) => ({ default: module.ImportPage })));
const ReaderPage = lazy(() => import("./components/reader/ReaderPage").then((module) => ({ default: module.ReaderPage })));
const SettingsPage = lazy(() => import("./components/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const SeriesPage = lazy(() => import("./components/series/SeriesPage").then((module) => ({ default: module.SeriesPage })));
import { AdultContentGate } from "./components/security/AdultContentGate";
import {
  applyPreferencesToDocument,
  getPreferences,
} from "./lib/preferences/preferences";
import type { PwaInstallPrompt } from "./lib/pwa/install";
import { applyStealthMode } from "./lib/security/stealth";

function RootPage() {
  return <LibraryPage />;
}

function RouteLoadingFallback() {
  return (
    <div className="routeLoadingFallback" role="status" aria-live="polite">
      <div className="routeLoadingSkeleton routeLoadingSkeleton--wide" />
      <div className="routeLoadingSkeleton" />
      <div className="routeLoadingSkeleton routeLoadingSkeleton--short" />
      <span>Loading Kage Reader...</span>
    </div>
  );
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
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
        <Route
          path="/"
          element={
            <AppFrame>
<RootPage />
            </AppFrame>
          }
        />
        <Route
          path="/import"
          element={
            <RouteErrorBoundary routeName="Import">
              <AppFrame>
                <ImportPage />
              </AppFrame>
            </RouteErrorBoundary>
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
            <RouteErrorBoundary routeName="Series">
              <AdultContentGate>
                <AppFrame>
                  <SeriesPage />
                </AppFrame>
              </AdultContentGate>
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/read/:chapterId"
          element={
            <RouteErrorBoundary routeName="Reader">
              <AdultContentGate>
                <ReaderPage />
              </AdultContentGate>
            </RouteErrorBoundary>
          }
        />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
