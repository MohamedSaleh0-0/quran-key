import type { ReflectionCategory } from "../entities/ReflectionCategory";

export interface AyahIdentity {
	surahId: number;
	surahName: string;
	ayahId: number;
	/** Raw (unwrapped) ayah text — used for the {ayahText} filename placeholder. */
	ayahTextRaw: string;
	/** Fully-formatted ayah text (wrapper glyphs / ornate numbers already
	 *  applied per settings) — used when quoting the ayah inside a
	 *  freshly-created note's body. Only read if includeAyahText is true. */
	ayahTextBodyFormatted: string;
}

export interface ReflectionEntryFormatting {
	insertionMode: "afterHeading" | "endOfSection";
	entrySeparator: string;
	includeAyahText: boolean;
	fileNameTemplate: string;
}

export interface AyahNoteRef {
	/** Display title (basename, no folder/extension) of the resolved note
	 *  — usable directly as a wikilink target: `[[${title}]]`. */
	title: string;
}

/**
 * How the plugin persists content against ayahs: one unified note per
 * ayah by default, with an opt-in per-category "own folder" escape hatch.
 * Replaces v1/v2.0's ReflectionFileRepository (one file per
 * category+ayah, always) — that shape no longer matches the unified note
 * default. See docs/ARCHITECTURE.md §9 "Unified ayah notes".
 */
export interface AyahNoteRepository {
	/** Writes `entryMarkdown` under `ancestorChain`'s leaf category's
	 *  heading (creating any missing ancestor headings top-down first —
	 *  see ReflectionCategoryCatalog.ancestorChain). For an "ownFolder"
	 *  leaf category, the entry instead goes to that category's own
	 *  per-ayah file, and a bidirectional link is kept in sync with the
	 *  unified note. Creates the unified note (and, for "ownFolder", the
	 *  own-folder note) if it doesn't exist yet. */
	appendEntry(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef>;

	/** Union-merges `relatedNoteTitles` into this ayah's `relatedAyat`
	 *  frontmatter on its *unified* note — creates the note if it doesn't
	 *  exist yet, never overwrites links already there. */
	linkRelatedAyat(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		relatedNoteTitles: readonly string[]
	): Promise<AyahNoteRef>;

	/** Resolves the unified note's display title for this ayah. If
	 *  `createIfMissing` is false and no such note exists yet, returns
	 *  null instead of creating one (used for a backlink where "nothing
	 *  logged yet for this ayah" should stay that way). */
	resolveUnifiedNoteTitle(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		createIfMissing: boolean
	): Promise<string | null>;
}
