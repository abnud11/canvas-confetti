import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/main.ts"),
      formats: ["es", "cjs"],
    },
  },
  plugins: [dts()],
});
