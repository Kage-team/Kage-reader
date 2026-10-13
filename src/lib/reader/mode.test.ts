import { describe, expect, it } from "vitest";
import { resolveReaderMode } from "./mode";
import type { ReaderMode } from "../storage/types";

describe("resolveReaderMode", () => {
  it("defaults to the flip reader when no preference is saved", () => {
    expect(resolveReaderMode(undefined)).toBe("flip");
  });

  it("keeps the user-selected reading mode when it is stored", () => {
    expect(resolveReaderMode("webtoon")).toBe("webtoon");
    expect(resolveReaderMode("novel")).toBe("novel");
    const mode: ReaderMode = "flip";
    expect(resolveReaderMode(mode)).toBe("flip");
  });
});
