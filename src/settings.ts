export type MarkdownNormalizationMode = "default" | "none" | "custom";

export interface MarkdownNormalizationRules {
	headings: boolean;
	emphasis: boolean;
	links: boolean;
	listsAndQuotes: boolean;
	code: boolean;
	strikethroughAndRules: boolean;
}

export interface LocalVoiceoverSettings {
	highlightSpokenText: boolean;
	speed: number;
	variation: number;
	seed: number;
	markdownNormalization: MarkdownNormalizationMode;
	markdownRules: MarkdownNormalizationRules;
}

export const DEFAULT_MARKDOWN_RULES: MarkdownNormalizationRules = {
	headings: true,
	emphasis: true,
	links: true,
	listsAndQuotes: true,
	code: true,
	strikethroughAndRules: true,
};

export const DEFAULT_SETTINGS: LocalVoiceoverSettings = {
	highlightSpokenText: true,
	speed: 1,
	variation: 0.667,
	seed: 0,
	markdownNormalization: "default",
	markdownRules: { ...DEFAULT_MARKDOWN_RULES },
};

export function normalizeSpeechSettings(settings: LocalVoiceoverSettings): void {
	settings.speed = Math.min(2, Math.max(0.5, settings.speed));
	settings.variation = Math.min(1, Math.max(0, settings.variation));
	settings.seed = Number.isSafeInteger(settings.seed) ? settings.seed : DEFAULT_SETTINGS.seed;
	if (!(["default", "none", "custom"] as const).includes(settings.markdownNormalization))
		settings.markdownNormalization = DEFAULT_SETTINGS.markdownNormalization;
	settings.markdownRules = { ...DEFAULT_MARKDOWN_RULES, ...settings.markdownRules };
}
