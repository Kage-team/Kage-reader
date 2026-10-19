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

export function highlightReaderTextAt(
  html: string,
  start: number,
  length: number,
): string {
  const document = new DOMParser().parseFromString(
    sanitizeReaderHtml(html),
    "text/html",
  );
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(length) ||
    start < 0 ||
    length < 1
  ) {
    return document.body.innerHTML;
  }

  const end = start + length;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  let textOffset = 0;
  for (const node of nodes) {
    const content = node.nodeValue ?? "";
    const nodeStart = textOffset;
    const nodeEnd = nodeStart + content.length;
    textOffset = nodeEnd;
    const matchStart = Math.max(start, nodeStart);
    const matchEnd = Math.min(end, nodeEnd);
    if (matchStart >= matchEnd) continue;

    const fragment = document.createDocumentFragment();
    fragment.append(
      document.createTextNode(content.slice(0, matchStart - nodeStart)),
    );
    const mark = document.createElement("mark");
    mark.className = "readerTextMatch";
    mark.textContent = content.slice(
      matchStart - nodeStart,
      matchEnd - nodeStart,
    );
    fragment.append(mark);
    fragment.append(
      document.createTextNode(content.slice(matchEnd - nodeStart)),
    );
    node.replaceWith(fragment);
  }

  return document.body.innerHTML;
}

export function highlightFirstReaderTextMatch(
  html: string,
  phrase: string,
): string {
  const safeHtml = sanitizeReaderHtml(html);
  const document = new DOMParser().parseFromString(safeHtml, "text/html");
  const normalizedPhrase = phrase.trim().toLocaleLowerCase();
  if (!normalizedPhrase) return document.body.innerHTML;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const content = node.nodeValue ?? "";
    const matchIndex = content.toLocaleLowerCase().indexOf(normalizedPhrase);
    if (matchIndex >= 0) {
      return highlightReaderTextAt(
        safeHtml,
        textOffset + matchIndex,
        normalizedPhrase.length,
      );
    }
    textOffset += content.length;
  }

  return document.body.innerHTML;
}
