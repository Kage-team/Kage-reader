const naturalSortCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function naturalSort(left: string, right: string): number {
  return naturalSortCollator.compare(left, right);
}
