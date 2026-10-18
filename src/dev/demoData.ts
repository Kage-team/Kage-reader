import {
  deleteSeriesWithContents,
  listAllChapters,
  listAllPages,
  listBookmarks,
  listProgress,
  listSeries,
  putBookmark,
  putChapter,
  putPage,
  putProgress,
  putSeries,
  saveBlob,
} from "../lib/storage/db";
import { SCHEMA_VERSION, type Chapter, type Series } from "../lib/storage/types";

export const DEMO_PREFIX = "demo-kage-";
const DEMO_SERIES_PREFIX = `${DEMO_PREFIX}series-`;
const DEMO_PAGE_PREFIX = `${DEMO_PREFIX}page-`;
const DEMO_BLOB_PREFIX = `${DEMO_PREFIX}blob-`;

const demoTitles = [
  ["Neon Pilgrims", "manga"],
  ["The Cartographer of Hollow Moons", "manhwa"],
  ["A Very Long Title That Tests Every Library Header And Card Layout In Kage Reader", "novel"],
  ["Paper Tigers", "manhua"],
  ["Northbound", "oel"],
  ["Afterimage Protocol", "manga"],
  ["The Orchard at Dusk", "novel"],
  ["Blue Static", "manhwa"],
  ["Small Gods of the Underpass", "manga"],
  ["Second Sunrise", "oel"],
  ["Signal / Noise", "manhua"],
  ["Forty Steps to Winter", "manga"],
] as const;

