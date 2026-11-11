import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import "./power.css";
import "./tools2.css";
import "./devops.css";
import "./more.css";
import "./mobile.css";
import App from "./App.jsx";
import { isDesktop, setupDesktop } from "./desktop.js";
import { loadUserPlugins, listUserPlugins } from "./user-plugins.js";

setupDesktop();

// Plugins installed in Settings → Plugins are loaded first, so their tools are there from the start.
const ready = listUserPlugins().length ? loadUserPlugins().catch(() => {}) : Promise.resolve();
ready.then(() => {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});

// Offline support and "install as app" (only in the published website, and only where the browser allows it;
// the desktop app already has everything on disk).
if (import.meta.env.PROD && !isDesktop && "serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}); });
}
