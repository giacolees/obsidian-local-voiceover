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
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 2, 0.05)
					.setValue(this.voiceover.settings.speed)
					.onChange(async (value) => {
						this.voiceover.settings.speed = value;
						await this.voiceover.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Variation")
			.setDesc("Voice variation. Lower is steadier.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 1, 0.01)
					.setValue(this.voiceover.settings.variation)
					.onChange(async (value) => {
						this.voiceover.settings.variation = value;
						await this.voiceover.saveSettings();
					}),
			);
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
