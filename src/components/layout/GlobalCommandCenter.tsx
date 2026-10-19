import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Library, Heart, ListPlus, Upload, Settings, BookOpen, X } from "lucide-react";
import { OverlayShell } from "../ui/OverlayShell";
import { listAllChapters, listBookmarks, listSeries } from "../../lib/storage/db";
import type { Bookmark, Chapter, Series } from "../../lib/storage/types";

type Result = { id: string; title: string; detail: string; icon: typeof Library; path: string; group: string };

const commands = [
  { id: "library", title: "Open library", shortcut: "G then L", icon: Library, path: "/?view=all" },
  { id: "queue", title: "Open queue", shortcut: "G then Q", icon: ListPlus, path: "/?view=queue" },
  { id: "favorites", title: "Open favorites", shortcut: "G then F", icon: Heart, path: "/?view=favorites" },
  { id: "import", title: "Import books", shortcut: "", icon: Upload, path: "/import" },
  { id: "settings", title: "Open settings", shortcut: "", icon: Settings, path: "/settings" },
];

export function GlobalCommandCenter() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"search" | "commands" | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [series, setSeries] = useState<Series[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    const openSearch = () => setMode("search");
    const openCommands = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setMode("commands"); }
      if (event.key === "/" && !/input|textarea|select/i.test((event.target as HTMLElement)?.tagName ?? "")) { event.preventDefault(); setMode("search"); }
    };
    window.addEventListener("kage:open-search", openSearch);
    window.addEventListener("keydown", openCommands);
    return () => { window.removeEventListener("kage:open-search", openSearch); window.removeEventListener("keydown", openCommands); };
  }, []);

  useEffect(() => {
    if (!mode) return;
    void Promise.all([listSeries(), listAllChapters(), listBookmarks()]).then(([nextSeries, nextChapters, nextBookmarks]) => {
      setSeries(nextSeries); setChapters(nextChapters); setBookmarks(nextBookmarks);
    });
  }, [mode]);

  useEffect(() => { setMode(null); setQuery(""); }, [location.pathname, location.search]);

  const results = useMemo<Result[]>(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const seriesById = new Map(series.map((item) => [item.id, item]));
    const seriesResults = series.filter((item) => [item.title, item.writer, ...(item.tags ?? []), ...(item.collections ?? [])].some((value) => value?.toLowerCase().includes(needle))).map((item) => ({ id: item.id, title: item.title, detail: item.writer || item.type, icon: Library, path: `/series/${encodeURIComponent(item.id)}`, group: "Series" }));
    const chapterResults = chapters.filter((item) => item.title.toLowerCase().includes(needle) || item.sourceName.toLowerCase().includes(needle)).map((item) => ({ id: item.id, title: item.title, detail: seriesById.get(item.seriesId)?.title ?? "Chapter", icon: BookOpen, path: `/read/${encodeURIComponent(item.id)}`, group: "Chapters" }));
    const bookmarkResults = bookmarks.filter((item) => item.note.toLowerCase().includes(needle) || item.highlightText?.toLowerCase().includes(needle)).map((item) => ({ id: item.id, title: item.note || item.highlightText || "Saved page", detail: "Bookmark or annotation", icon: BookOpen, path: `/read/${encodeURIComponent(item.chapterId)}`, group: "Notes & bookmarks" }));
    return [...seriesResults, ...chapterResults, ...bookmarkResults].slice(0, 30);
  }, [bookmarks, chapters, query, series]);

  if (!mode) return null;
  const items = mode === "commands" ? commands.filter((item) => !query || item.title.toLowerCase().includes(query.toLowerCase())) : results;
  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, Math.max(items.length - 1, 0))); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
    if (event.key === "Enter" && items[activeIndex]) { event.preventDefault(); navigate(items[activeIndex].path); }
  };
  const grouped = mode === "search" ? Array.from(new Set(results.map((item) => item.group))) : ["Actions"];

  return <OverlayShell labelledBy="global-command-title" onEscape={() => setMode(null)} className="globalCommandBackdrop" contentClassName="globalCommandPanel" initialFocus="first">
    <div className="globalCommandHeader">
      <div><p className="eyebrow">{mode === "search" ? "Search everywhere" : "Quick actions"}</p><h2 id="global-command-title">{mode === "search" ? "Find in Kage" : "Command palette"}</h2></div>
      <button type="button" className="iconButton" onClick={() => setMode(null)} aria-label="Close"><X size={18} /></button>
    </div>
    <label className="globalCommandInputWrap"><Search size={18} /><input autoFocus value={query} onKeyDown={handleInputKeyDown} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder={mode === "search" ? "Search series, chapters, tags, notes..." : "Search actions..."} aria-label={mode === "search" ? "Search library" : "Search commands"} /><kbd>Esc</kbd></label>
    <div className="globalCommandResults" role="listbox" aria-label={mode === "search" ? "Search results" : "Commands"}>
      {grouped.map((group) => <section key={group}><p className="globalCommandGroup">{group}</p>{items.filter((item) => mode === "commands" || ("group" in item && item.group === group)).map((item) => { const Icon = item.icon; return <button key={item.id} type="button" className="globalCommandItem" onClick={() => navigate(item.path)}><Icon size={17} /><span><strong>{item.title}</strong><small>{"detail" in item ? item.detail : item.shortcut}</small></span><kbd>↵</kbd></button>; })}</section>)}
      {items.length === 0 ? <p className="globalCommandEmpty">{query ? "No matching results." : mode === "search" ? "Search your local library." : "Start typing to filter actions."}</p> : null}
    </div>
    <footer className="globalCommandFooter"><span><kbd>↑↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>⌘ K</kbd> Commands</span></footer>
  </OverlayShell>;
}
