import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LibraryPage } from "./components/library/LibraryPage";
import { ReaderPage } from "./components/reader/ReaderPage";
import { SettingsPage } from "./components/settings/SettingsPage";
import { SeriesPage } from "./components/series/SeriesPage";
import { getPreferences } from "./lib/preferences/preferences";

export function App() {
  useEffect(() => {
    document.body.style.filter = getPreferences().highContrast
      ? "contrast(1.18)"
      : "";
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/series/:id" element={<SeriesPage />} />
        <Route path="/read/:chapterId" element={<ReaderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
