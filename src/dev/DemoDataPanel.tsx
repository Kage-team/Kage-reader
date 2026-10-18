import { useState } from "react";
import { Database, Trash2, X } from "lucide-react";
import { loadDemoLibrary, removeDemoLibrary, type DemoReport } from "./demoData";
import "./demoData.css";

export function DemoDataPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<DemoReport | null>(null);
  const [message, setMessage] = useState("");

  async function run(action: () => Promise<DemoReport>, success: string) {
    setBusy(true);
    setMessage("");
    try { setReport(await action()); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : "Demo data action failed"); }
    finally { setBusy(false); }
  }

  if (!open) return <button type="button" className="demoDataLauncher" onClick={() => setOpen(true)} aria-label="Open demo data tools"><Database size={15} /> Demo data</button>;
  return <aside className="demoDataPanel" aria-label="Demo data tools">
    <div className="demoDataPanelHeader"><div><strong>Preview data</strong><span>Local-only, namespaced sample library</span></div><button type="button" className="demoDataClose" onClick={() => setOpen(false)} aria-label="Close demo data tools"><X size={16} /></button></div>
    <div className="demoDataActions"><button type="button" onClick={() => void run(loadDemoLibrary, "Sample library ready.")} disabled={busy}><Database size={15} /> {busy ? "Working…" : "Load sample library"}</button><button type="button" className="demoDataDanger" onClick={() => void run(removeDemoLibrary, "Sample library removed; real content was preserved.")} disabled={busy}><Trash2 size={15} /> Remove sample library</button></div>
    {message && <p className="demoDataMessage" role="status">{message}</p>}
    {report && <p className="demoDataReport">Demo records: {report.series} series · {report.chapters} chapters · {report.pages} pages · {report.progress} progress · {report.bookmarks} bookmarks.<br />Remaining database records: {report.remaining.series} series · {report.remaining.chapters} chapters · {report.remaining.pages} pages · {report.remaining.progress} progress · {report.remaining.bookmarks} bookmarks.</p>}
  </aside>;
}
