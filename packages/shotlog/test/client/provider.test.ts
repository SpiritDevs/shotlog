import {
  type ComponentProps,
  type DependencyList,
  type EffectCallback,
  isValidElement,
  type ReactNode,
  type SetStateAction,
} from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ShotlogProvider } from "../../src/client/provider.js";
import { ReportCard } from "../../src/client/report-card.js";
import { ScreenshotControls } from "../../src/client/screenshot-controls.js";
import type {
  ShotlogControls,
  ShotlogProviderProps,
  ShotlogSubmission,
} from "../../src/client/types.js";

// Drive provider callbacks and effects without rendering its DOM children. Keeping
// effects explicit lets the success callback unmount before persistence can run.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  dirty: false,
  slots: [] as { value: unknown; deps: DependencyList | undefined }[],
  effects: [] as EffectCallback[],
  cleanups: [] as (() => void)[],
  memo<T>(factory: () => T, deps: DependencyList | undefined): T {
    const index = this.cursor++;
    const slot = this.slots[index];
    if (
      !slot ||
      !deps ||
      !slot.deps ||
      deps.some((value, offset) => !Object.is(value, slot.deps?.[offset]))
    )
      this.slots[index] = { value: factory(), deps };
    return this.slots[index]?.value as T;
  },
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useMemo: <T>(factory: () => T, deps: DependencyList) =>
    hooks.memo(factory, deps),
  useCallback: <T>(callback: T, deps: DependencyList) =>
    hooks.memo(() => callback, deps),
  useRef: <T>(initial: T) => hooks.memo(() => ({ current: initial }), []),
  useId: () => hooks.memo(() => "report-card", []),
  useState: <T>(initial: T) => {
    const cell = hooks.memo(() => ({ value: initial }), []);
    return [
      cell.value,
      (next: SetStateAction<T>) => {
        cell.value =
          typeof next === "function"
            ? (next as (previous: T) => T)(cell.value)
            : next;
        hooks.dirty = true;
      },
    ];
  },
  useEffect: (effect: EffectCallback, deps: DependencyList | undefined) => {
    hooks.memo(() => hooks.effects.push(effect), deps);
  },
}));
vi.mock("react-dom", () => ({ createPortal: (child: ReactNode) => child }));
vi.mock("../../src/client/environment.js", () => ({
  captureEnvironment: () => ({ url: "https://example.test/page" }),
}));

function unmount() {
  for (const cleanup of hooks.cleanups.splice(0)) cleanup();
  hooks.slots = [];
  hooks.effects = [];
}

function mount(props: ShotlogProviderProps) {
  const render = () => {
    let tree: ReturnType<typeof ShotlogProvider>;
    do {
      hooks.cursor = 0;
      hooks.dirty = false;
      tree = ShotlogProvider(props);
      if (hooks.dirty) {
        hooks.effects = [];
        continue;
      }
      for (const effect of hooks.effects.splice(0)) {
        const cleanup = effect();
        if (cleanup) hooks.cleanups.push(cleanup);
      }
    } while (hooks.dirty);
    return tree;
  };
  const tree = render();
  const { value } = tree.props as { value: ShotlogControls };
  value.open();
  const card = () => {
    const card = findCard(render());
    if (!card) throw new Error("Report Card was not rendered");
    return card;
  };
  return Object.assign(card, {
    controls: () => (render().props as { value: ShotlogControls }).value,
    rerender: (next: ShotlogProviderProps) => {
      props = next;
      render();
    },
  });
}

function findCard(
  node: ReactNode,
): ComponentProps<typeof ReportCard> | undefined {
  if (Array.isArray(node)) {
    for (const child of node as ReactNode[]) {
      const found = findCard(child);
      if (found) return found;
    }
  } else if (isValidElement<{ children?: ReactNode }>(node)) {
    if (node.type === ReportCard)
      return node.props as ComponentProps<typeof ReportCard>;
    return findCard(node.props.children);
  }
  return undefined;
}

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("document", {
    body: { append: () => {} },
    createElement: () => ({
      setAttribute: () => {},
      attachShadow: () => ({ append: () => {} }),
      remove: () => {},
    }),
  });
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

