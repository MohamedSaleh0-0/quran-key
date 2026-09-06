import type { NormalizationRule, PluginConfig } from "./types";
import builtinNormalizationRules from "../../data/normalizationRules.json";

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
	wrapperStart: "\uFD3F", // ﴿
	wrapperEnd: "\uFD3E", // ﴾
	referenceFormat: "[{surah}:{verse}]",
	normalizationRules: seedNormalizationRules(),

	// Qur'anic text styling
	quranFontFamily: "'KFGQPC Uthmanic Script HAFS', 'Amiri Quran', serif",
	quranFontSize: 1.3,
	quranLineHeight: 2.4,
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

	// Reflections
	customReflectionCategories: [],
	ayahNotesFolder: "ملاحظات الآيات",
	deleteSelectionAfterLinkingReflection: true,
	reflectionBacklinkAliasTemplate: "",
	reflectionBacklinkWrapTemplate: "{link}",
	reflectionEntryPrefixTemplate: "### {date}",
	reflectionEntrySeparator: "\n\n---\n\n",
	reflectionInsertionMode: "afterHeading",
	reflectionFileNameTemplate: "{ayahText} ({surah} {verse})",
	reflectionFileNameAyahTextMaxLength: 60,
	includeAyahTextInReflectionNote: true,
};

export function migrateLegacySettings(raw: Partial<PluginConfig> | undefined): Partial<PluginConfig> {
	if (!raw) return {};
	let migrated = raw;
	if ((raw as { referenceFormat?: string }).referenceFormat === "[Surah:Verse]") {
		migrated = { ...migrated, referenceFormat: "[{surah}:{verse}]" };
	}
	return migrated;
}