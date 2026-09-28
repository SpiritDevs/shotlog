/// <reference types="vite/client" />

declare module "virtual:snippets" {
  const snippets: Record<
    "annotation" | "diagnostics" | "delivery" | "security",
    string
  >;
  export default snippets;
}
