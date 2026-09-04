import type { Ayah } from "../../domain/entities/Ayah";
import type { AyahNoteRepository } from "../../domain/ports/AyahNoteRepository";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";

/**
 * Backs the "link ayat" command (e.g. البقرة 155 <-> هود 7 <-> الملك 2,
 * every one of which contains "ليبلوكم أيكم أحسن عملا"): the user picks
 * 2+ ayahs in a modal, and every one of their unified notes ends up with
 * the others listed in its `relatedAyat` frontmatter.
 *
 * No "reason/description" field by design (kept deliberately simple) —
 * just the links. Merge is a union (see AyahNoteRepository.linkRelatedAyat
 * and the architecture discussion this was designed in): linking a new
 * ayah into an existing group never drops links already recorded from a
 * previous linking session.
 */
export class LinkAyahsTogether {
	constructor(
		private readonly ayahNotes: AyahNoteRepository,
		private readonly formatter: VerseOutputFormatter
	) {}

	async execute(
		ayahs: readonly Ayah[],
		fileNameTemplate: string,
		includeAyahText: boolean,
		quoteFormatting: FormattingOptions
	): Promise<void> {
		if (ayahs.length < 2) return; // nothing to link

		const identities = ayahs.map((a) => ({
			surahId: a.surahId,
			surahName: a.surahName,
			ayahId: a.ayahId,
			ayahTextRaw: a.text,
			ayahTextBodyFormatted: this.formatter.format([a], quoteFormatting),
		}));

		// Resolve (creating if needed) every note's title up front, so
		// linking is symmetric even when some of these ayahs have never
		// had a note before.
		const titles = await Promise.all(
			identities.map((id) => this.ayahNotes.resolveUnifiedNoteTitle(id, fileNameTemplate, includeAyahText, true))
		);

		for (let i = 0; i < identities.length; i++) {
			const others = titles.filter((_, j) => j !== i).filter((title): title is string => title !== null);
			if (others.length === 0) continue;
			await this.ayahNotes.linkRelatedAyat(identities[i], fileNameTemplate, includeAyahText, others);
		}
	}
}
