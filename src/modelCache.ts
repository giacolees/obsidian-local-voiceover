import { normalizePath, requestUrl, type DataAdapter } from "obsidian";

export const MODEL_BASE_URL = "https://huggingface.co/owensong/Inflect-Micro-v2-ONNX/resolve/51618dec4d1a9a948fe15de45efe6a175eea8c54/onnx";
export const ORT_BASE_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist";
export type CacheAsset =
	| "duration.onnx"
	| "decode.onnx"
	| "ort-wasm-simd-threaded.jsep.mjs"
	| "ort-wasm-simd-threaded.jsep.wasm";

const OFFICIAL_MODEL_HASHES: Record<"duration.onnx" | "decode.onnx", string> = {
	"duration.onnx": "b728ca2564b9e5b7d6cf5e446f65e02a6fe2f1880ba281466fec93a667dd2388",
	"decode.onnx": "7940923add86f76e7fa78d910b0632ca1779f8cc9a2ca2b49236381a9ca77183",
};

interface CacheRecord {
	url: string;
	sha256: string;
	bytes: number;
}
interface CacheManifest {
	version: 3;
	assets: Partial<Record<CacheAsset, CacheRecord>>;
}

export class ModelCache {
	private readonly root: string;
	private manifest: CacheManifest | null = null;

	constructor(private readonly adapter: DataAdapter, pluginDirectory: string) {
		this.root = normalizePath(`${pluginDirectory}/runtime-cache`);
	}

	loadModel(name: "duration.onnx" | "decode.onnx", onProgress: Progress): Promise<ArrayBuffer> {
		return this.load(name, MODEL_BASE_URL, onProgress);
	}

	loadRuntime(
		name: "ort-wasm-simd-threaded.jsep.mjs" | "ort-wasm-simd-threaded.jsep.wasm",
		onProgress: Progress,
	): Promise<ArrayBuffer> {
		return this.load(name, ORT_BASE_URL, onProgress);
	}

	resourcePath(name: CacheAsset): string {
		return this.adapter.getResourcePath(this.pathFor(name));
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
		const digest = await sha256(bytes);
		if (baseUrl === MODEL_BASE_URL && digest !== OFFICIAL_MODEL_HASHES[name as "duration.onnx" | "decode.onnx"])
			throw new Error(`Downloaded ${name} failed its official SHA-256 verification.`);
		await this.adapter.writeBinary(path, bytes);
		manifest.assets[name] = { url, sha256: digest, bytes: bytes.byteLength };
		await this.adapter.write(this.manifestPath(), JSON.stringify(manifest));
		return bytes;
	}

	private async loadManifest(): Promise<CacheManifest> {
		if (this.manifest) return this.manifest;
		const path = this.manifestPath();
		this.manifest = (await this.adapter.exists(path))
			? (JSON.parse(await this.adapter.read(path)) as CacheManifest)
			: { version: 3, assets: {} };
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
