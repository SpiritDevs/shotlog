import type { Options } from "modern-screenshot";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderPage } from "../../src/client/page-render.js";

const renderer = vi.hoisted(() =>
  vi.fn<(node: Node, options: Options) => Promise<HTMLCanvasElement>>(),
);
vi.mock("modern-screenshot", () => ({ domToCanvas: renderer }));

class ElementStub {
  nodeType = 1;
  parentElement: ElementStub | null = null;
  childNodes: ElementStub[] = [];
  attributes = new Map<string, string>();
  properties = new Map<string, [string, string]>();
  style = {
    getPropertyValue: (key: string) => this.properties.get(key)?.[0] ?? "",
    getPropertyPriority: (key: string) => this.properties.get(key)?.[1] ?? "",
    setProperty: (key: string, value: string, priority: string) =>
      this.properties.set(key, [value, priority]),
    removeProperty: (key: string) => this.properties.delete(key),
  };
  constructor(readonly tagName = "div") {}
  getAttribute(key: string) {
    return this.attributes.get(key) ?? null;
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  removeAttribute(key: string) {
    this.attributes.delete(key);
  }
  matches(selector: string) {
    return selector.split(", ").includes(this.tagName);
  }
  insertBefore(node: ElementStub, next: ElementStub | null) {
    this.childNodes.splice(
      next ? this.childNodes.indexOf(next) : this.childNodes.length,
      0,
      node,
    );
  }
  getBoundingClientRect() {
    return { x: 0, y: 0 };
  }
}
class VideoStub extends ElementStub {}
class IframeStub extends ElementStub {}
const asNode = (node: ElementStub) => node as unknown as Node;
const host = () => new ElementStub() as unknown as HTMLElement;

beforeEach(() => {
  vi.stubGlobal("Element", ElementStub);
  vi.stubGlobal("HTMLElement", ElementStub);
  vi.stubGlobal("HTMLVideoElement", VideoStub);
  vi.stubGlobal("HTMLIFrameElement", IframeStub);
  vi.stubGlobal("window", {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
  });
  vi.stubGlobal("getComputedStyle", (node: ElementStub) =>
    Object.assign(["width", "height", "display"], {
      display: "inline",
      position: node.style.getPropertyValue("position"),
      transform: "none",
      backgroundColor: "white",
      getPropertyValue: (name: string) =>
        name === "display" ? "inline" : "280px",
    }),
  );
  vi.stubGlobal("document", {
    documentElement: Object.assign(new ElementStub(), { scrollHeight: 900 }),
    body: new ElementStub(),
    querySelectorAll: () => [],
    createElement: (tag: string) => new ElementStub(tag),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  renderer.mockReset();
});

test("media placeholders are inserted only in the clone, at their original positions, with markers restored", async () => {
  const parent = new ElementStub(),
    video = new VideoStub(),
    iframe = new IframeStub();
  const text = new ElementStub();
  text.nodeType = 3;
  const comment = new ElementStub();
  comment.nodeType = 8;
  const tail = new ElementStub("p");
  parent.childNodes = [
    text,
    video,
    new ElementStub("script"),
    comment,
    iframe,
    tail,
  ];
  video.parentElement = iframe.parentElement = parent;
  parent.setAttribute("data-shotlog-capture-media", "original");
  const before = [...parent.childNodes];
  vi.spyOn(document, "querySelectorAll").mockReturnValue([
    video,
    iframe,
  ] as unknown as NodeListOf<Element>);
  renderer.mockImplementation(async (_, options) => {
    expect(parent.childNodes).toEqual(before);
    expect(options.filter?.(asNode(video))).toBe(false);
    expect(options.filter?.(asNode(iframe))).toBe(false);
    const clone = new ElementStub();
    clone.attributes = new Map(parent.attributes);
    clone.childNodes = [text, tail];
    await options.onCloneEachNode?.(asNode(clone));
    expect(clone.childNodes.map((node) => node.tagName)).toEqual([
      "div",
      "span",
      "span",
      "p",
    ]);
    expect(clone.childNodes[1]?.style.getPropertyValue("display")).toBe(
      "inline-block",
    );
    expect(clone.childNodes[2]?.style.getPropertyValue("width")).toBe("280px");
    expect(parent.childNodes).toEqual(before);
    throw new Error("Encoding failed");
  });
  await expect(renderPage(host())).rejects.toThrow("Encoding failed");
  expect(parent.getAttribute("data-shotlog-capture-media")).toBe("original");
});

test("a failed sticky measurement restores the original inline position and priority", async () => {
  const sticky = new ElementStub();
  sticky.style.setProperty("position", "sticky", "important");
  vi.spyOn(sticky, "getBoundingClientRect").mockImplementation(() => {
    if (sticky.style.getPropertyValue("position") === "static")
      throw new Error("Measurement failed");
    return { x: 0, y: 20 };
  });
  renderer.mockImplementation(async (_, options) => {
    options.filter?.(asNode(sticky));
    throw new Error("Unreachable");
  });
  await expect(renderPage(host())).rejects.toThrow("Measurement failed");
  expect(sticky.style.getPropertyValue("position")).toBe("sticky");
  expect(sticky.style.getPropertyPriority("position")).toBe("important");
});
