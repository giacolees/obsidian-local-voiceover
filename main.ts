import { Editor, Notice, Plugin, normalizePath } from "obsidian";
import { ModelCache } from "./src/modelCache";
import { StreamPlayer } from "./src/player";
import { boundaryPauseSeconds, edgeFade } from "./src/port/runtime.mjs";
import { createSelectionToolbarExtension, playbackHighlightExtension, type VoiceoverState } from "./src/selectionToolbar";
import { DEFAULT_SETTINGS, type LocalVoiceoverSettings } from "./src/settings";
import { LocalVoiceoverSettingTab } from "./src/settingsTab";
import workerSource from "./src/generatedWorker";
import { SpeechWorkerClient } from "./src/workerClient";

export default class LocalVoiceoverPlugin extends Plugin {
	settings: LocalVoiceoverSettings = DEFAULT_SETTINGS;
	private readonly player = new StreamPlayer();
	private abortController: AbortController | null = null;
	private worker: SpeechWorkerClient | null = null;
	private loading: Promise<SpeechWorkerClient> | null = null;
	private state: VoiceoverState = "idle";

	async onload(): Promise<void> {
		await this.loadSettings();
		this.player.setOnStateChange(() => this.syncPlaybackState());
		this.addSettingTab(new LocalVoiceoverSettingTab(this.app, this));
		this.registerEditorExtension([
			playbackHighlightExtension,
			createSelectionToolbarExtension({
				getState: () => this.state,
				isHighlightEnabled: () => this.settings.highlightSpokenText,
				speak: (text) => void this.speak(text),
				stop: () => this.stop(),
			}),
		]);
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

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<LocalVoiceoverSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...saved };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	clearHighlight(): void {
		window.dispatchEvent(new Event("local-voiceover-highlight-clear"));
	}

	private unlockPlaybackRange(): void {
		window.dispatchEvent(new Event("local-voiceover-range-unlock"));
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
		this.clearHighlight();
		this.unlockPlaybackRange();
		window.dispatchEvent(new Event("local-voiceover-playback-start"));
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
						this.player.queue(
							edgeFade(chunk.waveform) as Float32Array,
							Number(boundaryPauseSeconds(chunk.source)),
							() => {
								if (this.settings.highlightSpokenText)
									window.dispatchEvent(new CustomEvent("local-voiceover-highlight", { detail: { source: chunk.source } }));
							},
						);
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
		new Notice("Preparing local voice model…");
		const pluginDirectory = normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}`);
		const cache = new ModelCache(this.app.vault.adapter, pluginDirectory);
		this.loading = Promise.all([
			cache.loadModel("inflect-core.onnx", () => undefined),
			cache.loadModel("inflect-decoder.onnx", () => undefined),
			cache.loadRuntime("ort-wasm-simd-threaded.jsep.mjs", () => undefined),
			cache.loadRuntime("ort-wasm-simd-threaded.jsep.wasm", () => undefined),
		]).then(async ([core, decoder]) => {
			const worker = new SpeechWorkerClient(workerSource);
			await worker.initialize(
				{ "inflect-core.onnx": core, "inflect-decoder.onnx": decoder },
				{
					mjs: cache.resourcePath("ort-wasm-simd-threaded.jsep.mjs"),
					wasm: cache.resourcePath("ort-wasm-simd-threaded.jsep.wasm"),
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
		this.clearHighlight();
		this.unlockPlaybackRange();
		this.setState("idle");
		new Notice("Speech stopped.");
	}

	private syncPlaybackState(): void {
		if (!this.abortController && !this.player.isPlaying) {
			this.clearHighlight();
			this.unlockPlaybackRange();
			this.setState("idle");
		}
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
		this.clearHighlight();
		this.unlockPlaybackRange();
		this.worker?.dispose();
		this.worker = null;
	}
}
