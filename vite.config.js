import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH lets the site live in a sub-folder, e.g. GitHub Pages at https://you.github.io/devdeck/
// (BASE_PATH=/devdeck/ npm run build). Everywhere else it sits at the top: "/".
const base = (process.env.BASE_PATH || "/").replace(/\/?$/, "/");

export default defineConfig({
  plugins: [react()],
  base,
});
