import { useEffect } from "react";

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ message, onUndo, onDismiss }: UndoToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 7000);
    return () => window.clearTimeout(timeout);
  }, [onDismiss]);

  return (
    <div className="undoToast" role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={onUndo}>Undo</button>
      <button type="button" className="undoToastDismiss" onClick={onDismiss} aria-label="Dismiss notification">×</button>
    </div>
  );
}
