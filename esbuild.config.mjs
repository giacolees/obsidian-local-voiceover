import fs from "node:fs";
import process from "node:process";
import { builtinModules as builtins } from "node:module";
import esbuild from "esbuild";

const production = process.argv[2] === "production";
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
	const worker = await esbuild.build({
		...shared,
		entryPoints: ["src/worker.ts"],
		format: "iife",
		external: ["node:*"],
		write: false,
	});
	const source = worker.outputFiles[0].text;
	fs.writeFileSync("src/generatedWorker.ts", `const workerSource = ${JSON.stringify(source)};\nexport default workerSource;\n`);
	await esbuild.build({
		...shared,
		entryPoints: ["main.ts"],
		outfile: "main.js",
		format: "cjs",
		external,
	});
}

await build();
