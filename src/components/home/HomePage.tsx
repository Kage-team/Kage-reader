import { ArrowRight, BookOpen, Bookmark, Clock3, FileUp, History, ListOrdered, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const rails = [
  { title: "Continue reading", description: "Pick up where you left off.", href: "/?view=continue", icon: Clock3 },
  { title: "Reading queue", description: "Keep your next chapters close.", href: "/?view=queue", icon: ListOrdered },
  { title: "Favorites", description: "Your personal shelf.", href: "/?view=favorites", icon: Bookmark },
  { title: "Recently read", description: "Your latest reading activity.", href: "/?view=history", icon: History },
];

export function HomePage() {
  return (
    <main className="homePage">
      <section className="homeHero">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> Your reading space</span>
          <h1>Welcome back.</h1>
          <p>Keep your manga close, private, and ready to read offline.</p>
        </div>
        <div className="homeHeroActions">
          <Link className="homePrimaryAction" to="/import"><FileUp size={17} /> Add to library</Link>
          <Link className="homeHeroSecondary" to="/?view=all">Open library</Link>
        </div>
      </section>
      <section className="homeSection" aria-labelledby="home-shortcuts-title">
        <div className="homeSectionHeader">
          <div><span className="eyebrow">Your shelves</span><h2 id="home-shortcuts-title">Jump back in</h2></div>
          <Link className="homeSectionLink" to="/?view=all">View library <ArrowRight size={14} /></Link>
        </div>
        <div className="homeRails">
        {rails.map(({ title, description, href, icon: Icon }) => (
          <Link className="homeRailCard" key={title} to={href}>
            <span className="homeRailIcon"><Icon size={18} /></span>
            <span><strong>{title}</strong><small>{description}</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ))}
        </div>
      </section>
      <section className="homeEmptyState" aria-labelledby="home-empty-title">
        <span className="homeEmptyIcon"><BookOpen size={24} /></span>
        <div><h2 id="home-empty-title">Start with your library</h2><p>Import a local folder or archive to make this space yours.</p></div>
        <Link className="secondaryButton" to="/?view=all">Browse library</Link>
      </section>
    </main>
  );
}
