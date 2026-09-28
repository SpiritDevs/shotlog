import { createRoot } from "react-dom/client";
import { Footer, Header, useTheme } from "./ui";
import "./styles.css";

function DocsHeader() {
  const theme = useTheme();
  return <Header {...theme} docs />;
}

const header = document.getElementById("site-header");
const footer = document.getElementById("site-footer");
if (header) createRoot(header).render(<DocsHeader />);
if (footer) createRoot(footer).render(<Footer />);

const toc = document.querySelector<HTMLDetailsElement>(".docs-toc");
if (toc && matchMedia("(max-width: 800px)").matches) toc.open = false;
const links = [...document.querySelectorAll<HTMLAnchorElement>(".docs-toc a")];
const observer = new IntersectionObserver(
  (entries) => {
    const active = entries.find((entry) => entry.isIntersecting);
    if (!active) return;
    for (const link of links) {
      if (link.hash === `#${active.target.id}`)
        link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  },
  { rootMargin: "-10% 0px -75% 0px" },
);
for (const heading of document.querySelectorAll(".prose h2, .prose h3"))
  observer.observe(heading);
for (const link of links)
  link.addEventListener("click", () => {
    if (toc && matchMedia("(max-width: 800px)").matches) toc.open = false;
  });
