import type { NormalizationRule, PluginConfig } from "./types";
import builtinNormalizationRules from "../../data/normalizationRules.json";

function seedNormalizationRules(): NormalizationRule[] {
	return (builtinNormalizationRules as Array<Record<string, unknown>>).map((r) => ({
		id: String(r.id),
		description: String(r.description),
		pattern: String(r.pattern),
		flags: typeof r.flags === "string" ? r.flags : "g",
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
	ayahMarkerStyle: "plain",
	quranFontSize: 1.3,
	quranLineHeight: 2.4,
	quranColor: "#dfc56b",
	quranColorDark: "#dfc56b",
	quranColorLight: "#8a6418",
	styleOrnateNumbers: true,
	customCss: "",

	// Search & interface
	showAnalytics: true,
	maxSuggestionResults: 30,
	maxSlidingWindowWords: 12,
	interfaceLanguage: "ar",
	searchStrategy: "literal",

	// Tafsir
	customTafsirBooks: [],
	tafsirBookSortOrder: "name",
	tafsirPackages: [],
	tafsirCacheEnabled: true,
	tafsirCacheFolder: "tafsir",
	includeAyahTextInTafsir: true,
	useHorizontalDivider: true,
	rangeHeadingLevel: "###",
	bookHeadingLevel: "####",
	ayahHeadingLevel: "#####",
	tafsirRangeHeadingTemplate: "{surah} ({start}–{end})",
	tafsirBookHeadingTemplate: "{book}",
	tafsirAyahHeadingTemplate: "آية {ayah}",

	// Reflections
	customReflectionCategories: [],
	ayahNotesFolder: "ملاحظات الآيات",
	surahNotesFolder: "سور القرآن",
	surahNoteFileNameTemplate: "{surah}",
	linkAyahMarkersOnInsert: true,
	showOrphanAyahConversionPreview: true,
	showReflectionSuccessNotice: true,
	reflectionCategoryDelimiter: "--",
	reflectionEntryTemplate: "- {content}",
	reflectionEntryPrefixTemplate: "### {date}",
	reflectionEntrySeparator: "\n",
	reflectionInsertionMode: "afterHeading",
	reflectionFileNameTemplate: "{ayahText} ({surah} {verse})",
	reflectionFileNameAyahTextMaxLength: 60,
	reflectionFileNameAyahTextMaxWords: 0,
	ayahNoteTemplate: "{ayah}\n\n",
	includeAyahTextInReflectionNote: true,
};

export function migrateLegacySettings(raw: Partial<PluginConfig> | undefined): Partial<PluginConfig> {
	if (!raw) return {};
	let migrated = raw;
	const legacyColor = (raw as Partial<PluginConfig> & { quranColor?: string }).quranColor;
	if (legacyColor && !raw.quranColorDark && !raw.quranColorLight) {
		migrated = { ...migrated, quranColorDark: legacyColor, quranColorLight: legacyColor };
	}
	if (Array.isArray(raw.tafsirPackages)) {
		migrated = {
			...migrated,
			tafsirPackages: raw.tafsirPackages.filter((pkg) => !pkg.isBuiltin).map((pkg) => ({ ...pkg, isBuiltin: false })),
		};
	}
	if (Array.isArray(raw.normalizationRules) && !raw.normalizationRules.some((rule) => rule.id === "thaal-ya-variant")) {
		const builtinRule = seedNormalizationRules().find((rule) => rule.id === "thaal-ya-variant");
		if (builtinRule) migrated = { ...migrated, normalizationRules: [...raw.normalizationRules, builtinRule] };
	}
	const legacy = raw as Partial<PluginConfig> & { favoriteBooksIds?: string[] };
	if (raw.tafsirPackages === undefined && Array.isArray(legacy.favoriteBooksIds) && legacy.favoriteBooksIds.length > 0) {
		migrated = {
			...migrated,
			tafsirPackages: [
				{
					id: "migrated-selection",
					name: "المجموعة السابقة",
					bookIds: [...legacy.favoriteBooksIds],
					isBuiltin: false,
				},
			],
		};
	}
	if ((raw as { referenceFormat?: string }).referenceFormat === "[Surah:Verse]") {
		migrated = { ...migrated, referenceFormat: "[{surah}:{verse}]" };
	}
	if (raw.reflectionEntryTemplate === undefined && raw.reflectionEntryPrefixTemplate !== undefined) {
		const legacy = String(raw.reflectionEntryPrefixTemplate);
		migrated = {
			...migrated,
			reflectionEntryTemplate: legacy === "### {date}" ? DEFAULT_SETTINGS.reflectionEntryTemplate : `- {content} — ${legacy}`,
		};
	}
	if (raw.reflectionEntryTemplate === "- {content} — {date}" || raw.reflectionEntryTemplate === "- {content} — - ") {
		migrated = { ...migrated, reflectionEntryTemplate: DEFAULT_SETTINGS.reflectionEntryTemplate };
	}
	if (raw.ayahNoteTemplate === undefined && raw.includeAyahTextInReflectionNote !== undefined) {
		migrated = {
			...migrated,
			ayahNoteTemplate: raw.includeAyahTextInReflectionNote ? DEFAULT_SETTINGS.ayahNoteTemplate : "",
		};
	}
	return migrated;
}
