export interface LocalVoiceoverSettings {
	highlightSpokenText: boolean;
	speed: number;
	variation: number;
	seed: number;
}

export const DEFAULT_SETTINGS: LocalVoiceoverSettings = {
	highlightSpokenText: true,
	speed: 1,
	variation: 0.667,
	seed: 0,
};

export function normalizeSpeechSettings(settings: LocalVoiceoverSettings): void {
	settings.speed = Math.min(2, Math.max(0.5, settings.speed));
	settings.variation = Math.min(1, Math.max(0, settings.variation));
	settings.seed = Number.isSafeInteger(settings.seed) ? settings.seed : DEFAULT_SETTINGS.seed;
}
