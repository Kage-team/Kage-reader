import type { PropsWithChildren } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Bookmark,
  BookOpen,
  BookOpenCheck,
  Clock3,
  FileUp,
  Settings,
  ShieldCheck,
} from "lucide-react";

export function AppFrame({ children }: PropsWithChildren) {
  const { pathname, search } = useLocation();
  const view = new URLSearchParams(search).get("view") ?? "all";
  const isLibraryRoute = pathname === "/";
  const pageName =
    pathname === "/settings"
      ? "Settings"
      : pathname.startsWith("/series/")
        ? "Series"
        : pathname === "/import"
          ? "Import"
          : "Library";

  function navClass(active: boolean): string {
    return `appNavLink${active ? " appNavLinkActive" : ""}`;
  }

  return (
    <div className="appShell">
      <aside className="appSidebar" aria-label="Primary navigation">
        <NavLink to="/" className="appBrand" aria-label="Kage Reader home">
          <span className="appBrandMark">
            <BookOpenCheck size={20} />
          </span>
          <span className="appBrandName">
            Kage<span>Local reader</span>
          </span>
        </NavLink>

        <nav className="appNavGroup">
          <p className="appNavLabel">Your library</p>
          <NavLink
            to="/import"
            className={({ isActive }) => navClass(isActive)}
          >
            <FileUp size={17} />
            <span>Import</span>
          </NavLink>
          <NavLink
            to="/"
            end
            className={() => navClass(isLibraryRoute && view === "all")}
          >
            <BookOpen size={17} />
            <span>All series</span>
          </NavLink>
          <NavLink
            to="/?view=continue"
            className={() => navClass(isLibraryRoute && view === "continue")}
          >
            <Clock3 size={17} />
            <span>Continue</span>
          </NavLink>
          <NavLink
            to="/?view=favorites"
            className={() => navClass(isLibraryRoute && view === "favorites")}
          >
            <Bookmark size={17} />
            <span>Favorites</span>
          </NavLink>
        </nav>

        <nav className="appNavGroup">
          <p className="appNavLabel">Application</p>
          <NavLink
            to="/settings"
            className={({ isActive }) => navClass(isActive)}
          >
            <Settings size={17} />
            <span>Settings</span>
          </NavLink>
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
        <NavLink
          to="/"
          end
          className={() => navClass(isLibraryRoute && view === "all")}
          aria-label="All series"
        >
          <BookOpen size={18} />
          <span>Library</span>
        </NavLink>
        <NavLink
          to="/?view=continue"
          className={() => navClass(isLibraryRoute && view === "continue")}
          aria-label="Continue reading"
        >
          <Clock3 size={18} />
          <span>Continue</span>
        </NavLink>
        <NavLink
          to="/?view=favorites"
          className={() => navClass(isLibraryRoute && view === "favorites")}
          aria-label="Favorites"
        >
          <Bookmark size={18} />
          <span>Saved</span>
        </NavLink>
        <NavLink
          to="/import"
          className={({ isActive }) => navClass(isActive)}
          aria-label="Import books"
        >
          <FileUp size={18} />
          <span>Import</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => navClass(isActive)}
          aria-label="Settings"
        >
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>
      </nav>

      <div className="appMainShell">
        <header className="appTopbar">
          <div className="appBreadcrumb">
            <span>Kage Reader</span>
            <span aria-hidden="true">/</span>
            <strong>{pageName}</strong>
          </div>
          <div className="appTopbarStatus">
            <span className="appStatusText">
              <span className="appLocalDot" /> Offline-ready library
            </span>
          </div>
        </header>
        <div className="appView">{children}</div>
      </div>
    </div>
  );
}
