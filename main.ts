import { Editor, Notice, Plugin, normalizePath } from "obsidian";
import { ModelCache } from "./src/modelCache";
import { StreamPlayer } from "./src/player";
import { boundaryPauseSeconds, edgeFade } from "./src/port/runtime.mjs";
import { createSelectionToolbarExtension, type VoiceoverState } from "./src/selectionToolbar";
import workerSource from "./src/generatedWorker";
import { SpeechWorkerClient } from "./src/workerClient";

export default class LocalVoiceoverPlugin extends Plugin {
	private readonly player = new StreamPlayer();
	private abortController: AbortController | null = null;
	private worker: SpeechWorkerClient | null = null;
	private loading: Promise<SpeechWorkerClient> | null = null;
	private state: VoiceoverState = "idle";

	async onload(): Promise<void> {
		this.player.setOnStateChange(() => this.syncPlaybackState());
		this.registerEditorExtension(
			createSelectionToolbarExtension({
				getState: () => this.state,
				speak: (text) => void this.speak(text),
				stop: () => this.stop(),
			}),
		);
		this.addCommand({
			id: "speak-selected-text",
			name: "Speak selected text",
			editorCheckCallback: (checking, editor) => this.speakCommand(checking, editor),
		});
		this.addCommand({
			id: "stop-speaking",
			name: "Stop speaking",
			checkCallback: (checking) => {
				if (!this.isBusy()) return false;
				if (!checking) this.stop();
				return true;
			},
		});
		this.register(() => this.disposeRuntime());
	}

	private speakCommand(checking: boolean, editor: Editor): boolean {
		const text = editor.getSelection().trim();
		if (!text || this.isBusy()) return false;
		if (!checking) window.setTimeout(() => void this.speak(text), 0);
		return true;
	}

	private async speak(text: string): Promise<void> {
		if (!text || this.isBusy()) return;
		const abort = new AbortController();
		this.abortController = abort;
		this.setState("loading");
		try {
			await this.player.start();
			const worker = await this.getWorker();
			if (abort.signal.aborted) return;
			this.setState("generating");
			new Notice("Generating local speech…");
			await worker.synthesize(
				text,
				(chunk) => {
					if (!abort.signal.aborted) {
						this.setState("speaking");
						this.player.queue(edgeFade(chunk.waveform) as Float32Array, Number(boundaryPauseSeconds(chunk.source)));
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
			this.syncPlaybackState();
		}
	}

	private getWorker(): Promise<SpeechWorkerClient> {
		if (this.worker) return Promise.resolve(this.worker);
		if (this.loading) return this.loading;
		new Notice("Preparing local inflect voice model…");
		const pluginDirectory = normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}`);
		const cache = new ModelCache(this.app.vault.adapter, pluginDirectory);
		this.loading = Promise.all([
			cache.loadModel("inflect-core.onnx", () => undefined),
			cache.loadModel("inflect-decoder.onnx", () => undefined),
			cache.loadRuntime("ort-wasm-simd-threaded.jsep.mjs", () => undefined),
			cache.loadRuntime("ort-wasm-simd-threaded.jsep.wasm", () => undefined),
		]).then(async ([core, decoder, runtimeMjs, runtimeWasm]) => {
			const worker = new SpeechWorkerClient(workerSource);
			await worker.initialize(
				{ "inflect-core.onnx": core, "inflect-decoder.onnx": decoder },
				{
					"ort-wasm-simd-threaded.jsep.mjs": runtimeMjs,
					"ort-wasm-simd-threaded.jsep.wasm": runtimeWasm,
				},
			);
			this.worker = worker;
			return worker;
		}).finally(() => {
			this.loading = null;
		});
		return this.loading;
	}

	private isBusy(): boolean {
		return this.abortController !== null || this.player.isPlaying;
	}

	private stop(): void {
		this.abortController?.abort();
		this.abortController = null;
		this.player.stop();
		this.setState("idle");
		new Notice("Speech stopped.");
	}

	private syncPlaybackState(): void {
		if (!this.abortController && !this.player.isPlaying) this.setState("idle");
	}

	private setState(state: VoiceoverState): void {
		if (this.state === state) return;
		this.state = state;
		window.dispatchEvent(new Event("local-voiceover-state"));
	}

	private disposeRuntime(): void {
		this.abortController?.abort();
		this.abortController = null;
		this.player.stop();
		this.worker?.dispose();
		this.worker = null;
	}
}
