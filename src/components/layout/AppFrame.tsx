import type { PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";
import { DemoDataPanel } from "../../dev/DemoDataPanel";
import { getActiveTab } from "./activeTab";
import {
  BookOpen,
  BookOpenCheck,
  FileUp,
  History,
  Heart,
  Settings,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

export function AppFrame({ children }: PropsWithChildren) {
  const { pathname, search } = useLocation();
  const searchParams = new URLSearchParams(search);
  const requestedView = searchParams.get("view");
  const activeTab = pathname === "/"
    ? requestedView === "history" || requestedView === "insights"
      ? "activity"
      : requestedView === "saved" || requestedView === "favorites" || requestedView === "queue"
        ? "saved"
        : "library"
    : getActiveTab(pathname, search);
  const demoEnabled = searchParams.get("demo") === "1" && !pathname.startsWith("/read/");
  function navClass(active: boolean): string {
    return `appNavLink${active ? " appNavLinkActive" : ""}`;
  }

  return (
    <div className="appShell">
      <a className="skipLink" href="#main-content">Skip to content</a>
      <aside className="appSidebar" aria-label="Primary navigation">
        <nav className="appNavGroup" aria-label="Workspace">
          <p className="appNavLabel">Workspace</p>
          <Link to="/?view=all" className={navClass(false)} data-active={activeTab === "library"}>
            <BookOpen size={17} />
            <span>Library</span>
          </Link>
          <Link to="/import" className={navClass(activeTab === "add")} data-active={activeTab === "add"}>
            <FileUp size={17} />
            <span>Add</span>
          </Link>
          <Link to="/?view=saved" className={navClass(activeTab === "saved")} data-active={activeTab === "saved"}>
            <Heart size={17} />
            <span>Saved</span>
          </Link>
          <Link to="/?view=history" className={navClass(activeTab === "activity")} data-active={activeTab === "activity"}>
            <History size={17} />
            <span>Activity</span>
          </Link>
        </nav>

        <nav className="appNavGroup" aria-label="Application">
          <p className="appNavLabel">Application</p>
          <Link to="/settings" className={navClass(activeTab === "more")} data-active={activeTab === "more"}>
            <Settings size={17} />
            <span>More</span>
          </Link>
        </nav>

        <div className="appSidebarFooter">
          <span className="appLocalBadge">
            <span className="appLocalDot" />
            Stored on this device
          </span>
          <span>
            <ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> Private
            by default
          </span>
        </div>
      </aside>

      <nav className="appMobileNav" aria-label="Primary navigation">
        <Link to="/?view=all" className={navClass(activeTab === "library")} aria-current={activeTab === "library" ? "page" : undefined} aria-label="Library">
          <BookOpen size={18} />
          <span>Library</span>
        </Link>
        <Link to="/?view=saved" className={navClass(activeTab === "saved")} aria-current={activeTab === "saved" ? "page" : undefined} aria-label="Saved">
          <Heart size={18} />
          <span>Saved</span>
        </Link>
        <Link to="/import" className={`appMobileAdd${activeTab === "add" ? " appNavLinkActive" : ""}`} aria-current={activeTab === "add" ? "page" : undefined} aria-label="Add to library">
          <FileUp size={18} />
          <span>Add</span>
        </Link>
        <Link to="/?view=history" className={navClass(activeTab === "activity")} aria-current={activeTab === "activity" ? "page" : undefined} aria-label="Activity">
          <History size={18} />
          <span>Activity</span>
        </Link>
        <Link to="/settings" className={navClass(activeTab === "more")} aria-current={activeTab === "more" ? "page" : undefined} aria-label="More">
          <Settings size={18} />
          <span>More</span>
        </Link>
      </nav>

      <div className="appMainShell">
        <header className="appTopbar">
          <div className="appTopbarBrandGroup">
            <Link to="/?view=all" className="appTopbarBrand" aria-label="Kage Reader home">
              <span className="appBrandMark"><BookOpenCheck size={18} /></span>
              <strong>Kage</strong>
            </Link>
            <nav className="appTopbarSafety" aria-label="Content safety">
              <Link to="/?view=all" title="Safe mode"><ShieldCheck size={14} /> Safe</Link>
              <Link to="/?view=adult" title="18+ Vault"><ShieldAlert size={14} /> Vault</Link>
            </nav>
          </div>
          <div className="appTopbarStatus">
            <div className="appTopbarUtilities">
              <Link
                to="/import"
                className="appTopbarUtility"
                aria-label="Import books"
                title="Import books"
              >
                <FileUp size={17} />
              </Link>
              <Link
                to="/settings"
                className="appTopbarUtility"
                aria-label="Settings"
                title="Settings"
              >
                <Settings size={17} />
              </Link>
            </div>
            <span className="appStatusText">
              <span className="appLocalDot" /> Offline-ready library
            </span>
          </div>
        </header>
        <div className="appView" id="main-content">{children}</div>
        {demoEnabled && <DemoDataPanel />}
      </div>
    </div>
  );
}
