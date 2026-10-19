import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OverlayShell } from "./OverlayShell";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let opener: HTMLButtonElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  opener?.remove();
  root = undefined;
  host = undefined;
  opener = undefined;
});

describe("OverlayShell", () => {
  it("keeps shared dialog classes and closes only on backdrop clicks", () => {
    const onEscape = vi.fn();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => {
      root?.render(
        createElement(
          OverlayShell,
          {
            labelledBy: "overlay-title",
            className: "custom-backdrop",
            contentClassName: "custom-panel",
            onEscape,
          },
          createElement("h2", { id: "overlay-title" }, "Settings"),
        ),
      );
    });

    const backdrop = host.firstElementChild as HTMLDivElement;
    const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
    expect(backdrop.classList.contains("overlayShellBackdrop")).toBe(true);
    expect(backdrop.classList.contains("custom-backdrop")).toBe(true);
    expect(dialog.classList.contains("overlayShellContent")).toBe(true);
    expect(dialog.classList.contains("custom-panel")).toBe(true);

    act(() => {
      dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onEscape).not.toHaveBeenCalled();

    act(() => {
      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("keeps focus stable and calls the latest Escape handler", () => {
    const firstEscape = vi.fn();
    const latestEscape = vi.fn();
    opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    const renderOverlay = (onEscape: () => void) =>
      createElement(
        OverlayShell,
        { labelledBy: "focus-title", onEscape, initialFocus: "none" },
        createElement("h2", { id: "focus-title" }, "Settings"),
        createElement("button", null, "Reader option"),
      );

    act(() => root?.render(renderOverlay(firstEscape)));
    const option = host.querySelector("button") as HTMLButtonElement;
    option.focus();

    act(() => root?.render(renderOverlay(latestEscape)));
    expect(document.activeElement).toBe(option);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(firstEscape).not.toHaveBeenCalled();
    expect(latestEscape).toHaveBeenCalledOnce();

    act(() => root?.unmount());
    root = undefined;
    expect(document.activeElement).toBe(opener);
  });
});
