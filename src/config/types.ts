export type Locale = "ar" | "en";

export type TafsirResolutionStrategy =
	| "explicit"
	| "lineAliases"
	| "favorites"
	| "default";

export type SearchStrategy = "literal" | "fuzzy";

export type CategoryOrganizationMode = "unified" | "ownFolder";

export type ReflectionInsertionMode = "afterHeading" | "endOfSection";

export interface TafsirBookDescriptor {
	id: string;
	name: string;
	aliases: string[];
	urlTemplate: string;
	isBuiltin: boolean;
}

export interface ReflectionCategoryDescriptor {
	id: string;
	name: string;
	organizationMode: CategoryOrganizationMode;
	headingText: string;
	headingLevel: string;
	folder: string;
	isBuiltin: boolean;
}

export interface NormalizationRule {
	id: string;
	description: string;
	pattern: string;
	flags: string;
	replacement: string;
	enabled: boolean;
}

export interface PluginConfig {
	// --- Text normalization & verse formatting ---
	stripTashkeel: boolean;
	wrapperStart: string;
	wrapperEnd: string;
	referenceFormat: string;
	normalizationRules: NormalizationRule[];

	// --- Qur'anic text styling ---
	quranFontFamily: string;
	quranFontSize: number;
	quranLineHeight: number;
	quranColor: string;
	styleOrnateNumbers: boolean;
	customCss: string;

	// --- Search & interface ---
	showAnalytics: boolean;
	maxSuggestionResults: number;
	maxSlidingWindowWords: number;
	interfaceLanguage: Locale;
	searchStrategy: SearchStrategy;
	enableAtSectionTrigger: boolean;

	// --- Tafsir ---
	defaultTafsirBookId: string;
	favoriteBooksIds: string[];
	customTafsirBooks: TafsirBookDescriptor[];
	tafsirBookResolutionOrder: TafsirResolutionStrategy[];
	includeAyahTextInTafsir: boolean;
	useHorizontalDivider: boolean;
	rangeHeadingLevel: string;
	bookHeadingLevel: string;
	tafsirFetchDelayMs: number;
	tafsirFetchDelayThreshold: number;

	// --- Reflections ---
	customReflectionCategories: ReflectionCategoryDescriptor[];
	ayahNotesFolder: string;
	surahNotesFolder: string;
	surahNoteFileNameTemplate: string;
	linkAyahMarkersOnInsert: boolean;
	deleteSelectionAfterLinkingReflection: boolean;
	reflectionBacklinkAliasTemplate: string;
	reflectionBacklinkWrapTemplate: string;
	reflectionEntryPrefixTemplate: string;
	includeReflectionEntryDate: boolean;
	reflectionEntrySeparator: string;
	reflectionInsertionMode: ReflectionInsertionMode;
	reflectionFileNameTemplate: string;
	reflectionFileNameAyahTextMaxLength: number;
	includeAyahTextInReflectionNote: boolean;
}
