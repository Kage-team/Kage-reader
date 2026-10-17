import type { ReactNode } from "react";
import { ArrowRight, BookOpen, Clock3, History, ListOrdered, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

function ScreenHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="experimentalScreenHeader"><span className="experimentalEyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>;
}

function Rail({ title, icon: Icon, href, children }: { title: string; icon: typeof BookOpen; href: string; children: ReactNode }) {
  return <section className="experimentalRailSection"><div className="experimentalSectionHeading"><div><Icon size={16} /><h2>{title}</h2></div><Link to={href}>See all <ArrowRight size={14} /></Link></div>{children}</section>;
}

const EmptyRail = ({ label }: { label: string }) => <div className="experimentalEmptyRail"><BookOpen size={20} /><span>{label}</span></div>;

export function HomeB() {
  return <div><ScreenHeader eyebrow="HOME" title="Pick up where you left off" description="Your private reading space, organized around what you want to read next." /><div className="experimentalHomeGrid"><div className="experimentalHomePrimary"><Rail title="Continue reading" icon={Clock3} href="/?layout=b&screen=library&view=continue"><EmptyRail label="Your in-progress chapters will appear here." /></Rail><Rail title="Reading queue" icon={ListOrdered} href="/?layout=b&screen=library&view=queue"><EmptyRail label="Build a queue from your library." /></Rail></div><aside className="experimentalHomeSecondary"><div className="experimentalCallout"><Sparkles size={20} /><strong>Start with your library</strong><p>Import CBZ, CBR, PDF, or image folders to make this space yours.</p><Link className="experimentalPrimaryButton" to="/import">Add manga <ArrowRight size={15} /></Link></div><Rail title="Favorites" icon={BookOpen} href="/?layout=b&screen=library&view=favorites"><EmptyRail label="No favorites yet." /></Rail></aside></div></div>;
}

export function LibraryB() {
  return <div><ScreenHeader eyebrow="LIBRARY" title="Your collection" description="Browse every series in one focused, searchable place." /><div className="experimentalLibraryCard"><div className="experimentalLibraryToolbar"><Link className="experimentalPrimaryButton" to="/import">Add manga <ArrowRight size={15} /></Link><Link className="experimentalTextButton" to="/?view=all">Open full library <ArrowRight size={14} /></Link></div><div className="experimentalLibraryEmpty"><BookOpen size={26} /><h2>Your library is ready for its first series</h2><p>Import local files to start reading offline.</p><Link className="experimentalPrimaryButton" to="/import">Import files</Link></div></div></div>;
}

export function ActivityB() {
  return <div><ScreenHeader eyebrow="ACTIVITY" title="Reading activity" description="Keep your history and reading insights together." /><div className="experimentalTabs" role="tablist"><Link role="tab" aria-selected="true" className="is-active" to="/?layout=b&screen=activity">History</Link><Link role="tab" aria-selected="false" to="/?view=insights">Insights</Link></div><div className="experimentalActivityCard"><History size={25} /><h2>No reading history yet</h2><p>Once you start a chapter, your recent activity will show up here.</p><Link className="experimentalTextButton" to="/?layout=b&screen=library">Browse library <ArrowRight size={14} /></Link></div></div>;
}

export function MoreB() {
  return <div><ScreenHeader eyebrow="MORE" title="Settings and safety" description="Manage how Kage Reader behaves on this device." /><div className="experimentalMoreGrid"><Link className="experimentalMoreCard" to="/settings"><Settings size={20} /><strong>Settings</strong><span>Theme, reader preferences, and app controls <ArrowRight size={14} /></span></Link><Link className="experimentalMoreCard" to="/?view=adult"><ShieldCheck size={20} /><strong>18+ vault</strong><span>Manage protected content access <ArrowRight size={14} /></span></Link><div className="experimentalPrivacyNote"><ShieldCheck size={18} /><span><strong>Private by default.</strong> Your library stays stored on this device.</span></div></div></div>;
}
