import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LibraryPage } from "./components/library/LibraryPage";
import { ReaderPage } from "./components/reader/ReaderPage";
import { SeriesPage } from "./components/series/SeriesPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/series/:id" element={<SeriesPage />} />
        <Route path="/read/:chapterId" element={<ReaderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
