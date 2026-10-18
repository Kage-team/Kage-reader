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

function canvasBlob(draw: (context: CanvasRenderingContext2D) => void, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("Canvas is unavailable in the demo environment."));
      return;
    }
    context.scale(0.5, 0.5);
    draw(context);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not rasterize demo artwork."));
    }, "image/webp", 0.78);
  });
}

function coverBlob(title: string, index: number): Promise<Blob> {
  const hue = (index * 37) % 360;
  return canvasBlob((context) => {
    context.fillStyle = `hsl(${hue} 24% 13%)`;
    context.fillRect(0, 0, 720, 1020);
    context.globalAlpha = 0.78;
    context.fillStyle = `hsl(${(hue + 55) % 360} 70% 58%)`;
    context.beginPath();
    context.arc(580, 160, 230, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = `hsl(${(hue + 170) % 360} 46% 30%)`;
    context.beginPath();
    context.moveTo(0, 760);
    context.bezierCurveTo(180, 620, 300, 860, 720, 570);
    context.lineTo(720, 1020);
    context.lineTo(0, 1020);
    context.fill();
    context.fillStyle = "#f4f5f4";
    context.font = "700 42px sans-serif";
    context.fillText(title.slice(0, 24), 54, 850);
    context.fillStyle = "#b8f34a";
    context.font = "24px sans-serif";
    context.fillText(`KAGE DEMO ${index + 1}`, 54, 910);
  }, 360, 510);
}

function pageBlob(title: string, chapter: number, page: number, index: number): Promise<Blob> {
  const hue = (index * 29 + page * 17) % 360;
  return canvasBlob((context) => {
    context.fillStyle = `hsl(${hue} 18% 9%)`;
    context.fillRect(0, 0, 1200, 1600);
    context.fillStyle = `hsl(${hue} 22% 15%)`;
    context.strokeStyle = "rgba(184, 243, 74, .35)";
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(70, 80, 1060, 1440, 24);
    context.fill();
    context.stroke();
    context.globalAlpha = 0.45;
    context.fillStyle = `hsl(${(hue + 70) % 360} 62% 55%)`;
    context.beginPath();
    context.arc(850, 480, 260, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = `hsl(${(hue + 180) % 360} 38% 28%)`;
    context.beginPath();
    context.moveTo(110, 1120);
    context.quadraticCurveTo(560, 820, 1090, 1150);
    context.lineTo(1090, 1450);
    context.lineTo(110, 1450);
    context.fill();
    context.fillStyle = "#b8f34a";
    context.font = "30px sans-serif";
    context.fillText(title.slice(0, 34), 130, 230);
    context.fillStyle = "#f4f5f4";
    context.font = "700 54px sans-serif";
    context.fillText(`Chapter ${chapter}`, 130, 300);
    context.fillStyle = "#929a99";
    context.font = "26px sans-serif";
    context.fillText(`Demo page ${page + 1} · local preview data`, 130, 1370);
  }, 1200, 1600);
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
    await saveBlob(coverKey, await coverBlob(title, seriesIndex));
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
        await saveBlob(storageKey, await pageBlob(title, chapterNumber, pageIndex, seriesIndex));
        await putPage({ schemaVersion: SCHEMA_VERSION, id: `${DEMO_PREFIX}page-${seriesIndex + 1}-${chapterNumber}-${pageIndex + 1}`, chapterId, index: pageIndex, storageKey, mime: "image/png" });
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
