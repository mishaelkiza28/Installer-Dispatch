import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Relative base so the built assets resolve correctly whether this ends
  // up at the root of a github.io domain or under a project subpath
  // (https://<user>.github.io/<repo>/) — no per-repo edit needed.
  base: "./",
});
