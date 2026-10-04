import type { AyahMarkerStyle } from "../domain/services/AyahMarkerFormatter";

export type Locale = "ar" | "en";

export type SearchStrategy = "literal" | "fuzzy";

export type CategoryOrganizationMode = "unified" | "ownFolder";

export type ReflectionInsertionMode = "afterHeading" | "endOfSection";
export type TafsirBookSortOrder = "name" | "created";

export interface TafsirBookDescriptor {
	id: string;
	name: string;
	aliases: string[];
	urlTemplate: string;
	isBuiltin: boolean;
	/** Set for user-created books; built-in books may omit it. */
	createdAt?: number;
}

export interface TafsirPackageDescriptor {
	id: string;
	name: string;
	bookIds: string[];
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
	dedicatedCommand?: boolean;
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
	ayahMarkerStyle: AyahMarkerStyle;
	quranFontSize: number;
	quranLineHeight: number;
	quranColor: string;
	quranColorDark: string;
	quranColorLight: string;
	styleOrnateNumbers: boolean;
	customCss: string;

	// --- Search & interface ---
	showAnalytics: boolean;
	maxSuggestionResults: number;
	maxSlidingWindowWords: number;
	interfaceLanguage: Locale;
	searchStrategy: SearchStrategy;

	// --- Tafsir ---
	customTafsirBooks: TafsirBookDescriptor[];
	tafsirBookSortOrder: TafsirBookSortOrder;
	tafsirPackages: TafsirPackageDescriptor[];
	tafsirCacheEnabled: boolean;
	tafsirCacheFolder: string;
	includeAyahTextInTafsir: boolean;
	useHorizontalDivider: boolean;
	rangeHeadingLevel: string;
	bookHeadingLevel: string;
	ayahHeadingLevel: string;
	tafsirRangeHeadingTemplate: string;
	tafsirBookHeadingTemplate: string;
	tafsirAyahHeadingTemplate: string;

	// --- Reflections ---
	customReflectionCategories: ReflectionCategoryDescriptor[];
	ayahNotesFolder: string;
	surahNotesFolder: string;
	surahNoteFileNameTemplate: string;
	linkAyahMarkersOnInsert: boolean;
	showOrphanAyahConversionPreview: boolean;
	showReflectionSuccessNotice: boolean;
	reflectionCategoryDelimiter: string;
	reflectionEntryTemplate: string;
	reflectionEntryPrefixTemplate: string;
	/** @deprecated Log spacing is now part of reflectionEntryTemplate. */
	reflectionEntrySeparator: string;
	reflectionInsertionMode: ReflectionInsertionMode;
	reflectionFileNameTemplate: string;
	reflectionFileNameAyahTextMaxLength: number;
	reflectionFileNameAyahTextMaxWords: number;
	/** Markdown body template for a newly-created ayah note. Supports {ayah}. */
	ayahNoteTemplate: string;
	/** @deprecated Migrated to ayahNoteTemplate. */
	includeAyahTextInReflectionNote: boolean;
}
