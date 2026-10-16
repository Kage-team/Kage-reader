import DOMPurify from "dompurify";

export function sanitizeReaderHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["base", "embed", "form", "iframe", "object"],
    FORBID_ATTR: ["srcdoc"],
  });
}

export function highlightReaderText(html: string, phrases: string[]): string {
  const document = new DOMParser().parseFromString(
    sanitizeReaderHtml(html),
    "text/html",
  );
  const normalizedPhrases = Array.from(
    new Set(phrases.map((phrase) => phrase.trim()).filter(Boolean)),
  );

  for (const phrase of normalizedPhrases) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    const normalizedPhrase = phrase.toLocaleLowerCase();

    for (const node of nodes) {
      if (node.parentElement?.closest("mark")) continue;
      const content = node.nodeValue ?? "";
      const normalizedContent = content.toLocaleLowerCase();
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let matchIndex = normalizedContent.indexOf(normalizedPhrase, cursor);
      if (matchIndex < 0) continue;

      while (matchIndex >= 0) {
        fragment.append(
          document.createTextNode(content.slice(cursor, matchIndex)),
        );
        const mark = document.createElement("mark");
        mark.className = "readerTextMatch";
        mark.textContent = content.slice(
          matchIndex,
          matchIndex + phrase.length,
        );
        fragment.append(mark);
        cursor = matchIndex + phrase.length;
        matchIndex = normalizedContent.indexOf(normalizedPhrase, cursor);
      }
      fragment.append(document.createTextNode(content.slice(cursor)));
      node.replaceWith(fragment);
    }
  }

  return document.body.innerHTML;
}
