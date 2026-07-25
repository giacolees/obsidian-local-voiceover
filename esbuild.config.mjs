import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { builtinModules as builtins } from "node:module";
import esbuild from "esbuild";

const production = process.argv[2] === "production";
const ortAssets = {
	name: "copy-ort-assets",
	setup(build) {
		build.onEnd(() => {
			const destination = "wasm";
			fs.mkdirSync(destination, { recursive: true });
			for (const name of fs.readdirSync("node_modules/onnxruntime-web/dist")) {
				if (/\.(wasm|mjs)$/.test(name))
					fs.copyFileSync(path.join("node_modules/onnxruntime-web/dist", name), path.join(destination, name));
			}
		});
	},
};
const external = [
	"node:*",
	"obsidian",
	"electron",
	"@codemirror/autocomplete",
	"@codemirror/collab",
	"@codemirror/commands",
	"@codemirror/language",
	"@codemirror/lint",
	"@codemirror/search",
	"@codemirror/state",
	"@codemirror/view",
	"@lezer/common",
	"@lezer/highlight",
	"@lezer/lr",
	...builtins,
];
const shared = {
	bundle: true,
	target: "es2020",
	define: { "process.release.name": '"browser"' },
	logLevel: "info",
	sourcemap: production ? false : "inline",
};

async function build() {
	await esbuild.build({
		...shared,
		entryPoints: ["main.ts"],
		outfile: "main.js",
		format: "cjs",
		external,
		plugins: [ortAssets],
	});
	await esbuild.build({
		...shared,
		entryPoints: ["src/worker.ts"],
		outfile: "worker.js",
		format: "iife",
		external: ["node:*"],
	});
}

if (production) await build();
else await build();
