import {
  useEffect,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from "react";

type OverlayShellProps = PropsWithChildren<{
  labelledBy: string;
  describedBy?: string;
  className?: string;
  contentClassName?: string;
  onEscape?: () => void;
  initialFocus?: "first" | "none";
  role?: "dialog" | "alertdialog";
  ariaLabel?: string;
  title?: ReactNode;
}>;

export function OverlayShell({
  children,
  labelledBy,
  describedBy,
  className = "",
  contentClassName = "",
  onEscape,
  initialFocus = "first",
  role = "dialog",
  ariaLabel,
}: OverlayShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const root = rootRef.current;
    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    if (initialFocus === "first") focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [initialFocus]);

  return (
    <div
      ref={rootRef}
      className={`overlayShellBackdrop ${className}`.trim()}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onEscapeRef.current?.();
        }
      }}
    >
      <section
        className={`overlayShellContent ${contentClassName}`.trim()}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
      >
        {children}
      </section>
    </div>
  );
}
