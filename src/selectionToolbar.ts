import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import { setIcon } from "obsidian";

export type VoiceoverState = "idle" | "loading" | "generating" | "speaking";

export interface SelectionToolbarActions {
	getState(): VoiceoverState;
	getBackend(): "webgpu" | "wasm" | null;
	isHighlightEnabled(): boolean;
	speak(text: string): void;
	stop(): void;
}

const setPlaybackHighlight = StateEffect.define<{ from: number; to: number } | null>();
const spokenRangeLock = StateEffect.define<{ from: number; to: number } | null>();
const spokenRangeLockField = StateField.define<{ from: number; to: number } | null>({
	create: () => null,
	update(value, transaction) {
		// Insertions at the end belong after the protected source range, not inside it.
		let next = value ? { from: transaction.changes.mapPos(value.from, 1), to: transaction.changes.mapPos(value.to, -1) } : null;
		for (const effect of transaction.effects) if (effect.is(spokenRangeLock)) next = effect.value;
		return next;
	},
});
const spokenRangeLockFilter = EditorState.transactionFilter.of((transaction) => {
	const lock = transaction.startState.field(spokenRangeLockField);
	if (!lock || !transaction.docChanged) return transaction;
	let overlaps = false;
	transaction.changes.iterChanges((fromA, toA) => {
		if (fromA === toA ? fromA > lock.from && fromA < lock.to : fromA < lock.to && toA > lock.from)
			overlaps = true;
	});
	return overlaps ? [] : transaction;
});
const spokenRangeLockDecoration = EditorView.decorations.from(spokenRangeLockField, (lock) =>
	lock ? Decoration.set([Decoration.mark({ class: "local-voiceover-locked-text" }).range(lock.from, lock.to)]) : Decoration.none,
);

const playbackHighlightField = StateField.define({
	create: () => Decoration.none,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setPlaybackHighlight)) {
				if (!effect.value) return Decoration.none;
				return Decoration.set([
					Decoration.mark({ class: "local-voiceover-playing-text" }).range(effect.value.from, effect.value.to),
				]);
			}
		}
		return value.map(transaction.changes);
	},
});

export const playbackHighlightExtension: Extension = [
	spokenRangeLockField,
	spokenRangeLockFilter,
	spokenRangeLockDecoration,
	playbackHighlightField,
	EditorView.decorations.from(playbackHighlightField),
];

