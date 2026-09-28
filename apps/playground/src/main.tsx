import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ShotlogProvider } from "shotlog";
import { App } from "./App.js";
import { metadata, reporter } from "./context.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Playground root is missing");

createRoot(root).render(
  <StrictMode>
    <ShotlogProvider
      endpoint="/api/support"
      reporter={reporter}
      metadata={metadata}
      theme="light"
      accent="#343c35"
    >
      <App />
    </ShotlogProvider>
  </StrictMode>,
);
