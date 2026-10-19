import { describe, expect, it } from "vitest";
import {
  highlightReaderText,
  highlightReaderTextAt,
  highlightFirstReaderTextMatch,
  sanitizeReaderHtml,
} from "./html";

describe("sanitizeReaderHtml", () => {
  it("preserves book formatting while removing executable markup", () => {
    const safeHtml = sanitizeReaderHtml(
      '<h1>Chapter</h1><p onclick="alert(1)"><em>Text</em><script>alert(2)</script></p><a href="javascript:alert(3)">Link</a><img src="x" onerror="alert(4)">',
    );

    expect(safeHtml).toContain("<h1>Chapter</h1>");
    expect(safeHtml).toContain("<em>Text</em>");
    expect(safeHtml).not.toMatch(/script|onclick|javascript:|onerror/i);
  });

  it("highlights selected phrases without reintroducing unsafe markup", () => {
    expect(
      highlightReaderText(
        '<p>The silver moon rose.</p><script>alert("bad")</script>',
        ["SILVER moon"],
      ),
    ).toContain('<mark class="readerTextMatch">silver moon</mark>');
    expect(
      highlightReaderText('<p>Safe text</p><img src=x onerror="bad()">', [
        "Safe",
      ]),
    ).not.toContain("onerror");
  });

  it("highlights one selected occurrence instead of every matching phrase", () => {
    const markup = highlightReaderTextAt("<p>echo once, echo twice</p>", 11, 4);

    expect(markup.match(/<mark/g)).toHaveLength(1);
    expect(markup).toContain(
      'echo once, <mark class="readerTextMatch">echo</mark> twice',
    );
  });

  it("limits legacy phrase-only highlights to the first match", () => {
    const markup = highlightFirstReaderTextMatch(
      "<p>echo once, echo twice</p>",
      "ECHO",
    );

    expect(markup.match(/<mark/g)).toHaveLength(1);
    expect(markup).toContain('<mark class="readerTextMatch">echo</mark> once');
  });
});
