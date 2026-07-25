import { Editor, Notice, Plugin, normalizePath } from "obsidian";
import { ModelCache } from "./src/modelCache";
import { StreamPlayer } from "./src/player";
import { boundaryPauseSeconds, edgeFade } from "./src/port/runtime.mjs";
import { createInflectInference } from "./src/port/inference.mjs";

interface Inference {
	synthesize(
		text: string,
		options: { signal: AbortSignal; onChunk: (chunk: InferenceChunk) => Promise<void> },
	): Promise<unknown>;
}

interface InferenceChunk {
	waveform: Float32Array;
	source: string;
}

export default class LocalVoiceoverPlugin extends Plugin {
	private readonly player = new StreamPlayer();
	private abortController: AbortController | null = null;
	private inference: Inference | null = null;
	private loading: Promise<Inference> | null = null;

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
		// Let Obsidian close the command palette before model loading begins.
		if (!checking) window.setTimeout(() => void this.speak(text), 0);
		return true;
	}

	private async speak(text: string): Promise<void> {
		const abort = new AbortController();
		this.abortController = abort;
		try {
			await this.player.start();
			const inference = await this.getInference();
			if (abort.signal.aborted) return;
			new Notice("Generating local speech…");
			await inference.synthesize(text, {
				signal: abort.signal,
				onChunk: async (chunk: InferenceChunk) => {
					if (!abort.signal.aborted) {
						const faded = edgeFade(chunk.waveform) as Float32Array;
						const pause = Number(boundaryPauseSeconds(chunk.source));
						this.player.queue(faded, pause);
					}
				},
			});
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

	private getInference(): Promise<Inference> {
		if (this.inference) return Promise.resolve(this.inference);
		if (this.loading) return this.loading;
		new Notice("Preparing local inflect voice model…");
		const pluginDirectory = normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}`);
		const cache = new ModelCache(this.app.vault.adapter, pluginDirectory);
		const wasmFile = this.app.vault.adapter.getResourcePath(
			normalizePath(`${pluginDirectory}/wasm/ort-wasm-simd-threaded.wasm`),
		);
		const wasmPaths = new URL(".", wasmFile).href;
		this.loading = createInflectInference({
			loadModel: async (name: "inflect-core.onnx" | "inflect-decoder.onnx") => {
				new Notice(`Loading ${name}…`);
				return cache.load(name, (loaded, total) => {
					if (total && loaded === total) new Notice(`Downloaded ${name}.`);
				});
			},
			wasmPaths,
		}) as Promise<Inference>;
		return this.loading.then((inference) => {
			this.inference = inference;
			return inference;
		}).finally(() => {
			this.loading = null;
		});
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
	}
}
