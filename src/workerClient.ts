export interface SpeechChunk {
	waveform: Float32Array;
	source: string;
}

type PendingRun = {
	onChunk: (chunk: SpeechChunk) => void;
	resolve: () => void;
	reject: (error: Error) => void;
};

export class SpeechWorkerClient {
	private readonly worker: Worker;
	private ready: Promise<void>;
	private resolveReady!: () => void;
	private rejectReady!: (error: Error) => void;
	private readonly pending = new Map<number, PendingRun>();
	private nextId = 1;

	constructor(workerSource: string) {
		const workerUrl = URL.createObjectURL(
			new Blob([workerSource], { type: "application/javascript" }),
		);
		this.worker = new Worker(workerUrl);
		URL.revokeObjectURL(workerUrl);
		this.ready = new Promise<void>((resolve, reject) => {
			this.resolveReady = resolve;
			this.rejectReady = reject;
		});
		this.worker.addEventListener("message", (event) => this.handleMessage(event.data as Record<string, unknown>));
		this.worker.addEventListener("error", (event) => this.failAll(new Error(event.message)));
	}

	async initialize(
		models: Record<"inflect-core.onnx" | "inflect-decoder.onnx", ArrayBuffer>,
		runtime: Record<"ort-wasm-simd-threaded.jsep.mjs" | "ort-wasm-simd-threaded.jsep.wasm", ArrayBuffer>,
	): Promise<void> {
		this.worker.postMessage({ type: "init", models, runtime }, [
			models["inflect-core.onnx"],
			models["inflect-decoder.onnx"],
			runtime["ort-wasm-simd-threaded.jsep.mjs"],
			runtime["ort-wasm-simd-threaded.jsep.wasm"],
		]);
		return this.ready;
	}

	synthesize(text: string, onChunk: (chunk: SpeechChunk) => void, signal: AbortSignal): Promise<void> {
		const id = this.nextId++;
		return new Promise<void>((resolve, reject) => {
			this.pending.set(id, { onChunk, resolve, reject });
			signal.addEventListener("abort", () => this.worker.postMessage({ type: "abort", id }), { once: true });
			this.worker.postMessage({ type: "synthesize", id, text });
		});
	}

	dispose(): void {
		this.failAll(new Error("Speech worker disposed."));
		this.worker.terminate();
	}

	private handleMessage(message: Record<string, unknown>): void {
		if (message.type === "ready") {
			this.resolveReady();
			return;
		}
		if (message.type === "init-error") {
			this.rejectReady(new Error(String(message.message)));
			return;
		}
		const id = Number(message.id);
		const pending = this.pending.get(id);
		if (!pending) return;
		if (message.type === "chunk") {
			pending.onChunk({ waveform: message.waveform as Float32Array, source: String(message.source) });
			return;
		}
		this.pending.delete(id);
		if (message.type === "complete") pending.resolve();
		else pending.reject(new Error(String(message.message)));
	}

	private failAll(error: Error): void {
		this.rejectReady(error);
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
	}
}
