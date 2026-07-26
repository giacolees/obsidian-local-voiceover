import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { setIcon } from "obsidian";

export type VoiceoverState = "idle" | "loading" | "generating" | "speaking";

export interface SelectionToolbarActions {
	getState(): VoiceoverState;
	isHighlightEnabled(): boolean;
	speak(text: string): void;
	stop(): void;
}

const setPlaybackHighlight = StateEffect.define<{ from: number; to: number } | null>();
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
			private highlightOffset = 0;
			private readonly refresh = () => this.scheduleRender();
			private readonly highlightChunk = (event: Event) => this.applyChunkHighlight(event);
			private readonly clearHighlight = () => {
				this.highlightOffset = 0;
				this.view.dispatch({ effects: setPlaybackHighlight.of(null) });
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
				window.addEventListener("local-voiceover-highlight-clear", this.clearHighlight);
				this.scheduleRender();
			}

			update(update: ViewUpdate): void {
				if (update.selectionSet || update.geometryChanged || update.viewportChanged || update.focusChanged) this.scheduleRender();
			}

			destroy(): void {
				window.removeEventListener("local-voiceover-state", this.refresh);
				window.removeEventListener("local-voiceover-highlight", this.highlightChunk);
				window.removeEventListener("local-voiceover-highlight-clear", this.clearHighlight);
				this.toolbar.remove();
			}

			private scheduleRender(): void {
				const selection = this.view.state.selection.main;
				this.selectedFrom = selection.from;
				this.selectedText = this.view.state.sliceDoc(selection.from, selection.to).trim();
				if (!this.selectedText || !this.view.hasFocus) {
					this.clearHighlight();
					this.applyPosition(null, actions.getState());
					return;
				}
				this.view.requestMeasure({
					read: () => this.view.coordsAtPos(selection.from),
					write: (coords) => this.applyPosition(coords, actions.getState()),
				});
			}

			private applyChunkHighlight(event: Event): void {
				if (!actions.isHighlightEnabled() || !this.selectedText) return;
				const source = (event as CustomEvent<{ source?: string }>).detail?.source;
				if (!source) return;
				const offset = this.selectedText.indexOf(source, this.highlightOffset);
				if (offset < 0) return;
				this.highlightOffset = offset + source.length;
				this.view.dispatch({
					effects: setPlaybackHighlight.of({ from: this.selectedFrom + offset, to: this.selectedFrom + offset + source.length }),
				});
			}

			private applyPosition(coords: ReturnType<EditorView["coordsAtPos"]>, state: VoiceoverState): void {
				if (!coords) {
					this.toolbar.hide();
					return;
				}
				this.playButton.disabled = state !== "idle";
				this.stopButton.disabled = state === "idle";
				this.status.setText(({ idle: "Ready", loading: "Loading", generating: "Generating", speaking: "Speaking" })[state]);
				this.toolbar.style.left = `${coords.left}px`;
				this.toolbar.style.top = `${Math.max(8, coords.top - 8)}px`;
				this.toolbar.show();
			}
		},
	);
}
