import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ShotlogProvider } from "shotlog";
import { App } from "./App.js";
import { metadata, reporter } from "./context.js";
import { useProviderSettings } from "./ProviderSettings.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Playground root is missing");

function Playground() {
  const { settings, update, providerProps } = useProviderSettings();
  return (
    <ShotlogProvider
      endpoint="/api/support"
      reporter={reporter}
      metadata={metadata}
      {...providerProps}
    >
      <App providerSettings={settings} onProviderSettingsChange={update} />
    </ShotlogProvider>
  );
}

createRoot(root).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
