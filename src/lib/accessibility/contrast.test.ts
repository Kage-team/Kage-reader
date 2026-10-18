import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

describe("theme contrast safeguards", () => {
  const themes = [
    ["midnight", "#f2f3f1", "#050606"],
    ["parchment", "#25241f", "#f1e9da"],
    ["forest", "#eaf4ed", "#08130f"],
    ["cyber", "#f5f0fb", "#0b0a12"],
    ["paper", "#2d2c2a", "#e6e3de"],
    ["ocean", "#e8f2f3", "#0d1b24"],
    ["ember", "#f8eef0", "#140d10"],
  ] as const;

  it.each(themes)("keeps %s primary text at WCAG AA contrast", (_theme, text, background) => {
    expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("calculates the known black and white ratio", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 4);
  });
});
