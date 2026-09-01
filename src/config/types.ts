/**
 * Central settings schema. Nothing in domain/application/infrastructure
 * reads a literal where a value here could go instead — see
 * docs/ARCHITECTURE.md §6 for the full hardcoded -> configurable map.
 */

export type Locale = "ar" | "en";

export type TafsirResolutionStrategy =
	| "explicit" // an override chosen in a picker for this specific call
	| "lineAliases" // book names/aliases mentioned in the current line's text
	| "favorites" // settings.favoriteBooksIds
	| "default"; // settings.defaultTafsirBookId

export type HeadingLevel = "##" | "###" | "####" | "#####";

export type SearchStrategy =
	| "literal" // PhraseMatcher: query words must appear contiguously, in order
	| "fuzzy"; // FuzzyMatcher: query words may appear anywhere, in any order

/** A tafsir source. Builtin books (data/tafsirBooks.json) and
 *  user-added books (settings.customTafsirBooks) share this exact shape —
 *  a custom source is not a second-class citizen. */
export interface TafsirBookDescriptor {
	id: string;
	name: string;
	aliases: string[];
	/** {bookId}, {surahId}, {ayahId} are substituted at fetch time. */
	urlTemplate: string;
	isBuiltin: boolean;
}

/** A تدبر/أثر category. Builtin categories (data/reflectionCategories.json)
 *  and user-added ones (settings.customReflectionCategories) share this
 *  exact shape. */
export interface ReflectionCategoryDescriptor {
	id: string;
	name: string;
	/** Vault-relative folder this category's per-ayah files live under. */
	folder: string;
	isBuiltin: boolean;
}

/** One Arabic-text normalization rule. Ships with sane defaults in
 *  settings.normalizationRules; fully user-editable from there. */
export interface NormalizationRule {
	id: string;
	description: string;
	/** Regex source (no slashes). Matched literally against normalized text. */
	pattern: string;
	flags: string;
	replacement: string;
	enabled: boolean;
}

export interface PluginConfig {
	// --- Text normalization & verse formatting ---
	stripTashkeel: boolean;
	useOrnateNumbers: boolean;
	/** Ring glyph used to wrap ornate ayah numbers, e.g. "۝". */
	ornateRingGlyph: string;
	/** Verse wrapper glyphs, e.g. "﴿" / "﴾". */
	wrapperStart: string;
	wrapperEnd: string;
	/** Template with {surah} and {verse} placeholders, e.g. "[{surah}:{verse}]".
	 *  Actually compiled into the parser regex AND the output formatter —
	 *  see VerseReference.compile() (fixes the v1 dead-setting bug). */
	referenceFormat: string;
	/** User-editable normalization/substitution rules, seeded from
	 *  data/normalizationRules.json but independent after first load. */
	normalizationRules: NormalizationRule[];

	// --- Qur'anic text styling (Live Preview / Reading view) ---
	quranFontFamily: string;
	quranFontSize: number; // em
	quranLineHeight: number;
	quranColor: string;
	/** Whether ornate ayah numbers get their own highlight class
	 *  (.quran-key-ornate-number) in Live Preview and Reading view.
	 *  Independent of useOrnateNumbers, which controls the character
	 *  substitution itself — this only controls whether that substituted
	 *  text is additionally styled. */
	styleOrnateNumbers: boolean;
	/** Raw CSS appended verbatim after the generated :root variables (see
	 *  applyStyleVariables). Lets a user override .cm-quran-key-text,
	 *  .quran-key-ornate-number, or anything else without editing
	 *  styles.css directly. */
	customCss: string;

	// --- Search & interface ---
	showAnalytics: boolean;
	maxSuggestionResults: number;
	maxSlidingWindowWords: number;
	interfaceLanguage: Locale;
	/** Which matcher SearchQuranVerses delegates to — see SearchStrategy. */
	searchStrategy: SearchStrategy;

	// --- Tafsir ---
	defaultTafsirBookId: string;
	favoriteBooksIds: string[];
	/** User-added sources, merged with the builtin catalogue at runtime. */
	customTafsirBooks: TafsirBookDescriptor[];
	/** Order in which book-resolution strategies are tried (NFR-6). */
	tafsirBookResolutionOrder: TafsirResolutionStrategy[];
	includeAyahTextInTafsir: boolean;
	useHorizontalDivider: boolean;
	rangeHeadingLevel: HeadingLevel;
	bookHeadingLevel: HeadingLevel;
	/** Delay between successive tafsir requests once a range is "long". */
	tafsirFetchDelayMs: number;
	tafsirFetchDelayThreshold: number;

	// --- Reflections (تدبر / أثر) ---
	/** User-added categories, merged with the builtin تدبر/أثر catalogue at
	 *  runtime (see ReflectionCategoryCatalog). */
	customReflectionCategories: ReflectionCategoryDescriptor[];
	/** Default true = a true "move": the original selection is removed
	 *  from the editor once written to every target ayah file. False
	 *  behaves like a copy — the selection stays untouched. */
	deleteSelectionAfterLinkingReflection: boolean;
	/** Whatever precedes each dated entry inside a file — not restricted
	 *  to a heading. {date} is the only placeholder, e.g. "### {date}",
	 *  "- {date}", "1. {date}", or empty for no prefix. */
	reflectionEntryPrefixTemplate: string;
	/** Must contain {ayahText}; {surah} and {verse} are also available.
	 *  Builds each per-ayah file's on-disk title — see
	 *  ReflectionFileNameBuilder. */
	reflectionFileNameTemplate: string;
	/** Ayah text inside a file title is truncated at this length (0 = no
	 *  truncation) — some ayat are very long. */
	reflectionFileNameAyahTextMaxLength: number;
}

