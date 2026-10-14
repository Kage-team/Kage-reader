import { describe, expect, it } from "vitest";
import { sanitizeReaderHtml } from "./html";

describe("sanitizeReaderHtml", () => {
  it("preserves book formatting while removing executable markup", () => {
    const safeHtml = sanitizeReaderHtml(
      '<h1>Chapter</h1><p onclick="alert(1)"><em>Text</em><script>alert(2)</script></p><a href="javascript:alert(3)">Link</a><img src="x" onerror="alert(4)">',
    );

    expect(safeHtml).toContain("<h1>Chapter</h1>");
    expect(safeHtml).toContain("<em>Text</em>");
    expect(safeHtml).not.toMatch(/script|onclick|javascript:|onerror/i);
  });
});
