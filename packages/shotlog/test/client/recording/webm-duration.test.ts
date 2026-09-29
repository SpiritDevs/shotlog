import { expect, test } from "vitest";
import { withWebmDuration } from "../../../src/client/recording/webm-duration.js";

const element = (id: number[], payload: number[]) => {
  if (payload.length > 126) throw new Error("test payloads fit one size byte");
  return [...id, 0x80 | payload.length, ...payload];
};
// What MediaRecorder writes: an EBML header, then a live Segment of unknown size.
const header = element(
  [0x1a, 0x45, 0xdf, 0xa3],
  element([0x42, 0x82], [0x77, 0x65, 0x62, 0x6d]),
);
const info = element(
  [0x15, 0x49, 0xa9, 0x66],
  [
    ...element([0x2a, 0xd7, 0xb1], [0x0f, 0x42, 0x40]),
    ...element([0x4d, 0x80], [0x43, 0x68]),
  ],
);
const cluster = [
  0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 1, 2,
  3,
];
const live = (children: number[]) =>
  new Blob(
    [
      new Uint8Array([
        ...header,
        0x18,
        0x53,
        0x80,
        0x67,
        0x01,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        ...children,
      ]),
    ],
    { type: "video/webm" },
  );

function durationOf(bytes: Uint8Array): number | undefined {
  for (let at = 0; at + 11 <= bytes.length; at++)
    if (bytes[at] === 0x44 && bytes[at + 1] === 0x89 && bytes[at + 2] === 0x88)
      return new DataView(
        bytes.buffer,
        bytes.byteOffset + at + 3,
        8,
      ).getFloat64(0);
  return undefined;
}

test("writes the duration into Info and keeps every other byte", async () => {
  const fixed = await withWebmDuration(live([...info, ...cluster]), 14_709);
  const bytes = new Uint8Array(await fixed.arrayBuffer());
  expect(durationOf(bytes)).toBe(14_709);
  expect(fixed.type).toBe("video/webm");
  // The muxing app survives, and the cluster follows unchanged.
  expect(Array.from(bytes)).toEqual(
    expect.arrayContaining([0x4d, 0x80, 0x82, 0x43, 0x68]),
  );
  expect(Array.from(bytes.slice(-cluster.length))).toEqual(cluster);
  // Running it again replaces the duration rather than adding a second one.
  const again = new Uint8Array(
    await (await withWebmDuration(fixed, 2_000)).arrayBuffer(),
  );
  expect(durationOf(again)).toBe(2_000);
  expect(again.length).toBe(bytes.length);
});

test("leaves anything unexpected alone", async () => {
  const seekHead = live([0x11, 0x4d, 0x9b, 0x74, 0x80, ...info, ...cluster]);
  expect(await withWebmDuration(seekHead, 1000)).toBe(seekHead);
  const mp4 = new Blob([new Uint8Array([0, 0, 0, 24])], { type: "video/mp4" });
  expect(await withWebmDuration(mp4, 1000)).toBe(mp4);
  const truncated = new Blob([new Uint8Array(header)], { type: "video/webm" });
  expect(await withWebmDuration(truncated, 1000)).toBe(truncated);
});
