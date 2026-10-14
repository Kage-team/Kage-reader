const NORMAL_TITLE = "Kage Reader";
const STEALTH_TITLE = "Notes";
const NORMAL_ICON = "/icon.svg";
const STEALTH_ICON = "/stealth.svg";

export function applyStealthMode(enabled: boolean): void {
  document.title = enabled ? STEALTH_TITLE : NORMAL_TITLE;
  const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (favicon) favicon.href = enabled ? STEALTH_ICON : NORMAL_ICON;
}
