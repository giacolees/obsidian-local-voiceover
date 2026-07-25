import { Editor, Notice, Plugin, normalizePath } from "obsidian";
import { ModelCache } from "./src/modelCache";
import { StreamPlayer } from "./src/player";
import { boundaryPauseSeconds, edgeFade } from "./src/port/runtime.mjs";
import { SpeechWorkerClient } from "./src/workerClient";

export default class LocalVoiceoverPlugin extends Plugin {
	private readonly player = new StreamPlayer();
	private abortController: AbortController | null = null;
	private worker: SpeechWorkerClient | null = null;
	private loading: Promise<SpeechWorkerClient> | null = null;

	async onload(): Promise<void> {
		this.addCommand({
			id: "speak-selected-text",
			name: "Speak selected text",
			editorCheckCallback: (checking, editor) => this.speakCommand(checking, editor),
		});
		this.addCommand({
			id: "stop-speaking",
			name: "Stop speaking",
			checkCallback: (checking) => {
				if (!this.abortController) return false;
				if (!checking) this.stop();
				return true;
			},
		});
		this.register(() => this.disposeRuntime());
	}

	private speakCommand(checking: boolean, editor: Editor): boolean {
		const text = editor.getSelection().trim();
		if (!text || this.abortController) return false;
		if (!checking) window.setTimeout(() => void this.speak(text), 0);
		return true;
	}

	private async speak(text: string): Promise<void> {
		const abort = new AbortController();
		this.abortController = abort;
		try {
			await this.player.start();
			const worker = await this.getWorker();
			if (abort.signal.aborted) return;
			new Notice("Generating local speech…");
			await worker.synthesize(
				text,
				(chunk) => {
					if (!abort.signal.aborted) {
						const faded = edgeFade(chunk.waveform) as Float32Array;
						this.player.queue(faded, Number(boundaryPauseSeconds(chunk.source)));
					}
				},
				abort.signal,
			);
		} catch (error) {
			if (!abort.signal.aborted) {
				console.error("Local Voiceover synthesis failed", error);
				const message = error instanceof Error ? error.message : "Unknown synthesis error.";
				new Notice(`Local Voiceover: ${message}`);
			}
		} finally {
			if (this.abortController === abort) this.abortController = null;
		}
	}

	private getWorker(): Promise<SpeechWorkerClient> {
		if (this.worker) return Promise.resolve(this.worker);
		if (this.loading) return this.loading;
		new Notice("Preparing local inflect voice model…");
		const pluginDirectory = normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}`);
		const cache = new ModelCache(this.app.vault.adapter, pluginDirectory);
		const wasmFile = this.app.vault.adapter.getResourcePath(
			normalizePath(`${pluginDirectory}/wasm/ort-wasm-simd-threaded.wasm`),
		);
		const workerPath = normalizePath(`${pluginDirectory}/worker.js`);
		this.loading = Promise.all([
			cache.load("inflect-core.onnx", () => undefined),
			cache.load("inflect-decoder.onnx", () => undefined),
			this.app.vault.adapter.read(workerPath),
		]).then(async ([core, decoder, workerSource]) => {
			const worker = new SpeechWorkerClient(workerSource);
			await worker.initialize(
				{ "inflect-core.onnx": core, "inflect-decoder.onnx": decoder },
				new URL(".", wasmFile).href,
			);
			this.worker = worker;
			return worker;
		}).finally(() => {
			this.loading = null;
		});
		return this.loading;
	}

	private stop(): void {
		this.abortController?.abort();
		this.abortController = null;
		this.player.stop();
		new Notice("Speech stopped.");
	}

	private disposeRuntime(): void {
		this.abortController?.abort();
		this.abortController = null;
		this.player.stop();
		this.worker?.dispose();
		this.worker = null;
	}
}
