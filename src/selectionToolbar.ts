import { type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { setIcon } from "obsidian";

export type VoiceoverState = "idle" | "loading" | "generating" | "speaking";

export interface SelectionToolbarActions {
	getState(): VoiceoverState;
	speak(text: string): void;
	stop(): void;
}

export function createSelectionToolbarExtension(actions: SelectionToolbarActions): Extension {
	return ViewPlugin.fromClass(
		class {
			private readonly toolbar: HTMLElement;
			private readonly playButton: HTMLButtonElement;
			private readonly stopButton: HTMLButtonElement;
			private readonly status: HTMLElement;
			private selectedText = "";
			private readonly refresh = () => this.scheduleRender();

			constructor(private readonly view: EditorView) {
				this.toolbar = this.view.dom.ownerDocument.body.createDiv({
					cls: "local-voiceover-selection-toolbar",
				});
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
				for (const button of [this.playButton, this.stopButton])
					button.addEventListener("mousedown", (event) => event.preventDefault());
				this.playButton.addEventListener("click", () => actions.speak(this.selectedText));
				this.stopButton.addEventListener("click", () => actions.stop());
				window.addEventListener("local-voiceover-state", this.refresh);
				this.scheduleRender();
			}

			update(update: ViewUpdate): void {
				if (update.selectionSet || update.geometryChanged || update.viewportChanged || update.focusChanged)
					this.scheduleRender();
			}

			destroy(): void {
				window.removeEventListener("local-voiceover-state", this.refresh);
				this.toolbar.remove();
			}

			private scheduleRender(): void {
				const selection = this.view.state.selection.main;
				this.selectedText = this.view.state.sliceDoc(selection.from, selection.to).trim();
				if (!this.selectedText || !this.view.hasFocus) {
					this.applyPosition(null, actions.getState());
					return;
				}
				this.view.requestMeasure({
					read: () => this.view.coordsAtPos(selection.from),
					write: (coords) => this.applyPosition(coords, actions.getState()),
				});
			}

			private applyPosition(coords: ReturnType<EditorView["coordsAtPos"]>, state: VoiceoverState): void {
				if (!coords) {
					this.toolbar.hide();
					return;
				}
				this.playButton.disabled = state !== "idle";
				this.stopButton.disabled = state === "idle";
				this.status.setText(
					({ idle: "Ready", loading: "Loading", generating: "Generating", speaking: "Speaking" })[state],
				);
				this.toolbar.style.left = `${coords.left}px`;
				this.toolbar.style.top = `${Math.max(8, coords.top - 8)}px`;
				this.toolbar.show();
			}
		},
	);
}
