export const SCHEMA_VERSION = 2;

export type SeriesType = "manga" | "manhwa" | "manhua" | "oel" | "novel";
export type ReaderMode = "flip" | "webtoon" | "novel";

export type Meta = {
  schemaVersion: number;
  persistGranted?: boolean;
};

export type Series = {
  schemaVersion: number;
  id: string;
  title: string;
  type: SeriesType;
  coverPageKey?: string;
  ageRating?: string;
  writer?: string;
  tags?: string[];
  preferredMode?: ReaderMode;
  addedAt: number;
  updatedAt: number;
};

export type Chapter = {
  schemaVersion: number;
  id: string;
  seriesId: string;
  title: string;
  number?: number;
  volume?: number;
  order: number;
  pageCount: number;
  sourceName: string;
  hash: string;
  addedAt: number;
};

export type Page = {
  schemaVersion: number;
  id: string;
  chapterId: string;
  index: number;
  storageKey: string;
  mime: string;
};

export type Progress = {
  schemaVersion: number;
  chapterId: string;
  pageIndex: number;
  scrollRatio: number;
  updatedAt: number;
};

export type Bookmark = {
  schemaVersion: number;
  chapterId: string;
  pageIndex: number;
  createdAt: number;
};
