import { Grid2X2, List } from "lucide-react";

type ViewMode = "grid" | "list";

type ViewModeToggleProps = {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  label: string;
};

export function ViewModeToggle({ value, onChange, label }: ViewModeToggleProps) {
  return (
    <div className="viewModeToggle" role="group" aria-label={label}>
      <button
        type="button"
        className={value === "grid" ? "is-active" : ""}
        aria-label={`${label} grid view`}
        aria-pressed={value === "grid"}
        onClick={() => onChange("grid")}
      >
        <Grid2X2 size={15} aria-hidden="true" />
        <span>Grid</span>
      </button>
      <button
        type="button"
        className={value === "list" ? "is-active" : ""}
        aria-label={`${label} list view`}
        aria-pressed={value === "list"}
        onClick={() => onChange("list")}
      >
        <List size={15} aria-hidden="true" />
        <span>List</span>
      </button>
    </div>
  );
}
