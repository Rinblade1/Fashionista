import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { environment: "jsdom", include: ["tests/**/*.test.tsx"], setupFiles: ["tests/setup.ts"], testTimeout: 15000 },
});
