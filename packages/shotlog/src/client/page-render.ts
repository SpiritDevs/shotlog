import { domToCanvas } from "modern-screenshot";
import { captureSize } from "./capture-size.js";

/** Kept behind capturePage's dynamic import, including the renderer dependency. */
export async function renderPage(
  host: HTMLElement,
): Promise<HTMLCanvasElement> {
  const {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio,
    scrollX,
    scrollY,
  } = window;
  const size = captureSize(width, height, devicePixelRatio);
  const bodyStyle = getComputedStyle(document.body);
  const bodyTransform = bodyStyle.transform;
  const backgroundColor =
    [
      getComputedStyle(document.documentElement).backgroundColor,
      bodyStyle.backgroundColor,
    ].find(
      (color) => color !== "rgba(0, 0, 0, 0)" && color !== "transparent",
    ) ?? "#ffffff";
  const documentHeight = document.documentElement.scrollHeight;
  const mediaMarker = "data-shotlog-capture-media";
  const media = new Map<
    string,
    { placeholder: HTMLElement; styles: [string, string][] }
  >();
  const marker = "data-shotlog-capture-sticky";
  const sticky = new Map<
    string,
    {
      node: HTMLElement;
      previous: string | null;
      x: number;
      y: number;
      transform: string;
    }
  >();
  try {
    // Hidden surrogates preserve layout in the clone without loading/playing media.
    for (const source of Array.from(
      document.querySelectorAll("video, iframe"),
    )) {
      const computed = getComputedStyle(source);
      const key = String(media.size);
      const placeholder = document.createElement("span");
      const styles: [string, string][] = Array.from(computed, (name) => [
        name,
        computed.getPropertyValue(name),
      ]);
      styles.push([
        "display",
        computed.display === "inline" ? "inline-block" : computed.display,
      ]);
      placeholder.setAttribute(mediaMarker, key);
      placeholder.style.setProperty("display", "none", "important");
      media.set(key, { placeholder, styles });
      source.before(placeholder);
    }
    return await domToCanvas(document.documentElement, {
      width,
      height,
      backgroundColor,
      scale: Math.min(size.width / width, size.height / height),
      timeout: 5000,
      features: { restoreScrollPosition: true },
      filter: (node) => {
        // Video cloning can wait indefinitely for seeked (notably srcObject streams).
        if (
          node === host ||
          node instanceof HTMLVideoElement ||
          node instanceof HTMLIFrameElement
        )
          return false;
        if (
          node instanceof HTMLElement &&
          getComputedStyle(node).position === "sticky"
        ) {
          const rect = node.getBoundingClientRect();
          const transform = getComputedStyle(node).transform;
          const position = node.style.getPropertyValue("position");
          const priority = node.style.getPropertyPriority("position");
          // Read its un-stuck location synchronously; restore before the browser paints.
          node.style.setProperty("position", "static", "important");
          const natural = node.getBoundingClientRect();
          if (position) node.style.setProperty("position", position, priority);
          else node.style.removeProperty("position");
          const key = String(sticky.size);
          sticky.set(key, {
            node,
            previous: node.getAttribute(marker),
            x: rect.x - natural.x,
            y: rect.y - natural.y,
            transform,
          });
          node.setAttribute(marker, key);
        }
        return true;
      },
      onCloneEachNode: (node) => {
        if (!(node instanceof HTMLElement)) return;
        const mediaKey = node.getAttribute(mediaMarker);
        const blank = mediaKey === null ? undefined : media.get(mediaKey);
        if (blank) {
          node.removeAttribute(mediaMarker);
          for (const [name, value] of blank.styles)
            node.style.setProperty(name, value, "important");
        }
        const key = node.getAttribute(marker);
        const pinned = key === null ? undefined : sticky.get(key);
        if (!pinned) return;
        node.removeAttribute(marker);
        node.style.setProperty("position", "relative", "important");
        node.style.setProperty("inset", "auto", "important");
        node.style.setProperty(
          "transform",
          `translate(${pinned.x}px, ${pinned.y}px) ${pinned.transform === "none" ? "" : pinned.transform}`,
          "important",
        );
      },
      onCloneNode: (node) => {
        if (!(node instanceof HTMLElement)) return;
        // Move document flow without a transform containing block: viewport-fixed
        // content stays fixed. Retain the library's nested scroller restoration.
        const body = node.querySelector("body");
        if (body)
          body.style.setProperty("transform", bodyTransform, "important");
        node.style.setProperty(
          "height",
          `${Math.max(height, documentHeight)}px`,
          "important",
        );
        node.style.setProperty("position", "relative", "important");
        node.style.setProperty("top", `${-scrollY}px`, "important");
        node.style.setProperty("left", `${-scrollX}px`, "important");
      },
    });
  } finally {
    for (const { placeholder } of media.values()) placeholder.remove();
    for (const { node, previous } of sticky.values()) {
      if (previous === null) node.removeAttribute(marker);
      else node.setAttribute(marker, previous);
    }
  }
}
