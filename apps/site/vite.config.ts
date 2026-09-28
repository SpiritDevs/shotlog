import { readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { Marked, type Tokens } from "marked";
import {
  createServer,
  defineConfig,
  type PreviewServer,
  type ViteDevServer,
} from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const redirectDocs = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => {
  if (request.url && /^\/docs(?:\/reference)?(?:\?|$)/.test(request.url)) {
    const [path, query] = request.url.split("?");
    response.writeHead(308, {
      Location: `${path}/${query ? `?${query}` : ""}`,
    });
    response.end();
  } else next();
};

export default defineConfig(async () => {
  // A config-free Vite reader honors the same ?raw import used by the app.
  const reader = await createServer({
    configFile: false,
    root,
    server: { middlewareMode: true, watch: null },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
  });
  let readme: string;
  try {
    readme = (await reader.ssrLoadModule("/scripts/readme.ts")).default;
  } finally {
    await reader.close();
  }
  const headings: { id: string; text: string; depth: number }[] = [];
  const ids = new Map<string, number>();
  const markdown = new Marked({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const text = this.parser.parseInline(tokens);
        const plain = text.replace(/<[^>]+>/g, "");
        const slug = plain
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-");
        const count = ids.get(slug) ?? 0;
        ids.set(slug, count + 1);
        const id = `${slug}${count ? `-${count}` : ""}`;
        headings.push({ id, text: plain, depth });
        return `<h${depth} id="${id}"><a class="heading-anchor" href="#${id}">${text}</a></h${depth}>`;
      },
      code({ text, lang }: Tokens.Code) {
        return `<pre tabindex="0"><code${lang ? ` class="language-${escapeHtml(lang)}"` : ""}>${escapeHtml(text)}</code></pre>`;
      },
      link({ href, tokens, title }: Tokens.Link) {
        const references: Record<string, string> = {
          "../../docs": "/docs/reference/",
          "../../CONTEXT.md": "/docs/reference/context.html",
          "../../apps/playground": "/docs/reference/playground.html",
        };
        const target =
          references[href] ??
          (href.startsWith("../../docs/adr/")
            ? `/docs/reference/${href.split("/").at(-1)?.replace(/\.md$/, ".html")}`
            : href);
        return `<a href="${escapeHtml(target)}"${title ? ` title="${escapeHtml(title)}"` : ""}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });
  // Use the standard table renderer inside our scroll wrapper.
  const tableMarkdown = new Marked();
  markdown.use({
    renderer: {
      table(token) {
        return `<div class="table-scroll" role="region" aria-label="Reference table" tabindex="0">${tableMarkdown.parser([token])}</div>`;
      },
    },
  });
  const docs = await markdown.parse(readme);
  const toc = headings
    .filter((h) => h.depth === 2 || h.depth === 3)
    .map(
      (h) =>
        `<a class="toc-depth-${h.depth}" href="#${h.id}">${escapeHtml(h.text)}</a>`,
    )
    .join("\n");
  const blocks = [...readme.matchAll(/```\w*\n([\s\S]*?)```/g)].map(
    (match) => match[1] ?? "",
  );
  const excerpt = (marker: string, start: string, end: string) => {
    const block = blocks.find((value) => value.includes(marker));
    if (!block?.includes(start) || !block.includes(end))
      throw new Error(`README snippet changed: ${marker}`);
    const lines = block
      .slice(block.indexOf(start), block.indexOf(end) + end.length)
      .split("\n");
    const indent = lines
      .slice(1)
      .filter((line) => line.trim())
      .reduce((min, line) => Math.min(min, line.search(/\S/)), Infinity);
    return lines
      .map((line, index) =>
        index ? line.slice(Number.isFinite(indent) ? indent : 0) : line,
      )
      .join("\n");
  };
  const delivery = blocks
    .find(
      (block) =>
        block.includes("export const delivery: DeliveryConfig") &&
        !block.includes("email:"),
    )
    ?.trim();
  if (!delivery) throw new Error("README webhook snippet changed");
  const snippets = {
    annotation: excerpt(
      "export function Providers",
      '<ShotlogProvider endpoint="/api/support">',
      "</ShotlogProvider>",
    ),
    diagnostics: excerpt(
      "SupportOptions",
      "reporter={() => ({ id: userId })}",
      "diagnostics={{ console: true, network: false }}",
    ),
    delivery,
    security: excerpt(
      "authenticatedSupportHandler",
      "authorize: async (request) => {",
      "return { reporterId: session.user.id };\n    },",
    ),
  };
  const references = [
    ["context", "CONTEXT.md"],
    ["build-order", "docs/build-order.md"],
    ["playground", "docs/adr/0014-monorepo-and-playground.md"],
    ...readdirSync(`${repo}docs/adr`)
      .filter((name) => name.endsWith(".md"))
      .map((name) => [name.replace(/\.md$/, ""), `docs/adr/${name}`]),
  ];
  return {
    root,
    appType: "mpa" as const,
    resolve: { dedupe: ["react", "react-dom"] },
    // Lets previews be shared through a Cloudflare quick tunnel.
    preview: { allowedHosts: [".trycloudflare.com"] },
    build: {
      rollupOptions: {
        input: { main: `${root}index.html`, docs: `${root}docs/index.html` },
      },
    },
    plugins: [
      {
        name: "shotlog-readme",
        configureServer(server: ViteDevServer) {
          server.middlewares.use(redirectDocs);
        },
        configurePreviewServer(server: PreviewServer) {
          server.middlewares.use(redirectDocs);
        },
        resolveId(id: string) {
          if (id === "virtual:snippets") return `\0${id}`;
        },
        load(id: string) {
          if (id === "\0virtual:snippets")
            return `export default ${JSON.stringify(snippets)}`;
        },
        transformIndexHtml(html: string) {
          return html
            .replace("<!--DOCS_CONTENT-->", docs)
            .replace("<!--DOCS_TOC-->", toc);
        },
        async generateBundle() {
          // Preserve the README's repository links without inventing a GitHub remote.
          const referenceMarkdown = new Marked();
          const page = (title: string, body: string) =>
            `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · shotlog</title><link rel="icon" href="/icon.svg"><style>body{max-width:850px;margin:50px auto;padding:0 24px;font:17px/1.7 system-ui;background:#f4f1ea;color:#23264f}a{color:#a52920}pre{overflow:auto;padding:20px;background:#e8e4dc}code{font-size:.85em}h1,h2{line-height:1.2}table{display:block;overflow:auto}td,th{padding:8px;border-bottom:1px solid #ccc}@media(prefers-color-scheme:dark){body{background:#0e1024;color:#f4f1ea}a{color:#ff8475}pre{background:#23264f}}</style></head><body><nav><a href="/docs/">← shotlog documentation</a> · <a href="/docs/reference/">Repository references</a></nav><main>${body}</main></body></html>`;
          for (const [name, path] of references) {
            if (!name || !path) continue;
            let source = readFileSync(`${repo}${path}`, "utf8");
            // The internal release runbook is not emitted on the public site.
            source = source.replace(/\[([^\]]+)\]\(\.\.\/release\.md\)/g, "$1");
            source = source.replace(
              /\]\((?:docs\/)?adr\/([^)]*)\.md\)/g,
              "](/docs/reference/$1.html)",
            );
            source = source.replace(
              /\]\(docs\/build-order\.md\)/g,
              "](/docs/reference/build-order.html)",
            );
            this.emitFile({
              type: "asset",
              fileName: `docs/reference/${name}.html`,
              source: page(name, await referenceMarkdown.parse(source)),
            });
          }
          this.emitFile({
            type: "asset",
            fileName: "docs/reference/index.html",
            source: page(
              "Repository references",
              `<h1>Repository references</h1><p>Built from the same repository as the library.</p><ul>${references.map(([name, path]) => `<li><a href="${name}.html">${escapeHtml(path ?? "")}</a></li>`).join("")}</ul>`,
            ),
          });
        },
      },
    ],
  };
});