function svgBlob(title: string, index: number): Blob {
  const hue = (index * 37) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1020" viewBox="0 0 720 1020"><rect width="720" height="1020" fill="hsl(${hue} 24% 13%)"/><circle cx="580" cy="160" r="230" fill="hsl(${(hue + 55) % 360} 70% 58%)" opacity=".78"/><path d="M0 760C180 620 300 860 720 570V1020H0Z" fill="hsl(${(hue + 170) % 360} 46% 30%)"/><text x="54" y="850" fill="#f4f5f4" font-family="sans-serif" font-size="42" font-weight="700">${title.slice(0, 24)}</text><text x="54" y="910" fill="#b8f34a" font-family="sans-serif" font-size="24">KAGE DEMO ${index + 1}</text></svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

function pageSvg(title: string, chapter: number, page: number, index: number): Blob {
  const hue = (index * 29 + page * 17) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="hsl(${hue} 18% 9%)"/><rect x="70" y="80" width="1060" height="1440" rx="24" fill="hsl(${hue} 22% 15%)" stroke="#b8f34a" stroke-opacity=".35"/><circle cx="850" cy="480" r="260" fill="hsl(${(hue + 70) % 360} 62% 55%)" opacity=".45"/><path d="M110 1120 Q 560 820 1090 1150 L1090 1450 L110 1450Z" fill="hsl(${(hue + 180) % 360} 38% 28%)"/><text x="130" y="230" fill="#b8f34a" font-family="sans-serif" font-size="30">${title.slice(0, 34)}</text><text x="130" y="300" fill="#f4f5f4" font-family="sans-serif" font-size="54" font-weight="700">Chapter ${chapter}</text><text x="130" y="1370" fill="#929a99" font-family="sans-serif" font-size="26">Demo page ${page + 1} · local preview data</text></svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

function chapterCount(index: number): number {
  if (index === 11) return 40;
  if (index === 4) return 1;
  return 3 + (index % 5);
}

export type DemoReport = {
  series: number;
  chapters: number;
  pages: number;
  blobs: number;
  progress: number;
  bookmarks: number;
  remaining: { series: number; chapters: number; pages: number; progress: number; bookmarks: number };
};

export async function loadDemoLibrary(): Promise<DemoReport> {
  const existing = (await listSeries()).filter((series) => series.id.startsWith(DEMO_SERIES_PREFIX));
  if (existing.length) return report();

  const now = Date.now();
  let chapterTotal = 0;
  let pageTotal = 0;
  let blobTotal = 0;
  let progressTotal = 0;
  let bookmarkTotal = 0;

  for (let seriesIndex = 0; seriesIndex < demoTitles.length; seriesIndex += 1) {
    const [title, type] = demoTitles[seriesIndex];
    const seriesId = `${DEMO_SERIES_PREFIX}${seriesIndex + 1}`;
    const coverKey = `${DEMO_BLOB_PREFIX}cover-${seriesIndex + 1}`;
    const series: Series = { schemaVersion: SCHEMA_VERSION, id: seriesId, title, type, coverPageKey: coverKey, ageRating: seriesIndex % 5 === 2 ? "18+" : "Teen", writer: "Kage demo studio", summary: "Fictional local preview data for testing Kage Reader layouts and reading flows.", tags: ["demo", type], isFavorite: [0, 3, 7].includes(seriesIndex), queueOrder: [1, 5, 10].includes(seriesIndex) ? seriesIndex + 1 : undefined, addedAt: now - seriesIndex * 86400000, updatedAt: now - seriesIndex * 3600000 };
    await saveBlob(coverKey, svgBlob(title, seriesIndex));
    await putSeries(series);
    blobTotal += 1;

    const total = chapterCount(seriesIndex);
    for (let chapterIndex = 0; chapterIndex < total; chapterIndex += 1) {
      const chapterNumber = chapterIndex + 1;
      const chapterId = `${DEMO_PREFIX}chapter-${seriesIndex + 1}-${chapterNumber}`;
      const chapter: Chapter = { schemaVersion: SCHEMA_VERSION, id: chapterId, seriesId, title: `Chapter ${chapterNumber}`, number: chapterNumber, order: chapterIndex, pageCount: 3 + ((chapterIndex + seriesIndex) % 4), sourceName: `Kage demo · ${title}`, hash: `${DEMO_PREFIX}hash-${seriesIndex}-${chapterNumber}`, addedAt: now - (seriesIndex * 3 + chapterIndex) * 3600000 };
      await putChapter(chapter);
      chapterTotal += 1;
      for (let pageIndex = 0; pageIndex < chapter.pageCount; pageIndex += 1) {
        const storageKey = `${DEMO_PAGE_PREFIX}${seriesIndex + 1}-${chapterNumber}-${pageIndex + 1}`;
        await saveBlob(storageKey, pageSvg(title, chapterNumber, pageIndex, seriesIndex));
        await putPage({ schemaVersion: SCHEMA_VERSION, id: `${DEMO_PREFIX}page-${seriesIndex + 1}-${chapterNumber}-${pageIndex + 1}`, chapterId, index: pageIndex, storageKey, mime: "image/svg+xml" });
        pageTotal += 1;
        blobTotal += 1;
      }
      if (seriesIndex < 6 && chapterIndex === Math.min(1, total - 1)) {
        const ratio = seriesIndex === 0 ? 0 : seriesIndex === 1 ? 0.42 : seriesIndex === 2 ? 1 : 0.72;
        await putProgress({ schemaVersion: SCHEMA_VERSION, chapterId, pageIndex: Math.min(chapter.pageCount - 1, Math.round(ratio * chapter.pageCount)), scrollRatio: ratio, updatedAt: now - seriesIndex * 86400000, completedAt: ratio === 1 ? now - seriesIndex * 86400000 : undefined, timeSpentSeconds: 420 + seriesIndex * 90 });
        progressTotal += 1;
        if ([1, 4].includes(seriesIndex)) {
          await putBookmark({ schemaVersion: SCHEMA_VERSION, chapterId, pageIndex: Math.min(1, chapter.pageCount - 1), createdAt: now - (seriesIndex === 1 ? 86400000 : 3 * 86400000), note: "Demo bookmark for testing reader HUD." });
          bookmarkTotal += 1;
        }
      }
    }
  }
  return { ...(await report()), series: demoTitles.length, chapters: chapterTotal, pages: pageTotal, blobs: blobTotal, progress: progressTotal, bookmarks: bookmarkTotal };
}

export async function removeDemoLibrary(): Promise<DemoReport> {
  const demoSeries = (await listSeries()).filter((series) => series.id.startsWith(DEMO_SERIES_PREFIX));
  for (const series of demoSeries) await deleteSeriesWithContents(series.id);
  const remaining = await report();
  return { ...remaining, series: demoSeries.length, chapters: 0, pages: 0, blobs: 0, progress: 0, bookmarks: 0 };
}

async function report(): Promise<DemoReport> {
  const [series, chapters, pages, progress, bookmarks] = await Promise.all([listSeries(), listAllChapters(), listAllPages(), listProgress(), listBookmarks()]);
  return { series: series.filter((item) => item.id.startsWith(DEMO_SERIES_PREFIX)).length, chapters: chapters.filter((item) => item.id.startsWith(DEMO_PREFIX)).length, pages: pages.filter((item) => item.id.startsWith(DEMO_PREFIX)).length, blobs: 0, progress: progress.filter((item) => item.chapterId.startsWith(DEMO_PREFIX)).length, bookmarks: bookmarks.filter((item) => item.chapterId.startsWith(DEMO_PREFIX)).length, remaining: { series: series.length, chapters: chapters.length, pages: pages.length, progress: progress.length, bookmarks: bookmarks.length } };
}
