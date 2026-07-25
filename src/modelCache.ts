import { normalizePath, requestUrl, type DataAdapter } from "obsidian";

const MODEL_URL = "https://huggingface.co/giacolees/Inflect-Micro-v2-ONNX/resolve/main";
type ModelName = "inflect-core.onnx" | "inflect-decoder.onnx";

interface CacheRecord {
	url: string;
	sha256: string;
	bytes: number;
}

interface CacheManifest {
	version: 1;
	models: Partial<Record<ModelName, CacheRecord>>;
}

export class ModelCache {
	private readonly root: string;
	private manifest: CacheManifest | null = null;

	constructor(private readonly adapter: DataAdapter, pluginDirectory: string) {
		this.root = normalizePath(`${pluginDirectory}/models`);
	}

	async load(name: ModelName, onProgress: (loaded: number, total?: number) => void): Promise<ArrayBuffer> {
		const manifest = await this.loadManifest();
		const path = this.pathFor(name);
		if (await this.adapter.exists(path)) {
			const bytes = await this.adapter.readBinary(path);
			if (manifest.models[name] && (await sha256(bytes)) === manifest.models[name]?.sha256) return bytes;
			await this.adapter.remove(path);
		}
		onProgress(0);
		const response = await requestUrl({ url: `${MODEL_URL}/${name}`, throw: false });
		if (response.status < 200 || response.status >= 300)
			throw new Error(`Could not download ${name} (${response.status}).`);
		const bytes = response.arrayBuffer;
		onProgress(bytes.byteLength, bytes.byteLength);
		await this.ensureRoot();
		await this.adapter.writeBinary(path, bytes);
		manifest.models[name] = { url: `${MODEL_URL}/${name}`, sha256: await sha256(bytes), bytes: bytes.byteLength };
		await this.adapter.write(this.manifestPath(), JSON.stringify(manifest));
		return bytes;
	}

	private async loadManifest(): Promise<CacheManifest> {
		if (this.manifest) return this.manifest;
		const path = this.manifestPath();
		this.manifest = (await this.adapter.exists(path))
			? (JSON.parse(await this.adapter.read(path)) as CacheManifest)
			: { version: 1, models: {} };
		return this.manifest;
	}

	private async ensureRoot(): Promise<void> {
		if (!(await this.adapter.exists(this.root))) await this.adapter.mkdir(this.root);
	}

	private pathFor(name: ModelName): string { return normalizePath(`${this.root}/${name}`); }
	private manifestPath(): string { return normalizePath(`${this.root}/manifest.json`); }
}

async function sha256(value: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", value);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
