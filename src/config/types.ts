/**
 * Central settings schema. Nothing in domain/application/infrastructure
 * reads a literal where a value here could go instead — see
 * docs/ARCHITECTURE.md §6 for the full hardcoded -> configurable map.
 *
 * v2.1 changes (see docs/ARCHITECTURE.md §9 "Unified ayah notes"):
 * - `HeadingLevel` union removed. Obsidian's own convention (H1 often
 *   owned by the note title) means different users want different
 *   levels for different purposes — a fixed "H3-H5" menu (v2.0) was
 *   itself a hardcoded literal masquerading as a setting. Every heading
 *   level is now a free-text field (still validated at compile time by
 *   VerseReference-style helpers where it matters, e.g. non-empty and
 *   matching /^#{1,6}$/).
 * - `ReflectionCategoryDescriptor` gained `organizationMode`,
 *   `headingText`, `headingLevel`, `parentCategoryId` — a category no
 *   longer *must* own a folder; by default (`"unified"`) its entries
 *   live under a heading inside one note per ayah. `folder` is only
 *   consulted when `organizationMode === "ownFolder"`.
 */

export type Locale = "ar" | "en";

export type TafsirResolutionStrategy =
	| "explicit" // an override chosen in a picker for this specific call
	| "lineAliases" // book names/aliases mentioned in the current line's text
	| "favorites" // settings.favoriteBooksIds
	| "default"; // settings.defaultTafsirBookId

export type SearchStrategy =
	| "literal" // PhraseMatcher: query words must appear contiguously, in order
	| "fuzzy"; // FuzzyMatcher: query words may appear anywhere, in any order

/** How a reflection entry finds a home. "unified" (the default): entries
 *  live under this category's heading inside the single note for that
 *  ayah. "ownFolder": entries live in their own per-ayah file under
 *  `folder`, and a single link line is kept in sync (both directions)
 *  with the unified note, which stays "the reference" either way. */
export type CategoryOrganizationMode = "unified" | "ownFolder";

/** Where a new entry lands relative to already-existing entries under
 *  the same heading. "afterHeading": newest directly under the heading
 *  (newest-first). "endOfSection": appended at the section's end
 *  (chronological, oldest-first) — see HeadingSectionInserter. This is
 *  one global setting (a formatting taste, not a per-category axis). */
export type ReflectionInsertionMode = "afterHeading" | "endOfSection";

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

/**
 * A category of personal writing linked to an ayah (تدبر، أثر، or any
 * user-defined category — "فوائد عملية", "فوائد لغوية", ...). Only تدبر
 * and أثر are builtin; everything else is a use-case the user configures
 * for themselves, including whether it lives in the unified note or gets
 * its own folder.
 */
export interface ReflectionCategoryDescriptor {
	id: string;
	name: string;
	organizationMode: CategoryOrganizationMode;
	/** Heading text this category's entries live under, e.g. "تدبرات". */
	headingText: string;
	/** e.g. "###". Free text — see the file-level note above. */
	headingLevel: string;
	/** Id of an ancestor category whose heading this one should nest
	 *  under the first time it's created (e.g. "فوائد لغوية" under
	 *  "فوائد") — null for a top-level heading. Consulted only once, at
	 *  heading-creation time; see HeadingSectionInserter and
	 *  ReflectionCategoryCatalog.ancestorChain for the cycle-safe walk. */
	parentCategoryId: string | null;
	/** Vault-relative folder — used only when organizationMode is "ownFolder". */
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
	styleOrnateNumbers: boolean;
	customCss: string;

	// --- Search & interface ---
	showAnalytics: boolean;
	maxSuggestionResults: number;
	maxSlidingWindowWords: number;
	interfaceLanguage: Locale;
	searchStrategy: SearchStrategy;

	// --- Tafsir ---
	defaultTafsirBookId: string;
	favoriteBooksIds: string[];
	customTafsirBooks: TafsirBookDescriptor[];
	tafsirBookResolutionOrder: TafsirResolutionStrategy[];
	includeAyahTextInTafsir: boolean;
	useHorizontalDivider: boolean;
	/** Free-text heading marker, e.g. "###". See file-level note above. */
	rangeHeadingLevel: string;
	/** Free-text heading marker, e.g. "####". */
	bookHeadingLevel: string;
	tafsirFetchDelayMs: number;
	tafsirFetchDelayThreshold: number;

	// --- Reflections (تدبر / أثر / user-defined categories) ---
	customReflectionCategories: ReflectionCategoryDescriptor[];
	/** Vault-relative folder for unified per-ayah notes (used by every
	 *  category whose organizationMode is "unified", i.e. by default). */
	ayahNotesFolder: string;
	/** When true (default), the selection that was logged is replaced
	 *  in its original note with a backlink to the ayah note instead of
	 *  being erased — v1/v2.0's `deleteSelectionAfterLinkingReflection`
	 *  used to just delete it, silently losing the content's origin.
	 *  When false, the selection is left completely untouched (a copy). */
	deleteSelectionAfterLinkingReflection: boolean;
	/** {surah}/{verse}/{ayahText} available. Empty = link with no alias,
	 *  i.e. plain "[[Note Title]]". */
	reflectionBacklinkAliasTemplate: string;
	/** Wraps the rendered backlink; the only placeholder is {link}. */
	reflectionBacklinkWrapTemplate: string;
	/** Whatever precedes each dated entry — not restricted to a heading.
	 *  {date} is the only placeholder, e.g. "### {date}", "- {date}",
	 *  "1. {date}", or empty for no prefix at all. */
	reflectionEntryPrefixTemplate: string;
	/** Inserted between consecutive entries under the same heading (or
	 *  in the same own-folder file). Can be left empty. */
	reflectionEntrySeparator: string;
	/** Where a new entry lands relative to existing ones — see
	 *  ReflectionInsertionMode. */
	reflectionInsertionMode: ReflectionInsertionMode;
	/** Must contain {ayahText}; {surah} and {verse} are also available.
	 *  Builds the unified/own-folder note's on-disk title. */
	reflectionFileNameTemplate: string;
	reflectionFileNameAyahTextMaxLength: number;
	/** Whether a freshly-created unified note gets the ayah's own text
	 *  quoted at the top (once, not repeated per entry). */
	includeAyahTextInReflectionNote: boolean;
}
