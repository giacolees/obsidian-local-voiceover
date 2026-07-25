import { normalizePath, requestUrl, type DataAdapter } from "obsidian";

export const MODEL_BASE_URL = "https://huggingface.co/giacolees/Inflect-Micro-v2-ONNX/resolve/main";
export const ORT_BASE_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist";
export type CacheAsset =
	| "inflect-core.onnx"
	| "inflect-decoder.onnx"
	| "ort-wasm-simd-threaded.jsep.mjs"
	| "ort-wasm-simd-threaded.jsep.wasm";

interface CacheRecord {
	url: string;
	sha256: string;
	bytes: number;
}
interface CacheManifest {
	version: 2;
	assets: Partial<Record<CacheAsset, CacheRecord>>;
}

export class ModelCache {
	private readonly root: string;
	private manifest: CacheManifest | null = null;

	constructor(private readonly adapter: DataAdapter, pluginDirectory: string) {
		this.root = normalizePath(`${pluginDirectory}/runtime-cache`);
	}

	loadModel(name: "inflect-core.onnx" | "inflect-decoder.onnx", onProgress: Progress): Promise<ArrayBuffer> {
		return this.load(name, MODEL_BASE_URL, onProgress);
	}

	loadRuntime(
		name: "ort-wasm-simd-threaded.jsep.mjs" | "ort-wasm-simd-threaded.jsep.wasm",
		onProgress: Progress,
	): Promise<ArrayBuffer> {
		return this.load(name, ORT_BASE_URL, onProgress);
	}

	private async load(name: CacheAsset, baseUrl: string, onProgress: Progress): Promise<ArrayBuffer> {
		const manifest = await this.loadManifest();
		const path = this.pathFor(name);
		if (await this.adapter.exists(path)) {
			const bytes = await this.adapter.readBinary(path);
			if (manifest.assets[name] && (await sha256(bytes)) === manifest.assets[name]?.sha256) return bytes;
			await this.adapter.remove(path);
		}
		onProgress(0);
		const url = `${baseUrl}/${name}`;
		const response = await requestUrl({ url, throw: false });
		if (response.status < 200 || response.status >= 300) throw new Error(`Could not download ${name} (${response.status}).`);
		const bytes = response.arrayBuffer;
		onProgress(bytes.byteLength, bytes.byteLength);
		await this.ensureRoot();
		await this.adapter.writeBinary(path, bytes);
		manifest.assets[name] = { url, sha256: await sha256(bytes), bytes: bytes.byteLength };
		await this.adapter.write(this.manifestPath(), JSON.stringify(manifest));
		return bytes;
	}

	private async loadManifest(): Promise<CacheManifest> {
		if (this.manifest) return this.manifest;
		const path = this.manifestPath();
		this.manifest = (await this.adapter.exists(path))
			? (JSON.parse(await this.adapter.read(path)) as CacheManifest)
			: { version: 2, assets: {} };
		return this.manifest;
	}
	private async ensureRoot(): Promise<void> {
		if (!(await this.adapter.exists(this.root))) await this.adapter.mkdir(this.root);
	}
	private pathFor(name: CacheAsset): string { return normalizePath(`${this.root}/${name}`); }
	private manifestPath(): string { return normalizePath(`${this.root}/manifest.json`); }
}

type Progress = (loaded: number, total?: number) => void;
async function sha256(value: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", value);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
