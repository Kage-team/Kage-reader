export const SCHEMA_VERSION = 4;

export type SeriesType = "manga" | "manhwa" | "manhua" | "oel" | "novel";
export type ReaderMode = "flip" | "webtoon" | "novel";
export type ReadingDirection = "ltr" | "rtl";

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
  summary?: string;
  tags?: string[];
  isFavorite?: boolean;
  preferredMode?: ReaderMode;
  preferredDirection?: ReadingDirection;
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
  id: string;
  chapterId: string;
  pageIndex: number;
  createdAt: number;
  note: string;
};

export type BookmarkInput = Omit<Bookmark, "id" | "note"> &
  Partial<Pick<Bookmark, "id" | "note">>;

export type LinkedFolder = {
  id: "primary";
  handle: FileSystemDirectoryHandle;
  linkedAt: number;
};
