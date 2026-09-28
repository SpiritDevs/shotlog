export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: string,
): boolean {
  const parts = shortcut
    .toLowerCase()
    .split("+")
    .map((part) => part.trim());
  const key = parts.pop();
  if (
    !key ||
    parts.some(
      (part) =>
        !["mod", "ctrl", "control", "cmd", "meta", "shift", "alt"].includes(
          part,
        ),
    )
  )
    return false;
  const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  const ctrl =
    parts.includes("ctrl") ||
    parts.includes("control") ||
    (parts.includes("mod") && !mac);
  const meta =
    parts.includes("cmd") ||
    parts.includes("meta") ||
    (parts.includes("mod") && mac);
  const matchesKey =
    event.key.toLowerCase() === key || (key === "." && event.code === "Period");
  return (
    matchesKey &&
    event.ctrlKey === ctrl &&
    event.metaKey === meta &&
    event.shiftKey === parts.includes("shift") &&
    event.altKey === parts.includes("alt")
  );
}
