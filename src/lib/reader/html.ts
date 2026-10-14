import DOMPurify from "dompurify";

export function sanitizeReaderHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["base", "embed", "form", "iframe", "object"],
    FORBID_ATTR: ["srcdoc"],
  });
}
