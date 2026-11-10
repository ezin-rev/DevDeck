// When DevDeck runs inside the desktop app (Tauri, see src-tauri/ and DESKTOP.md).
// On the website none of this does anything.
export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Call a Rust command (src-tauri/src/lib.rs) or a plugin command.
export const invoke = (cmd, args) => (isDesktop ? window.__TAURI_INTERNALS__.invoke(cmd, args) : Promise.reject(new Error("Not in the desktop app")));

export function setupDesktop() {
  if (!isDesktop) return;
  document.documentElement.dataset.desktop = "true";
  // Links to other websites open in the normal web browser instead of inside the app window.
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if ((url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") && url.origin !== location.origin) {
      e.preventDefault();
      invoke("plugin:opener|open_url", { url: url.href }).catch(() => {});
    }
  }, true);
}
