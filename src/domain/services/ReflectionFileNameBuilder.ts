const AYAH_TEXT_PLACEHOLDER = "{ayahText}";
const SURAH_PLACEHOLDER = "{surah}";
const VERSE_PLACEHOLDER = "{verse}";

/**
 * Builds the on-disk title for a single ayah's تدبر/أثر file from a
 * user-configurable template (settings.reflectionFileNameTemplate) — same
 * placeholder-substitution convention as VerseReference, just for a
 * filename instead of an inline citation.
 *
 * Defaults to quoting the ayah's own text (plus its reference) rather
 * than the reference alone, per explicit request: the file's title
 * should read as the ayah, not just its address. `{ayahText}` isn't
 * required — a user who prefers the old reference-only titles can set
 * the template to just "{surah} {verse}".
 *
 * File *identity* (which ayah a file belongs to) is never derived from
 * this title — see ObsidianReflectionFileRepository, which keys lookups
 * off frontmatter instead — so changing this template later never
 * orphans/duplicates existing files, only affects new ones.
 */
export class ReflectionFileNameBuilder {
	constructor(private readonly template: string, private readonly maxAyahTextLength: number) {}

	build(surahName: string, ayahId: number, ayahText: string): string {
		const truncated = this.truncate(ayahText.trim());
		return this.template
			.split(AYAH_TEXT_PLACEHOLDER)
			.join(truncated)
			.split(SURAH_PLACEHOLDER)
			.join(surahName)
			.split(VERSE_PLACEHOLDER)
			.join(String(ayahId))
			.replace(/\s{2,}/g, " ")
			.trim();
	}

	private truncate(text: string): string {
		if (this.maxAyahTextLength <= 0 || text.length <= this.maxAyahTextLength) return text;
		return `${text.slice(0, this.maxAyahTextLength).trim()}\u2026`;
	}
}
