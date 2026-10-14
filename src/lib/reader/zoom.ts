export interface ZoomTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export function translateAtFocalPoint(
  focalPoint: number,
  oldTranslate: number,
  oldScale: number,
  newScale: number,
): number {
  return focalPoint - (focalPoint - oldTranslate) * (newScale / oldScale);
}
