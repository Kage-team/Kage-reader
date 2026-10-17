import type { PropsWithChildren } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Activity, BookOpen, Home, MoreHorizontal, Plus } from "lucide-react";

const navItems = [
  { href: "/?layout=b&screen=home", label: "Home", icon: Home },
  { href: "/?layout=b&screen=library", label: "Library", icon: BookOpen },
  { href: "/?layout=b&screen=activity", label: "Activity", icon: Activity },
  { href: "/?layout=b&screen=more", label: "More", icon: MoreHorizontal },
];

export function AppFrameB({ children }: PropsWithChildren) {
  const { pathname, search } = useLocation();
  const screen = new URLSearchParams(search).get("screen") ?? "home";
  const isReader = pathname.startsWith("/read/");

  if (isReader) return <>{children}</>;

  return (
    <div className="experimentalShell">
      <aside className="experimentalRail" aria-label="Primary navigation">
        <NavLink className="experimentalLogo" to="/?layout=b&screen=home" aria-label="Kage Reader home">
          K
        </NavLink>
        <nav className="experimentalRailNav">
          {navItems.map(({ href, label, icon: Icon }) => (
            <NavLink key={label} to={href} className={() => `experimentalRailLink${screen === label.toLowerCase() ? " is-active" : ""}`}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink className="experimentalRailAdd" to="/import" aria-label="Add manga" title="Add manga">
          <Plus size={20} />
        </NavLink>
      </aside>
      <main className="experimentalMain">
        <header className="experimentalTopbar">
          <span className="experimentalEyebrow">KAGE READER</span>
          <span className="experimentalOffline"><i /> Offline-ready</span>
        </header>
        <div className="experimentalContent">{children}</div>
      </main>
      <nav className="experimentalBottomNav" aria-label="Primary navigation">
        <NavLink to="/?layout=b&screen=home" className={() => screen === "home" ? "is-active" : ""}><Home size={19} /><span>Home</span></NavLink>
        <NavLink to="/?layout=b&screen=library" className={() => screen === "library" ? "is-active" : ""}><BookOpen size={19} /><span>Library</span></NavLink>
        <NavLink className="experimentalBottomAdd" to="/import" aria-label="Add manga"><Plus size={22} /></NavLink>
        <NavLink to="/?layout=b&screen=activity" className={() => screen === "activity" ? "is-active" : ""}><Activity size={19} /><span>Activity</span></NavLink>
        <NavLink to="/?layout=b&screen=more" className={() => screen === "more" ? "is-active" : ""}><MoreHorizontal size={19} /><span>More</span></NavLink>
      </nav>
    </div>
  );
}
