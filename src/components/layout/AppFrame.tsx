import { type PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";
import { getActiveTab } from "./activeTab";
import {
  BookOpen,
  BookOpenCheck,
  FileUp,
  History,
  Heart,
  Settings,
  Search,
} from "lucide-react";
import { GlobalCommandCenter } from "./GlobalCommandCenter";

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
  function navClass(active: boolean): string {
    return `appNavLink${active ? " appNavLinkActive" : ""}`;
  }

  return (
    <div className="appShell">
      <a className="skipLink" href="#main-content">Skip to content</a>
      <aside className="appSidebar" aria-label="Primary navigation">
        <Link to="/?view=all" className="appBrand" aria-label="Kage Reader home">
          <span className="appBrandMark"><BookOpenCheck size={20} /></span>
          <span className="appBrandName">Kage<span>Reader</span></span>
        </Link>
        <nav className="appNavGroup" aria-label="Workspace">
          <p className="appNavLabel">Workspace</p>
          <Link to="/?view=all" className={navClass(activeTab === "library")} aria-current={activeTab === "library" ? "page" : undefined} data-active={activeTab === "library"}>
            <BookOpen size={17} />
            <span>Library</span>
          </Link>
          <Link to="/import" className={navClass(activeTab === "add")} aria-current={activeTab === "add" ? "page" : undefined} data-active={activeTab === "add"}>
            <FileUp size={17} />
            <span>Add</span>
          </Link>
          <Link to="/?view=saved" className={navClass(activeTab === "saved")} aria-current={activeTab === "saved" ? "page" : undefined} data-active={activeTab === "saved"}>
            <Heart size={17} />
            <span>Saved</span>
          </Link>
          <Link to="/?view=history" className={navClass(activeTab === "activity")} aria-current={activeTab === "activity" ? "page" : undefined} data-active={activeTab === "activity"}>
            <History size={17} />
            <span>Activity</span>
          </Link>
        </nav>

        <nav className="appNavGroup" aria-label="Application">
          <p className="appNavLabel">Application</p>
          <Link to="/settings" className={navClass(activeTab === "more")} aria-current={activeTab === "more" ? "page" : undefined} data-active={activeTab === "more"}>
            <Settings size={17} />
            <span>More</span>
          </Link>
        </nav>

        <div className="appSidebarFooter">
          <span className="appLocalBadge">
            <span className="appLocalDot" />
            Stored on this device
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
          <div className="appTopbarBrandGroup" aria-hidden="true" />
          <div className="appTopbarStatus">
            {activeTab === "activity" || activeTab === "more" ? (
              <button type="button" className="appTopbarSearch" onClick={() => window.dispatchEvent(new Event("kage:open-search"))} aria-label="Search everywhere" title="Search everywhere (/)">
                <Search size={16} />
                <span>Search</span>
                <kbd>/</kbd>
              </button>
            ) : null}
            <span className="appStatusText" title="Stored on this device" aria-label="Stored on this device">
              <span className="appLocalDot" />
            </span>
          </div>

        </header>
        <div className="appView" id="main-content">{children}</div>
        <GlobalCommandCenter />
        </div>
    </div>
  );
}
