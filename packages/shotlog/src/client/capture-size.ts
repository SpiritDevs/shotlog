export const screenshotLimit = 4 * 1024 * 1024;

/** Bound allocation first; after encoding, use measured bytes with room for PNG overhead. */
export function captureSize(
  width: number,
  height: number,
  pixelRatio = 1,
  encodedBytes = 0,
): { width: number; height: number } {
  const scale = Math.min(
    pixelRatio,
    Math.sqrt(screenshotLimit / (width * height)),
    8192 / Math.max(width, height),
    encodedBytes > screenshotLimit
      ? Math.sqrt(screenshotLimit / encodedBytes) * 0.9
      : Number.POSITIVE_INFINITY,
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}
