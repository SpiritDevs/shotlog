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

/** Read bounded header slices, never the compressed pixel payload. */
export async function imageDimensions(
  blob: Blob,
): Promise<{ width: number; height: number } | undefined> {
  const header = new DataView(await blob.slice(0, 30).arrayBuffer());
  const text = (start: number, length: number) =>
    String.fromCharCode(...new Uint8Array(header.buffer, start, length));
  const dimensions = (width: number, height: number) => {
    if (!width || !height) throw new Error("Image has no pixels");
    return { width, height };
  };
  if (
    header.byteLength >= 24 &&
    header.getUint32(0) === 0x89504e47 &&
    header.getUint32(4) === 0x0d0a1a0a &&
    text(12, 4) === "IHDR"
  )
    return dimensions(header.getUint32(16), header.getUint32(20));
  if (
    header.byteLength >= 10 &&
    (text(0, 6) === "GIF87a" || text(0, 6) === "GIF89a")
  )
    return dimensions(header.getUint16(6, true), header.getUint16(8, true));
  if (
    header.byteLength >= 25 &&
    text(0, 4) === "RIFF" &&
    text(8, 4) === "WEBP"
  ) {
    const kind = text(12, 4);
    if (kind === "VP8X" && header.byteLength >= 30)
      return dimensions(
        (header.getUint32(24, true) & 0xffffff) + 1,
        (header.getUint32(26, true) >>> 8) + 1,
      );
    if (
      kind === "VP8 " &&
      header.byteLength >= 30 &&
      header.getUint8(23) === 0x9d &&
      header.getUint8(24) === 0x01 &&
      header.getUint8(25) === 0x2a
    )
      return dimensions(
        header.getUint16(26, true) & 0x3fff,
        header.getUint16(28, true) & 0x3fff,
      );
    if (kind === "VP8L" && header.getUint8(20) === 0x2f) {
      const bits = header.getUint32(21, true);
      return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
  }
  if (header.byteLength >= 2 && header.getUint16(0) === 0xffd8) {
    for (let offset = 2; offset + 4 <= blob.size; ) {
      const segment = new DataView(
        await blob.slice(offset, offset + 9).arrayBuffer(),
      );
      if (segment.getUint8(0) !== 0xff) break;
      const marker = segment.getUint8(1);
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const length = segment.getUint16(2);
      if (length < 2 || offset + 2 + length > blob.size) break;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker) &&
        length >= 8 &&
        segment.byteLength >= 9
      )
        return dimensions(segment.getUint16(7), segment.getUint16(5));
      offset += 2 + length;
    }
  }
  return undefined;
}
