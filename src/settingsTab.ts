import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";
import type { LocalVoiceoverSettings } from "./settings";

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
