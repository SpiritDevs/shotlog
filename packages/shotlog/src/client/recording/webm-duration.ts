const EBML = 0x1a45dfa3;
const Segment = 0x18538067;
const SeekHead = 0x114d9b74;
const Info = 0x1549a966;
const Cluster = 0x1f43b675;
const TimecodeScale = 0x2ad7b1;
const Duration = 0x4489;

interface Element {
  readonly id: number;
  readonly start: number;
  readonly dataStart: number;
  /** Undefined for an unknown size, as a live recording writes for its Segment. */
  readonly size: number | undefined;
}

function readElement(bytes: Uint8Array, start: number): Element | undefined {
  const first = bytes[start];
  if (first === undefined) return undefined;
  const idLength = Math.clz32(first) - 23;
  if (idLength < 1 || idLength > 4) return undefined;
  let id = 0;
  for (let index = 0; index < idLength; index++)
    id = id * 256 + (bytes[start + index] ?? 0);
  const sizeAt = start + idLength;
  const lead = bytes[sizeAt];
  if (lead === undefined) return undefined;
  const sizeLength = Math.clz32(lead) - 23;
  if (sizeLength < 1 || sizeLength > 8 || sizeAt + sizeLength > bytes.length)
    return undefined;
  let size = lead & (0xff >> sizeLength);
  let unknown = size === 0xff >> sizeLength;
  for (let index = 1; index < sizeLength; index++) {
    const byte = bytes[sizeAt + index] ?? 0;
    size = size * 256 + byte;
    unknown &&= byte === 0xff;
  }
  return {
    id,
    start,
    dataStart: sizeAt + sizeLength,
    size: unknown ? undefined : size,
  };
}

/**
 * MediaRecorder writes WebM as a live stream with no duration, so players can't show its length
 * or seek until they've read it all. Writes the measured duration into the Segment's Info.
 * Anything unexpected leaves the video as it was.
 */
export async function withWebmDuration(
  video: Blob,
  durationMs: number,
): Promise<Blob> {
  if (!video.type.startsWith("video/webm")) return video;
  try {
    const head = new Uint8Array(await video.slice(0, 65_536).arrayBuffer());
    const header = readElement(head, 0);
    if (header?.id !== EBML || header.size === undefined) return video;
    const segment = readElement(head, header.dataStart + header.size);
    // A sized Segment, or a SeekHead's offsets, would need rewriting too.
    if (segment?.id !== Segment || segment.size !== undefined) return video;
    let info: Element | undefined;
    for (let at = segment.dataStart; at < head.length; ) {
      const element = readElement(head, at);
      if (!element || element.size === undefined) return video;
      if (element.id === SeekHead || element.id === Cluster) return video;
      if (element.id === Info) {
        info = element;
        break;
      }
      at = element.dataStart + element.size;
    }
    if (info?.size === undefined) return video;
    const end = info.dataStart + info.size;
    if (end > head.length) return video;
    const children: Uint8Array<ArrayBuffer>[] = [];
    let scale = 1_000_000;
    for (let at = info.dataStart; at < end; ) {
      const child = readElement(head, at);
      if (!child || child.size === undefined) return video;
      const next = child.dataStart + child.size;
      if (child.id === TimecodeScale) {
        scale = 0;
        for (let index = child.dataStart; index < next; index++)
          scale = scale * 256 + (head[index] ?? 0);
      }
      if (child.id !== Duration) children.push(head.subarray(at, next));
      at = next;
    }
    if (!scale) return video;
    const duration = new Uint8Array(11);
    duration.set([0x44, 0x89, 0x88]);
    new DataView(duration.buffer).setFloat64(3, (durationMs * 1e6) / scale);
    const payload = [...children, duration];
    const length = payload.reduce((total, part) => total + part.length, 0);
    const size = new Uint8Array(8);
    new DataView(size.buffer).setUint32(4, length);
    size[0] = 0x01;
    return new Blob(
      [
        head.subarray(0, info.start),
        new Uint8Array([0x15, 0x49, 0xa9, 0x66]),
        size,
        ...payload,
        video.slice(end),
      ],
      { type: video.type },
    );
  } catch {
    return video;
  }
}
