import { useEffect, useId, useRef, useState } from "react";

export type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0E1024" : "#F4F1EA");
  }, [theme]);
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => {
      try {
        if (localStorage.getItem("shotlog-site-theme")) return;
      } catch {
        /* Storage is optional. */
      }
      setTheme(query.matches ? "dark" : "light");
    };
    query.addEventListener("change", followSystem);
    return () => query.removeEventListener("change", followSystem);
  }, []);
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("shotlog-site-theme", next);
    } catch {
      /* Storage is optional. */
    }
  };
  return { theme, toggleTheme };
}

export function Header({
  theme,
  toggleTheme,
  docs = false,
}: {
  theme: Theme;
  toggleTheme: () => void;
  docs?: boolean;
}) {
  return (
    <header className="site-header container">
      <a className="brand" href="/" aria-label="shotlog home">
        <img src="/icon.svg" width="34" height="34" alt="" />
        <span>
          shotlog<span className="brand-dot">.</span>
        </span>
      </a>
      <nav aria-label="Main navigation">
        <a href="/#demo" className="nav-demo">
          Live demo
        </a>
        <a href="/docs/" aria-current={docs ? "page" : undefined}>
          Docs <span aria-hidden="true">↗</span>
        </a>
        <span className="nav-divider" />
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
        >
          {theme === "light" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 14A8 8 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
            </svg>
          )}
        </button>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer container">
      <div>
        <a className="brand" href="/">
          <img src="/icon.svg" width="26" height="26" alt="" />
          <span>shotlog.</span>
        </a>
        <p>A little context goes a long way.</p>
      </div>
      <nav aria-label="Footer navigation">
        <a href="https://github.com/SpiritDevs/shotlog">GitHub</a>
        <a href="https://www.npmjs.com/package/shotlog">npm ↗</a>
        <a href="/docs/">Documentation ↗</a>
      </nav>
      <span className="footer-note mono">
        MADE FOR THE MOMENT
        <br />
        “IT’S DOING THAT THING AGAIN.”
      </span>
    </footer>
  );
}

export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(""), 2500);
    return () => clearTimeout(timer);
  }, [status]);
  return (
    <button
      className={`copy-button ${className}`}
      type="button"
      aria-label={status || label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setStatus("Copied!");
        } catch {
          setStatus("Select text to copy");
        }
      }}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="7" y="7" width="9" height="10" rx="2" />
        <path d="M12 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      </svg>
      <span aria-live="polite">{status || label}</span>
    </button>
  );
}

export function Scribble({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`scribble ${className}`}
      viewBox="0 0 300 110"
      fill="none"
      aria-hidden="true"
    >
      <path d="M238 15C184-5 67 4 24 35C-39 82 86 112 204 92C286 78 320 23 241 12C172 1 91 4 47 25" />
    </svg>
  );
}

const managers = [
  { id: "npm", command: "npm i shotlog" },
  { id: "pnpm", command: "pnpm add shotlog" },
  { id: "yarn", command: "yarn add shotlog" },
  { id: "bun", command: "bun add shotlog" },
] as const;
type Manager = (typeof managers)[number];
const managerKey = "shotlog-site:package-manager";
const managerEvent = "shotlog-site:package-manager";
const find = (id: string | null): Manager =>
  managers.find((manager) => manager.id === id) ?? managers[0];

/** The chosen package manager, remembered and shared by every install snippet on the page. */
export function usePackageManager(): [Manager, (id: Manager["id"]) => void] {
  const [manager, setManager] = useState<Manager>(() => {
    try {
      return find(localStorage.getItem(managerKey));
    } catch {
      return managers[0];
    }
  });
  useEffect(() => {
    const sync = () => {
      try {
        setManager(find(localStorage.getItem(managerKey)));
      } catch {
        /* Storage unavailable: keep the current choice. */
      }
    };
    window.addEventListener(managerEvent, sync);
    return () => window.removeEventListener(managerEvent, sync);
  }, []);
  const choose = (id: Manager["id"]) => {
    setManager(find(id));
    try {
      localStorage.setItem(managerKey, id);
      window.dispatchEvent(new Event(managerEvent));
    } catch {
      /* Storage unavailable: this snippet still updates. */
    }
  };
  return [manager, choose];
}

export function InstallCommand() {
  const [manager, choose] = usePackageManager();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    root.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const pick = (id: Manager["id"]) => {
    choose(id);
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div className="install" ref={root}>
      <div className="manager">
        <button
          ref={trigger}
          type="button"
          className="manager-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`Package manager: ${manager.id}`}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          {manager.id}
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="m3 4.5 3 3 3-3" />
          </svg>
        </button>
        {open && (
          <div
            id={menuId}
            className="manager-menu"
            role="menu"
            tabIndex={-1}
            onKeyDown={(event) => {
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button",
                ),
              );
              const index = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                trigger.current?.focus();
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                items[(index + step + items.length) % items.length]?.focus();
              } else if (event.key === "Tab") {
                setOpen(false);
              }
            }}
          >
            {managers.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={option.id === manager.id}
                onClick={() => pick(option.id)}
              >
                {option.id}
              </button>
            ))}
          </div>
        )}
      </div>
      <code>{manager.command}</code>
      <span className="install-divider" aria-hidden="true" />
      <CopyButton value={manager.command} label="Copy install command" />
    </div>
  );
}
