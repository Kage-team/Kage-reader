import type { PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";
import { DemoDataPanel } from "../../dev/DemoDataPanel";
import {
  Bookmark,
  BookOpen,
  BookOpenCheck,
  Clock3,
  FileUp,
  History,
  Home,
  ListOrdered,
  Settings,
  ShieldCheck,
} from "lucide-react";

export function AppFrame({ children }: PropsWithChildren) {
  const { pathname, search } = useLocation();
  const searchParams = new URLSearchParams(search);
  const requestedView = searchParams.get("view");
  const view = requestedView ?? "all";
  const isLibraryRoute = pathname === "/";
  const isHomeRoute = isLibraryRoute && !searchParams.has("view");
  const isLibraryHome = isLibraryRoute && requestedView === "all";
  const demoEnabled = searchParams.get("demo") === "1" && !pathname.startsWith("/read/");
  const pageName =
    isHomeRoute
      ? "Home"
      : pathname === "/settings"
      ? "Settings"
      : pathname.startsWith("/series/")
        ? "Series"
          : pathname === "/import"
            ? "Import"
              : isLibraryRoute && view === "history"
                ? "Activity"
              : "Library";

  function navClass(active: boolean): string {
    return `appNavLink${active ? " appNavLinkActive" : ""}`;
  }

  return (
    <div className="appShell">
      <a className="skipLink" href="#main-content">Skip to content</a>
      <aside className="appSidebar" aria-label="Primary navigation">
        <Link to="/" className="appBrand" aria-label="Kage Reader home">
          <span className="appBrandMark">
            <BookOpenCheck size={20} />
          </span>
          <span className="appBrandName">
            Kage<span>Local reader</span>
          </span>
        </Link>

        <nav className="appNavGroup">
          <p className="appNavLabel">Workspace</p>
          <Link to="/" className={navClass(isHomeRoute)}>
            <Home size={17} />
            <span>Home</span>
          </Link>
          <Link
            to="/import"
            className={navClass(pathname === "/import")} aria-current={pathname === "/import" ? "page" : undefined}
          >
            <FileUp size={17} />
            <span>Import</span>
          </Link>
          <Link
to="/?view=all"
          className={navClass(isLibraryHome)}
          >
            <BookOpen size={17} />
            <span>All series</span>
          </Link>
          <Link
            to="/?view=continue"
            className={navClass(isLibraryRoute && view === "continue")}
          >
            <Clock3 size={17} />
            <span>Continue</span>
          </Link>
          <Link
            to="/?view=favorites"
            className={navClass(isLibraryRoute && view === "favorites")}
          >
            <Bookmark size={17} />
            <span>Favorites</span>
          </Link>
          <Link
            to="/?view=queue"
            className={navClass(isLibraryRoute && view === "queue")}
          >
            <ListOrdered size={17} />
            <span>Queue</span>
          </Link>
          <Link
            to="/?view=history"
            className={navClass(isLibraryRoute && view === "history")}
          >
            <History size={17} />
            <span>History</span>
          </Link>
        </nav>

        <nav className="appNavGroup">
          <p className="appNavLabel">Application</p>
          <Link
            to="/settings"
            className={navClass(pathname === "/settings")} aria-current={pathname === "/settings" ? "page" : undefined}
          >
            <Settings size={17} />
            <span>Settings</span>
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
        <Link to="/" className={navClass(isHomeRoute)} aria-current={isHomeRoute ? "page" : undefined} aria-label="Home">
          <Home size={18} />
          <span>Home</span>
        </Link>
        <Link to="/?view=all" className={navClass(isLibraryHome)} aria-current={isLibraryHome ? "page" : undefined} aria-label="Library">
          <BookOpen size={18} />
          <span>Library</span>
        </Link>
        <Link to="/import" className="appMobileAdd" aria-label="Add to library">
          <FileUp size={18} />
          <span>Add</span>
        </Link>
        <Link to="/?view=history" className={navClass(isLibraryRoute && view === "history")} aria-current={isLibraryRoute && view === "history" ? "page" : undefined} aria-label="Activity">
          <History size={18} />
          <span>Activity</span>
        </Link>
        <Link to="/settings" className={navClass(pathname === "/settings")} aria-current={pathname === "/settings" ? "page" : undefined} aria-label="More">
          <Settings size={18} />
          <span>More</span>
        </Link>
      </nav>

      <div className="appMainShell">
        <header className="appTopbar">
          <div className="appBreadcrumb">
            <span>Kage Reader</span>
            <span aria-hidden="true">/</span>
            <strong>{pageName}</strong>
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
