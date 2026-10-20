import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { englishMessages } from "./src/lib/messages";
import { traditionalChineseMessages } from "./src/lib/messages-zh-tw";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "fitness-noscript-message",
      transformIndexHtml(html) {
        const message = `${englishMessages.javascriptRequired} ${traditionalChineseMessages.javascriptRequired}`;
        const escaped = message
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
        return html.replace("%FITNESS_NOSCRIPT%", escaped);
      },
    },
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    host: "127.0.0.1",
    port: 8784,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8785", changeOrigin: false },
      "/data/export": { target: "http://127.0.0.1:8785", changeOrigin: false },
    },
  },
});
