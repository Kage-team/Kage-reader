import { strToU8, zipSync } from "fflate";
import { getBlob, getChapter, getSeries, listChapters, listPages } from "./db";
import type { Chapter, Page, Series } from "./types";

type ExportFile = { name: string; blob: Blob; extension: "cbz" | "epub" };

function safeName(value: string): string {
  return (
    Array.from(value, (character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return /[<>:"/\\|?*]/.test(character) || codePoint < 32 ? "_" : character;
    })
      .join("")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "book"
  );
}

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function extensionForMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("avif")) return "avif";
  if (mime.includes("tiff")) return "tiff";
  return "bin";
}

function plainText(content: string, mime: string): string {
  if (!mime.includes("html") && !mime.includes("xml")) return content;
  return content
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|section|article|blockquote)>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

async function readChapterExport(
  series: Series,
  chapter: Chapter,
): Promise<ExportFile> {
  const pages = await listPages(chapter.id);
  if (pages.length === 0)
    throw new Error(`Chapter "${chapter.title}" is empty.`);
  const hasImages = pages.some((page) => page.mime.startsWith("image/"));
  if (!hasImages) return exportTextChapter(series, chapter, pages);

  const files: Record<string, Uint8Array> = {};
  for (const [index, page] of pages.entries()) {
    if (!page.mime.startsWith("image/")) continue;
    const blob = await getBlob(page.storageKey);
    if (!blob) throw new Error(`A page is missing from "${chapter.title}".`);
    const filename = `${String(index + 1).padStart(4, "0")}.${extensionForMime(page.mime)}`;
    files[filename] = new Uint8Array(await blob.arrayBuffer());
  }
  if (Object.keys(files).length === 0) {
    return exportTextChapter(series, chapter, pages);
  }
  return {
    name: `${safeName(chapter.title)}.cbz`,
    blob: new Blob([zipSync(files)], { type: "application/vnd.comicbook+zip" }),
    extension: "cbz",
  };
}

async function exportTextChapter(
  series: Series,
  chapter: Chapter,
  pages: Page[],
): Promise<ExportFile> {
  const content: string[] = [];
  for (const page of pages) {
    const blob = await getBlob(page.storageKey);
    if (!blob) throw new Error(`A page is missing from "${chapter.title}".`);
    const text = await blob.text();
    content.push(`<pre>${xmlText(plainText(text, page.mime))}</pre>`);
  }

  const title = `${series.title} - ${chapter.title}`;
  const chapterMarkup = `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${xmlText(title)}</title><meta charset="utf-8" /></head><body>${content.join("\n")}</body></html>`;
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    "OEBPS/package.opf": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${xmlText(chapter.id)}</dc:identifier><dc:title>${xmlText(title)}</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>`,
    ),
    "OEBPS/chapter.xhtml": strToU8(chapterMarkup),
  };
  return {
    name: `${safeName(title)}.epub`,
    blob: new Blob([zipSync(files, { level: 0 })], {
      type: "application/epub+zip",
    }),
    extension: "epub",
  };
}

export async function createChapterExport(
  chapterId: string,
): Promise<ExportFile> {
  const chapter = await getChapter(chapterId);
  if (!chapter) throw new Error("Chapter not found.");
  const series = await getSeries(chapter.seriesId);
  if (!series) throw new Error("Series not found.");
  return readChapterExport(series, chapter);
}

export async function createSeriesExport(seriesId: string): Promise<Blob> {
  const series = await getSeries(seriesId);
  if (!series) throw new Error("Series not found.");
  const chapters = await listChapters(seriesId);
  if (chapters.length === 0) throw new Error("This series has no chapters.");

  const archive: Record<string, Uint8Array> = {};
  for (const [index, chapter] of chapters.entries()) {
    const exported = await readChapterExport(series, chapter);
    const filename = `${String(index + 1).padStart(3, "0")}-${exported.name}`;
    archive[filename] = new Uint8Array(await exported.blob.arrayBuffer());
  }
  return new Blob([zipSync(archive)], { type: "application/zip" });
}
