import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getPreferences } from "../../lib/preferences/preferences";
import { grantAdultAccess, verifyAdultPin } from "../../lib/security/adultPin";

export function AdultAccessPrompt({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const preferences = getPreferences();

  async function verify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    if (!preferences.adultPinSalt || !preferences.adultPinHash) {
      setError("Set an adult access PIN in Settings first.");
      return;
    }

    try {
      const valid = await verifyAdultPin(pin, {
        salt: preferences.adultPinSalt,
        hash: preferences.adultPinHash,
      });
      if (!valid) {
        setError("That PIN did not match.");
        return;
      }
      grantAdultAccess(preferences.adultPinHash);
      onUnlocked();
    } catch {
      setError("Could not verify the PIN in this browser.");
    }
  }

  return (
    <div style={styles.overlay}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="adult-access-title"
        style={styles.dialog}
      >
        <h1 id="adult-access-title" style={styles.title}>
          18+ verification
        </h1>
        <form onSubmit={(event) => void verify(event)} style={styles.form}>
          <label style={styles.label}>
            Access PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              pattern="[0-9]{4,6}"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.currentTarget.value)}
              style={styles.input}
            />
          </label>
          {error ? (
            <p role="alert" style={styles.error}>
              {error}
            </p>
          ) : null}
          <button type="submit" style={styles.submit}>
            Unlock
          </button>
        </form>
        <Link to="/settings" style={styles.settingsLink}>
          Set or change PIN in Settings
        </Link>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    zIndex: 80,
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "rgba(0, 0, 0, 0.82)",
    backdropFilter: "blur(10px)",
  },
  dialog: {
    display: "grid",
    gap: 16,
    width: "min(380px, 100%)",
    padding: 24,
    border: "1px solid var(--app-border-strong)",
    borderRadius: 10,
    background: "var(--app-panel)",
    color: "var(--app-text)",
  },
  title: { margin: 0, fontFamily: "var(--font-display)", fontSize: 22 },
  form: { display: "grid", gap: 12 },
  label: { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 },
  input: {
    minHeight: 40,
    padding: "8px 10px",
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    background: "var(--app-panel-raised)",
    color: "var(--app-text)",
    font: "inherit",
  },
  submit: {
    minHeight: 40,
    border: 0,
    borderRadius: 6,
    background: "var(--app-lime)",
    color: "#101310",
    font: "inherit",
    fontWeight: 700,
    cursor: "pointer",
  },
  error: { margin: 0, color: "var(--app-danger)", fontSize: 12 },
  settingsLink: { color: "var(--app-muted)", fontSize: 12 },
};
