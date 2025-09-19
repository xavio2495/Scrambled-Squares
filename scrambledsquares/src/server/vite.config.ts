import { defineConfig } from "vite";
import { builtinModules } from "node:module";

export default defineConfig({
  ssr: {
    noExternal: ['@devvit/*'],
  },
  build: {
    emptyOutDir: false,
    ssr: "index.ts",
    outDir: "../../dist/server",
    target: "node22",
    sourcemap: false,
    minify: true,
    rollupOptions: {
      external: [
        ...builtinModules,
        /^@devvit\//,
        'express',
        'cors',
        'body-parser'
      ],
      output: {
        format: "esm",
        entryFileNames: "index.mjs",
        inlineDynamicImports: false,
      },
    },
  },
});
