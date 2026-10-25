import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { litellmBridge } from "./llm/bridge.js";
import { publishedReferenceBridge } from "./server/publishedReferences.js";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), litellmBridge(), publishedReferenceBridge()],
  clearScreen: false,
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
