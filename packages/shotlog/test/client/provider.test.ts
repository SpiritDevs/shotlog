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
  return () => {
    const card = findCard(render());
    if (!card) throw new Error("Report Card was not rendered");
    return card;
  };
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
