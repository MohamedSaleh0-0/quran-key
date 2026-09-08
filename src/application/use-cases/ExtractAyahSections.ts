import type { Ayah } from "../../domain/entities/Ayah";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { AyahNoteRepository, AyahSectionExtraction } from "../../domain/ports/AyahNoteRepository";

/** Reads an existing section from ayah notes without creating files or
 * changing note content. This is the safe source layer for future Quran Pedia
 * snapshot and refreshable collection workflows. */
export class ExtractAyahSections {
	constructor(private readonly ayahNotes: AyahNoteRepository) {}

	async execute(ayahs: readonly Ayah[], category: ReflectionCategory): Promise<AyahSectionExtraction[]> {
		const extracted: AyahSectionExtraction[] = [];
		for (const ayah of ayahs) {
			const section = await this.ayahNotes.extractSection(ayah.surahId, ayah.ayahId, {
				headingLevel: category.headingLevel,
				headingText: category.headingText,
			});
			if (section) extracted.push(section);
		}
		return extracted;
	}
}