test.each(["type", "description"] as const)(
  "an attempted draft survives reload and retries, but editing %s gets a new identity",
  async (field) => {
    const onSubmit = vi.fn<NonNullable<ShotlogProviderProps["onSubmit"]>>(
      async () => {
        throw new Error("Delivered, but acknowledgement lost");
      },
    );
    const props = { onSubmit, diagnostics: false } as const;
    const card = mount(props);
    card().onChange({ type: "Bug", description: "Original report" });
    card().onSubmit();
    const stored: unknown = JSON.parse(
      sessionStorage.getItem("shotlog:draft") ?? "null",
    );
    expect(stored).toMatchObject({ identity: { attempted: true } });
    await new Promise(setImmediate);
    const first = onSubmit.mock.calls[0]?.[0].log;
    expect(first).toBeDefined();
    expect(first).not.toHaveProperty("attempted");

    unmount();
    const retry = mount(props);
    expect(retry().state).toBe("idle");
    retry().onSubmit();
    await new Promise(setImmediate);
    expect(onSubmit.mock.calls[1]?.[0].log.id).toBe(first?.id);

    unmount();
    const reloaded = mount(props);
    expect(reloaded().state).toBe("idle");
    reloaded().onChange({
      ...reloaded().draft,
      [field]: field === "type" ? "Idea" : "Changed report",
    });
    reloaded().onSubmit();
    await new Promise(setImmediate);
    const changed = onSubmit.mock.calls[2]?.[0].log;
    expect(changed).toBeDefined();
    expect(changed?.id).not.toBe(first?.id);
    expect(changed).not.toHaveProperty("attempted");
  },
);

test("success clears the stored draft before onSubmitted unmounts the provider", async () => {
  let storedAtCallback: string | null | undefined;
  const onSubmitted = vi.fn(() => {
    storedAtCallback = sessionStorage.getItem("shotlog:draft");
    unmount();
  });
  const card = mount({
    diagnostics: false,
    onSubmit: async (_submission: ShotlogSubmission) => {},
    onSubmitted,
  });
  card().onChange({ type: "Bug", description: "Delivered report" });
  card().onSubmit();
  expect(sessionStorage.getItem("shotlog:draft")).not.toBeNull();
  await new Promise(setImmediate);
  expect(onSubmitted).toHaveBeenCalledOnce();
  expect(storedAtCallback).toBeNull();
  expect(sessionStorage.getItem("shotlog:draft")).toBeNull();
});

function screenshotProps(card: ComponentProps<typeof ReportCard>) {
  const controls = card.screenshotControls;
  if (
    !isValidElement<ComponentProps<typeof ScreenshotControls>>(controls) ||
    controls.type !== ScreenshotControls
  )
    throw new Error("Screenshot controls were not rendered");
  return controls.props;
}

test("capture ownership and errors survive closing and reopening the card", () => {
  const card = mount({ diagnostics: false, onSubmit: async () => {} });
  const first = screenshotProps(card());
  const release = first.acquireCapture();
  expect(release).toBeTypeOf("function");
  card().onClose();
  // Reopening uses the same provider hooks, with a new card and controls instance.
  const reopened = mount({ diagnostics: false, onSubmit: async () => {} });
  expect(screenshotProps(reopened()).busy).toBe(true);
  expect(screenshotProps(reopened()).acquireCapture()).toBeUndefined();
  first.onError("Capture failed");
  release?.();
  expect(screenshotProps(reopened()).busy).toBe(false);
  expect(screenshotProps(reopened()).error).toBe("Capture failed");
  const finishNext = screenshotProps(reopened()).acquireCapture();
  release?.(); // A stale release cannot clear the next operation.
  expect(screenshotProps(reopened()).busy).toBe(true);
  finishNext?.();
});

