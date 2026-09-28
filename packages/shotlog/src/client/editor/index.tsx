import { createRoot } from "react-dom/client";
import type { ShotlogLabels } from "../types.js";
import { Editor } from "./editor.js";
import { emptyScene, type Scene } from "./model.js";

export interface EditableScreenshot {
  readonly original: Blob;
  readonly scene: Scene;
  readonly blob: Blob;
}

/** Loaded only after capture. The original and scene stay in the card's memory. */
export async function editScreenshot(
  original: Blob,
  host: HTMLElement,
  labels: ShotlogLabels,
  signal: AbortSignal,
  scene = emptyScene(),
): Promise<EditableScreenshot | undefined> {
  const url = URL.createObjectURL(original),
    image = new Image();
  try {
    image.src = url;
    await image.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  if (signal.aborted) return undefined;
  const parent = host.shadowRoot?.querySelector(".shotlog");
  if (!parent) return undefined;
  const container = document.createElement("div");
  parent.append(container);
  const root = createRoot(container);
  const card = parent.querySelector<HTMLElement>(".card");
  // Keep the underlying dialog out of the accessibility tree while this modal owns focus.
  card?.setAttribute("aria-hidden", "true");
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result: { blob: Blob; scene: Scene } | undefined) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abort);
      root.unmount();
      container.remove();
      card?.removeAttribute("aria-hidden");
      resolve(result ? { ...result, original } : undefined);
    };
    const abort = () => finish(undefined);
    signal.addEventListener("abort", abort, { once: true });
    root.render(
      <Editor
        image={image}
        initial={scene}
        labels={labels}
        onFinish={finish}
      />,
    );
  });
}
