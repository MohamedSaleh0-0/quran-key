import type { NormalizationRule, PluginConfig } from "./types";
import builtinNormalizationRules from "../../data/normalizationRules.json";

/** Seed value for settings.normalizationRules — a snapshot of
 *  data/normalizationRules.json with `enabled: true` added. After first
 *  load this array lives entirely in the user's data.json; edits here
 *  only affect brand-new installs. */
function seedNormalizationRules(): NormalizationRule[] {
	return (builtinNormalizationRules as Array<Record<string, unknown>>).map((r) => ({
		id: String(r.id),
		description: String(r.description),
		pattern: String(r.pattern),
		flags: String(r.flags ?? "g"),
		replacement: String(r.replacement),
		enabled: true,
	}));
}

export const DEFAULT_SETTINGS: PluginConfig = {
	// Text normalization & verse formatting
	stripTashkeel: false,
	useOrnateNumbers: true,
	ornateRingGlyph: "\u06DD", // ۝
	wrapperStart: "\uFD3F", // ﴿
	wrapperEnd: "\uFD3E", // ﴾
	referenceFormat: "[{surah}:{verse}]",
	normalizationRules: seedNormalizationRules(),

	// Qur'anic text styling
	quranFontFamily: "'Amiri', 'KFGQPC Uthman Taha Naskh', serif",
	quranFontSize: 1.1,
	quranLineHeight: 2.1,
	quranColor: "#dfc56b",
	styleOrnateNumbers: true,
	customCss: "",

	// Search & interface
	showAnalytics: true,
	maxSuggestionResults: 30,
	maxSlidingWindowWords: 12,
	interfaceLanguage: "ar",
	searchStrategy: "literal",

	// Tafsir
	defaultTafsirBookId: "saadi",
	favoriteBooksIds: ["saadi", "ibn-katheer", "muyassar"],
	customTafsirBooks: [],
	tafsirBookResolutionOrder: ["explicit", "lineAliases", "favorites", "default"],
	includeAyahTextInTafsir: true,
	useHorizontalDivider: true,
	rangeHeadingLevel: "###",
	bookHeadingLevel: "####",
	tafsirFetchDelayMs: 150,
	tafsirFetchDelayThreshold: 2,
};

/** v1 stored the literal string "[Surah:Verse]" as a display-only setting
 *  that nothing ever read (see docs/REQUIREMENTS.md NFR-3). If we see that
 *  exact legacy value on load, upgrade it to the real template so v1 users
 *  don't silently get a non-functional reference format. */
export function migrateLegacySettings(raw: Partial<PluginConfig> | undefined): Partial<PluginConfig> {
	if (!raw) return {};
	if ((raw as { referenceFormat?: string }).referenceFormat === "[Surah:Verse]") {
		return { ...raw, referenceFormat: "[{surah}:{verse}]" };
	}
	return raw;
}
