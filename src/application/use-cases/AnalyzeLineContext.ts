import type { EditorPort } from "../../domain/ports/EditorPort";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";
import { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import { SlidingWindowSearch } from "../../domain/services/SlidingWindowSearch";

export interface LineContext {
	surahId: number;
	surahName: string;
	startAyah: number;
	endAyah: number;
}

/** Loose "Surah N[-M]" prose pattern — independent of the configured
 *  bracket reference format, this recognizes plain mentions like
 *  "البقرة 255" or "البقرة: 255-257" (FR-7). */
const LOOSE_RANGE_REGEX = /(?:^|\s)([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,2})\s*[:\s]\s*(\d+(?:\s*-\s*\d+)?)/;

/** Read-only line analysis (FR-6/7/8): figure out which ayah(s) the
 *  cursor is near without mutating the editor. Used both by the extract
 *  command's context-parsing entry points and by the "fetch tafsir for
 *  current line" command. */
export class AnalyzeLineContext {
	constructor(
		private readonly repository: QuranRepository,
		private readonly normalizer: ArabicNormalizer,
		private readonly reference: CompiledVerseReference,
		private readonly slidingWindow: SlidingWindowSearch
	) {}

	execute(editor: EditorPort): LineContext | null {
		const cursor = editor.getCursor();
		const currentLine = editor.getLine(cursor.line);
		if (!currentLine || currentLine.trim() === "") return null;

		const explicit = this.reference.find(currentLine);
		if (explicit) {
			const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(explicit.surahName));
			if (surah) {
				return {
					surahId: surah.id,
					surahName: surah.name,
					startAyah: explicit.startAyah,
					endAyah: explicit.endAyah,
				};
			}
		}

		const loose = currentLine.match(LOOSE_RANGE_REGEX);
		if (loose) {
			const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(loose[1]));
			if (surah) {
				const parts = loose[2].split("-");
				const start = parseInt(ArabicNormalizer.normalizeNumbers(parts[0].trim()), 10);
				const end = parts[1] ? parseInt(ArabicNormalizer.normalizeNumbers(parts[1].trim()), 10) : start;
				return { surahId: surah.id, surahName: surah.name, startAyah: start, endAyah: end };
			}
		}

		const slid = this.slidingWindow.find(currentLine, this.repository.getAllAyahs(), this.repository.getSearchCorpusText());
		if (slid && slid.ayahs.length > 0) {
			const target = slid.ayahs[0];
			return {
				surahId: target.surahId,
				surahName: target.surahName,
				startAyah: target.ayahId,
				endAyah: target.ayahId,
			};
		}

		return null;
	}
}
