import fs from "node:fs";
import path from "node:path";
import { builtinModules as builtins } from "node:module";
import process from "node:process";
import esbuild from "esbuild";

const production = process.argv[2] === "production";
const wasmCopyPlugin = {
  name: "copy-ort-wasm",
  setup(build) {
    build.onEnd(() => {
      const destination = path.join(path.dirname(build.initialOptions.outfile), "wasm");
      fs.mkdirSync(destination, { recursive: true });
      for (const name of fs.readdirSync("node_modules/onnxruntime-web/dist").filter((file) => /\.(wasm|mjs)$/.test(file))) {
        fs.copyFileSync(path.join("node_modules/onnxruntime-web/dist", name), path.join(destination, name));
      }
    });
  }
};
const context = await esbuild.context({
  entryPoints: ["main.ts"], outfile: "main.js", bundle: true, format: "cjs", target: "es2020",
  external: ["node:*", "obsidian", "electron", "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands", "@codemirror/language", "@codemirror/lint", "@codemirror/search", "@codemirror/state", "@codemirror/view", "@lezer/common", "@lezer/highlight", "@lezer/lr", ...builtins],
  define: { "process.release.name": '"browser"' }, sourcemap: production ? false : "inline", plugins: [wasmCopyPlugin]
});
if (production) { await context.rebuild(); await context.dispose(); } else await context.watch();
