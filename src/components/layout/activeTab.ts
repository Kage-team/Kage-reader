export type ActiveTab = "library" | "saved" | "activity" | "add" | "more";

export function getActiveTab(pathname: string, search: string): ActiveTab {
  if (pathname === "/import") return "add";
  if (pathname === "/settings") return "more";
  if (pathname !== "/") return "library";

  const view = new URLSearchParams(search).get("view");
  if (view === "history" || view === "insights") return "activity";
  if (view === "saved" || view === "favorites" || view === "queue") return "saved";
  return "library";
}