export function createSelectionToolbarExtension(actions: SelectionToolbarActions): Extension {
	return ViewPlugin.fromClass(
		class {
			private readonly toolbar: HTMLElement;
			private readonly playButton: HTMLButtonElement;
			private readonly stopButton: HTMLButtonElement;
			private readonly status: HTMLElement;
			private selectedText = "";
			private selectedFrom = 0;
			private playbackText = "";
			private playbackFrom = 0;
			private highlightOffset = 0;
			private destroyed = false;
			private clearPending = false;
			private unlockPending = false;
			private lockGeneration = 0;
			private readonly refresh = () => this.scheduleRender();
			private readonly highlightChunk = (event: Event) => this.applyChunkHighlight(event);
			private readonly startPlayback = () => {
				this.lockGeneration += 1;
				this.playbackText = this.selectedText;
				this.playbackFrom = this.selectedFrom;
				this.highlightOffset = 0;
				if (this.selectedText)
					this.view.dispatch({ effects: spokenRangeLock.of({ from: this.selectedFrom, to: this.selectedFrom + this.selectedText.length }) });
			};
			private readonly clearLock = () => {
				if (this.unlockPending) return;
				this.unlockPending = true;
				const generation = this.lockGeneration;
				window.setTimeout(() => {
					this.unlockPending = false;
					if (!this.destroyed && generation === this.lockGeneration) this.view.dispatch({ effects: spokenRangeLock.of(null) });
				}, 0);
			};
			private readonly clearHighlight = () => {
				if (this.clearPending) return;
				this.clearPending = true;
				window.setTimeout(() => {
					this.clearPending = false;
					if (!this.destroyed) this.view.dispatch({ effects: setPlaybackHighlight.of(null) });
				}, 0);
			};

			constructor(private readonly view: EditorView) {
				this.toolbar = this.view.dom.ownerDocument.body.createDiv({ cls: "local-voiceover-selection-toolbar" });
				this.playButton = this.toolbar.createEl("button", {
					cls: "clickable-icon local-voiceover-selection-toolbar__button",
					attr: { "aria-label": "Speak selected text", "data-tooltip-position": "top" },
				});
				setIcon(this.playButton, "play");
				this.stopButton = this.toolbar.createEl("button", {
					cls: "clickable-icon local-voiceover-selection-toolbar__button",
					attr: { "aria-label": "Stop speaking", "data-tooltip-position": "top" },
				});
				setIcon(this.stopButton, "square");
				this.status = this.toolbar.createSpan({ cls: "local-voiceover-selection-toolbar__status" });
				for (const button of [this.playButton, this.stopButton]) button.addEventListener("mousedown", (event) => event.preventDefault());
				this.playButton.addEventListener("click", () => actions.speak(this.selectedText));
				this.stopButton.addEventListener("click", () => actions.stop());
				window.addEventListener("local-voiceover-state", this.refresh);
				window.addEventListener("local-voiceover-highlight", this.highlightChunk);
				window.addEventListener("local-voiceover-playback-start", this.startPlayback);
				window.addEventListener("local-voiceover-range-unlock", this.clearLock);
				window.addEventListener("local-voiceover-highlight-clear", this.clearHighlight);
				this.scheduleRender();
			}

			update(update: ViewUpdate): void {
				if (update.docChanged && this.playbackText) {
					// The transaction filter permits only changes outside the locked range.
					// Mapping keeps future chunk highlights attached to the same source text.
					this.playbackFrom = update.changes.mapPos(this.playbackFrom);
				}
				if (update.selectionSet || update.geometryChanged || update.viewportChanged || update.focusChanged) this.scheduleRender();
			}

			destroy(): void {
				this.destroyed = true;
				window.removeEventListener("local-voiceover-state", this.refresh);
				window.removeEventListener("local-voiceover-highlight", this.highlightChunk);
				window.removeEventListener("local-voiceover-playback-start", this.startPlayback);
				window.removeEventListener("local-voiceover-range-unlock", this.clearLock);
				window.removeEventListener("local-voiceover-highlight-clear", this.clearHighlight);
				this.toolbar.remove();
			}

			private scheduleRender(): void {
				const selection = this.view.state.selection.main;
				this.selectedFrom = selection.from;
				this.selectedText = this.view.state.sliceDoc(selection.from, selection.to).trim();
				if (!this.selectedText || !this.view.hasFocus) {
					if (actions.getState() === "idle") this.clearHighlight();
					this.applyPosition(null, actions.getState());
					return;
				}
				this.view.requestMeasure({
					read: () => this.view.coordsAtPos(selection.from),
					write: (coords) => this.applyPosition(coords, actions.getState()),
				});
			}

			private applyChunkHighlight(event: Event): void {
				if (!actions.isHighlightEnabled() || !this.playbackText) return;
				const source = (event as CustomEvent<{ source?: string }>).detail?.source;
				if (!source) return;
				const offset = this.playbackText.indexOf(source, this.highlightOffset);
				if (offset < 0) return;
				this.highlightOffset = offset + source.length;
				this.view.dispatch({
					effects: setPlaybackHighlight.of({ from: this.playbackFrom + offset, to: this.playbackFrom + offset + source.length }),
				});
			}

			private applyPosition(coords: ReturnType<EditorView["coordsAtPos"]>, state: VoiceoverState): void {
				if (!coords) {
					this.toolbar.hide();
					return;
				}
				this.playButton.disabled = state !== "idle";
				this.stopButton.disabled = state === "idle";
				const label = ({ idle: "Ready", loading: "Loading", generating: "Generating", speaking: "Speaking" })[state];
				const backend = actions.getBackend();
				this.status.setText(backend ? `${label} · ${backend === "webgpu" ? "WebGPU" : "WASM"}` : label);
				this.toolbar.style.left = `${coords.left}px`;
				this.toolbar.style.top = `${Math.max(8, coords.top - 8)}px`;
				this.toolbar.show();
			}
		},
	);
}