test("an attachment finishing after typing persists the latest draft and resets an attempted identity", async () => {
  const card = mount({
    diagnostics: false,
    onSubmit: async () => {
      throw new Error("Lost response");
    },
  });
  card().onChange({ type: "Bug", description: "Original" });
  card().onSubmit();
  await new Promise(setImmediate);
  const delayedAttachment = screenshotProps(card()).onChange;
  card().onChange({ type: "Idea", description: "Typed while decoding" });
  card();
  delayedAttachment(new Blob(["image"]));
  expect(JSON.parse(sessionStorage.getItem("shotlog:draft") ?? "null")).toEqual(
    {
      type: "Idea",
      description: "Typed while decoding",
      identity: null,
    },
  );
});

test("switching scopes isolates drafts, pending IDs, screenshots, and late work", async () => {
  let finish: (() => void) | undefined;
  const onSubmit = vi.fn<NonNullable<ShotlogProviderProps["onSubmit"]>>(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const props = { diagnostics: false, onSubmit, draftScope: "A" } as const;
  const card = mount(props);
  card().onChange({ type: "Idea", description: "Private A" });
  screenshotProps(card()).onChange(new Blob(["A"]));
  card().onSubmit();
  await new Promise(setImmediate);
  const a = onSubmit.mock.calls[0]?.[0].log.id;
  const lateCapture = screenshotProps(card());
  lateCapture.acquireCapture();
  card.rerender({ ...props, draftScope: "B" });
  expect(card().draft).toEqual({ type: "Bug", description: "" });
  expect(screenshotProps(card()).screenshot).toBeUndefined();
  expect(screenshotProps(card()).busy).toBe(false);
  lateCapture.onChange(new Blob(["late A"]));
  lateCapture.onError("A error");
  card().onChange({ type: "Question", description: "Private B" });
  finish?.();
  await new Promise(setImmediate);
  expect(card().state).toBe("idle");
  expect(card().draft.description).toBe("Private B");
  expect(screenshotProps(card()).screenshot).toBeUndefined();
  expect(screenshotProps(card()).error).toBe("");
  onSubmit.mockRejectedValue(new Error("Lost response"));
  card().onSubmit();
  await new Promise(setImmediate);
  const b = onSubmit.mock.calls[1]?.[0].log.id;
  expect(b).toBeDefined();
  expect(b).not.toBe(a);
  card.rerender(props);
  expect(card().draft).toEqual({ type: "Idea", description: "Private A" });
  card().onSubmit();
  await new Promise(setImmediate);
  expect(onSubmit.mock.calls[2]?.[0].log.id).toBe(a);
  card.rerender({ ...props, draftScope: "B" });
  expect(card().draft.description).toBe("Private B");
  card().onSubmit();
  await new Promise(setImmediate);
  expect(onSubmit.mock.calls[3]?.[0].log.id).toBe(b);
  expect(sessionStorage.getItem("shotlog:draft")).toBeNull();
});

test("persistDraft false keeps text and retry identity only in memory", async () => {
  const onSubmit = vi.fn<NonNullable<ShotlogProviderProps["onSubmit"]>>(
    async () => {
      throw new Error("Lost response");
    },
  );
  const props = { diagnostics: false, onSubmit, persistDraft: false } as const;
  sessionStorage.setItem(
    "shotlog:draft",
    JSON.stringify({ type: "Bug", description: "Stored" }),
  );
  const get = vi.spyOn(sessionStorage, "getItem");
  const set = vi.spyOn(sessionStorage, "setItem");
  const card = mount(props);
  expect(card().draft.description).toBe("");
  card().onChange({ type: "Bug", description: "Memory only" });
  card().onSubmit();
  await new Promise(setImmediate);
  card().onClose();
  card.controls().open();
  expect(card().draft.description).toBe("Memory only");
  card().onSubmit();
  await new Promise(setImmediate);
  expect(onSubmit.mock.calls[1]?.[0].log.id).toBe(
    onSubmit.mock.calls[0]?.[0].log.id,
  );
  expect(get).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
  unmount();
  expect(mount(props)().draft.description).toBe("");
});

test("clearDraft removes only the current scope and fences pending work", async () => {
  let finish: (() => void) | undefined;
  const onSubmitted = vi.fn();
  const onSubmit = vi.fn<NonNullable<ShotlogProviderProps["onSubmit"]>>(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const card = mount({
    diagnostics: false,
    draftScope: "A",
    onSubmit,
    onSubmitted,
  });
  sessionStorage.setItem("shotlog:draft:B", "untouched");
  card().onChange({ type: "Idea", description: "Clear me" });
  screenshotProps(card()).onChange(new Blob(["image"]));
  card().onSubmit();
  await new Promise(setImmediate);
  const lateCapture = screenshotProps(card());
  const release = lateCapture.acquireCapture();
  card.controls().clearDraft();
  lateCapture.onChange(new Blob(["late"]));
  lateCapture.onError("late error");
  release?.();
  finish?.();
  await new Promise(setImmediate);
  expect(card().draft).toEqual({ type: "Bug", description: "" });
  expect(card().state).toBe("idle");
  expect(screenshotProps(card())).toMatchObject({
    screenshot: undefined,
    busy: false,
    error: "",
  });
  expect(sessionStorage.getItem("shotlog:draft:A")).toBeNull();
  expect(sessionStorage.getItem("shotlog:draft:B")).toBe("untouched");
  expect(onSubmitted).not.toHaveBeenCalled();
  onSubmit.mockResolvedValue(undefined);
  card().onChange({ type: "Bug", description: "New report" });
  card().onSubmit();
  await new Promise(setImmediate);
  expect(onSubmit.mock.calls[1]?.[0].log.id).not.toBe(
    onSubmit.mock.calls[0]?.[0].log.id,
  );
});

test("custom Type options translate default values and deliver values rather than labels", async () => {
  const onSubmit = vi.fn<NonNullable<ShotlogProviderProps["onSubmit"]>>(
    async () => {},
  );
  const card = mount({
    diagnostics: false,
    onSubmit,
    types: [
      "Bug",
      { value: "Question" },
      { value: "Idea", label: "Suggestion" },
      { value: "Billing", label: "Facturation" },
      "Other",
    ],
    labels: { bug: "Bogue", question: "Demande", idea: "Idée" },
  });
  card().onChange({ type: "Bug", description: "A translated report" });
  const props = card();
  // Inspect the real card's radio callbacks without mounting DOM-only effects.
  const slotCount = hooks.slots.length;
  const tree = ReportCard(props);
  const chips: {
    text: ReactNode;
    input: { value: string; onChange: () => void };
  }[] = [];
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) {
      for (const child of node as ReactNode[]) visit(child);
    } else if (
      isValidElement<{ className?: string; children?: ReactNode }>(node)
    ) {
      if (
        node.props.className === "chip" &&
        Array.isArray(node.props.children)
      ) {
        const [input, text] = node.props.children as ReactNode[];
        if (isValidElement<{ value: string; onChange: () => void }>(input))
          chips.push({ text, input: input.props });
      }
      visit(node.props.children);
    }
  };
  visit(tree);
  hooks.slots.length = slotCount;
  hooks.effects = [];
  expect(chips.map(({ text }) => text)).toEqual([
    "Bogue",
    "Demande",
    "Suggestion",
    "Facturation",
    "Other",
  ]);
  const billing = chips.find(({ input }) => input.value === "Billing");
  expect(billing).toBeDefined();
  billing?.input.onChange();
  card().onSubmit();
  await new Promise(setImmediate);
  expect(onSubmit.mock.calls[0]?.[0].log.type).toBe("Billing");
});
