import { describe, expect, it } from "vitest";
import { deriveSeriesTitle, groupArchiveEntries } from "./grouping";
import type { ArchiveEntry } from "./types";

function image(name: string): ArchiveEntry {
  return {
    name,
    mime: "image/jpeg",
    blob: new Blob([name], { type: "image/jpeg" }),
  };
}

function text(name: string): ArchiveEntry {
  return {
    name,
    mime: "application/xhtml+xml",
    blob: new Blob([name], { type: "application/xhtml+xml" }),
  };
}

describe("chapter grouping", () => {
  it("uses the parent folder as the series for chapter-named archives", () => {
    expect(deriveSeriesTitle("Uriah/Ch. 011 Rain Named Depth.cbz")).toBe("Uriah");
    expect(deriveSeriesTitle("Uriah/Ch. 010 School Full Of Monsters.cbz")).toBe("Uriah");
  });

  it("groups chapter folders and extracts volume and chapter numbers", () => {
    const groups = groupArchiveEntries([
      image("Volume 1/Chapter 1/001.jpg"),
      image("Volume 1/Chapter 1/002.jpg"),
      image("Volume 1/Chapter 2/001.jpg"),
      image("Volume 2/Chapter 1/001.jpg"),
    ]);

    expect(
      groups.map(({ title, number, volume, entries }) => ({
        title,
        number,
        volume,
        pages: entries.length,
      })),
    ).toEqual([
      { title: "Chapter 1", number: 1, volume: 1, pages: 2 },
      { title: "Chapter 2", number: 2, volume: 1, pages: 1 },
      { title: "Chapter 1", number: 1, volume: 2, pages: 1 },
    ]);
  });

  it("preserves descriptive chapter folder names", () => {
    const groups = groupArchiveEntries([
      image("Volume 1/Chapter 4 - The Reunion/001.jpg"),
      image("Volume 1/Chapter 4 - The Reunion/002.jpg"),
    ]);

    expect(groups.map(({ title }) => title)).toEqual([
      "Chapter 4 - The Reunion",
    ]);
  });

  it("detects chapter markers in flat image filenames", () => {
    const groups = groupArchiveEntries([
      image("Series Chapter 1 page 001.jpg"),
      image("Series Chapter 1 page 002.jpg"),
      image("Series Chapter 2 page 001.jpg"),
      image("Series Chapter 2 page 002.jpg"),
    ]);

    expect(groups.map((group) => [group.title, group.entries.length])).toEqual([
      ["Chapter 1", 2],
      ["Chapter 2", 2],
    ]);
  });

  it("preserves descriptive titles in series-prefixed image filenames", () => {
    const groups = groupArchiveEntries([
      image("Series Name - Chapter 7 - The Reunion page 001.jpg"),
      image("Series Name - Chapter 7 - The Reunion page 002.jpg"),
      image("Series Name - Chapter 8 page 001.jpg"),
      image("Series Name - Chapter 8 page 002.jpg"),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      "Chapter 7 - The Reunion",
      "Chapter 8",
    ]);
  });

  it("keeps prologue labels when a prologue includes a chapter number", () => {
    const groups = groupArchiveEntries([
      image("Berserk/Chapter 1/001.jpg"),
      image("Berserk/Chapter 135 Prologue/001.jpg"),
    ]);

    expect(groups.map(({ title, number }) => [title, number])).toEqual([
      ["Chapter 1", 1],
      ["Prologue", 135],
    ]);
  });

  it("uses paired numeric filename prefixes only when multiple groups are evident", () => {
    const splitGroups = groupArchiveEntries([
      image("001-001.jpg"),
      image("001-002.jpg"),
      image("002-001.jpg"),
      image("002-002.jpg"),
    ]);
    const pageSequence = groupArchiveEntries([
      image("001.jpg"),
      image("002.jpg"),
      image("003.jpg"),
    ]);

    expect(
      splitGroups.map((group) => [group.number, group.entries.length]),
    ).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(pageSequence).toHaveLength(1);
    expect(pageSequence[0]?.entries).toHaveLength(3);
  });

  it("splits multi-document novels into separate chapters", () => {
    const groups = groupArchiveEntries(
      [
        text("OPS/Text/Chapter1.xhtml"),
        text("OPS/Text/Chapter2.xhtml"),
        text("OPS/Text/Chapter3.xhtml"),
      ],
      true,
    );

    expect(groups.map((group) => group.title)).toEqual([
      "Chapter 1",
      "Chapter 2",
      "Chapter 3",
    ]);
    expect(groups.every((group) => group.entries.length === 1)).toBe(true);
  });
});
