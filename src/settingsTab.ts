import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";
import { normalizeSpeechSettings, type LocalVoiceoverSettings } from "./settings";

type SettingsPlugin = {
	settings: LocalVoiceoverSettings;
	saveSettings(): Promise<void>;
	clearHighlight(): void;
};

export class LocalVoiceoverSettingTab extends PluginSettingTab {
	private readonly voiceover: SettingsPlugin;

	constructor(app: App, plugin: Plugin) {
		super(app, plugin);
		this.voiceover = plugin as unknown as SettingsPlugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName("Speed")
			.setDesc("Speech speed. Lower is slower.")
			.addSlider((slider) => {
				const input = (slider.sliderEl.parentElement as HTMLElement).createEl("input", {
					cls: "local-voiceover-slider-value",
					type: "number",
					value: this.voiceover.settings.speed.toFixed(2),
				});
				input.min = "0.5";
				input.max = "2";
				input.step = "0.05";
				input.addEventListener("change", () => void (async () => {
					const value = Number(input.value);
					if (!Number.isFinite(value)) return;
					this.voiceover.settings.speed = value;
					normalizeSpeechSettings(this.voiceover.settings);
					input.value = this.voiceover.settings.speed.toFixed(2);
					slider.setValue(this.voiceover.settings.speed);
					await this.voiceover.saveSettings();
				})());
				return slider
					.setLimits(0.5, 2, 0.05)
					.setValue(this.voiceover.settings.speed)
					.onChange(async (value) => {
						input.value = value.toFixed(2);
						this.voiceover.settings.speed = value;
						await this.voiceover.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName("Variation")
			.setDesc("Voice variation. Lower is steadier.")
			.addSlider((slider) => {
				const input = (slider.sliderEl.parentElement as HTMLElement).createEl("input", {
					cls: "local-voiceover-slider-value",
					type: "number",
					value: this.voiceover.settings.variation.toFixed(2),
				});
				input.min = "0";
				input.max = "1";
				input.step = "0.01";
				input.addEventListener("change", () => void (async () => {
					const value = Number(input.value);
					if (!Number.isFinite(value)) return;
					this.voiceover.settings.variation = value;
					normalizeSpeechSettings(this.voiceover.settings);
					input.value = this.voiceover.settings.variation.toFixed(2);
					slider.setValue(this.voiceover.settings.variation);
					await this.voiceover.saveSettings();
				})());
				return slider
					.setLimits(0, 1, 0.01)
					.setValue(this.voiceover.settings.variation)
					.onChange(async (value) => {
						input.value = value.toFixed(2);
						this.voiceover.settings.variation = value;
						await this.voiceover.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName("Seed")
			.setDesc("A safe integer. The same seed repeats the same sample on this runtime.")
			.addText((text) =>
				text.setValue(String(this.voiceover.settings.seed)).onChange(async (value) => {
					const seed = Number(value);
					if (!Number.isSafeInteger(seed)) return;
					this.voiceover.settings.seed = seed;
					normalizeSpeechSettings(this.voiceover.settings);
					await this.voiceover.saveSettings();
				}),
			);
		new Setting(containerEl)
			.setName("Highlight spoken text")
			.setDesc("Highlight the currently playing text chunk in the editor.")
			.addToggle((toggle) =>
				toggle.setValue(this.voiceover.settings.highlightSpokenText).onChange(async (value) => {
					this.voiceover.settings.highlightSpokenText = value;
					this.voiceover.clearHighlight();
					await this.voiceover.saveSettings();
				}),
			);
	}
}
