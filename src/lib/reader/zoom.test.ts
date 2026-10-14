import { describe, expect, it } from "vitest";
import { translateAtFocalPoint } from "./zoom";

describe("translateAtFocalPoint", () => {
  it("keeps the content under the focal point fixed while zooming in", () => {
    expect(translateAtFocalPoint(120, 10, 1, 2)).toBe(-100);
  });

  it("keeps the content under the focal point fixed while zooming out", () => {
    expect(translateAtFocalPoint(120, -100, 2, 1)).toBe(10);
  });
});
