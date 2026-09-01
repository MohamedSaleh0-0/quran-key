import type { Ayah } from "../../domain/entities/Ayah";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { ReflectionFileRepository } from "../../domain/ports/ReflectionFileRepository";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";
import type { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import type { ReflectionFileNameBuilder } from "../../domain/services/ReflectionFileNameBuilder";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";
import type { Locale } from "../../config/types";
import { t } from "../../config/strings";

export interface ReflectionLinkOptions {
	locale: Locale;
	/** True (default) = a real "move": the original selection is removed
	 *  from the editor once it's been written to every target ayah file.
	 *  False leaves it in place — a copy instead of a move. */
	deleteSelectionAfterLinking: boolean;
	/** Whatever precedes each dated entry inside a file — deliberately not
	 *  restricted to a heading: "### {date}", "- {date}", "1. {date}", or
	 *  empty for no prefix at all are all valid. {date} is the only
	 *  placeholder. */
	entryPrefixTemplate: string;
	/** Used only when quoting the full passage for a range link. */
	quoteFormattingOptions: FormattingOptions;
}

export interface DetectedCitation {
	surahId: number;
	surahName: string;
	startAyah: number;
	endAyah: number;
}

function formatDateISO(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/**
 * Links a selected piece of writing (a تدبر, أثر, or any other configured
 * category — see ReflectionCategoryCatalog) to an ayah or ayah range —
 * one dedicated file **per ayah**, not per range: linking a تدبر about
 * 3-5 writes the identical entry into ayah 3's file, ayah 4's file, and
 * ayah 5's file, each noting it's range-wide (not specific to that one
 * ayah) and quoting the full passage — so searching/browsing by any one
 * ayah in the range finds it directly, since it lives in that ayah's own
 * file. A single-ayah link skips both the range notice and the quoted
 * passage, since the file's own title already says which ayah it's about
 * (per explicit request: quoting is for passages, not single ayat).
 */
export class LinkReflectionToVerses {
	constructor(
		private readonly repository: QuranRepository,
		private readonly normalizer: ArabicNormalizer,
		private readonly reference: CompiledVerseReference,
		private readonly formatter: VerseOutputFormatter,
		private readonly fileNameBuilder: ReflectionFileNameBuilder,
		private readonly files: ReflectionFileRepository
	) {}

	/** If `text` already contains one of the user's own wrapped ayah
	 *  citations (the same `[Surah:N-M]` format used elsewhere in the
	 *  plugin), resolves the ayah range directly from it so the caller
	 *  can skip the manual verse picker entirely. */
	detectExistingCitation(text: string): DetectedCitation | null {
		const match = this.reference.find(text);
		if (!match) return null;
		const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(match.surahName));
		if (!surah) return null;
		return { surahId: surah.id, surahName: surah.name, startAyah: match.startAyah, endAyah: match.endAyah };
	}

	async execute(
		editor: EditorPort,
		selectionStart: EditorPosition,
		selectionEnd: EditorPosition,
		reflectionText: string,
		category: ReflectionCategory,
		surahId: number,
		surahName: string,
		startAyah: number,
		endAyah: number,
		options: ReflectionLinkOptions
	): Promise<void> {
		const isRange = endAyah > startAyah;
		const quotedPassage = isRange ? this.buildQuotedPassage(surahId, startAyah, endAyah, options.quoteFormattingOptions) : null;
		const entryMarkdown = this.buildEntryMarkdown(
			reflectionText,
			category.name,
			isRange,
			startAyah,
			endAyah,
			quotedPassage,
			options.entryPrefixTemplate,
			options.locale
		);

		for (let ayahId = startAyah; ayahId <= endAyah; ayahId++) {
			const ayah = this.repository.findAyah(surahId, ayahId);
			// File titles are never allowed to carry tashkeel, regardless of
			// any output-formatting setting — a diacritic-laden filename is
			// fragile across filesystems/sync tools in a way body text isn't.
			const ayahTextForTitle = ayah ? this.normalizer.stripTashkeel(ayah.text) : "";
			const fileTitle = this.fileNameBuilder.build(surahName, ayahId, ayahTextForTitle);
			await this.files.appendEntry(category, { surahId, surahName, ayahId, fileTitle, entryMarkdown });
		}

		if (options.deleteSelectionAfterLinking) {
			editor.replaceRange("", selectionStart, selectionEnd);
		}
	}

	private buildQuotedPassage(surahId: number, startAyah: number, endAyah: number, formatting: FormattingOptions): string | null {
		const ayahs: Ayah[] = [];
		for (let ayahId = startAyah; ayahId <= endAyah; ayahId++) {
			const found = this.repository.findAyah(surahId, ayahId);
			if (found) ayahs.push(found);
		}
		return ayahs.length > 0 ? this.formatter.format(ayahs, formatting) : null;
	}

	private buildEntryMarkdown(
		reflectionText: string,
		categoryName: string,
		isRange: boolean,
		startAyah: number,
		endAyah: number,
		quotedPassage: string | null,
		entryPrefixTemplate: string,
		locale: Locale
	): string {
		const lines: string[] = [];
		const prefix = entryPrefixTemplate.split("{date}").join(formatDateISO(new Date())).trim();
		if (prefix) lines.push(prefix, "");

		if (isRange) {
			lines.push(
				`> [!note] ${t(locale, "reflection.rangeNoticeTitle")}`,
				`> ${t(locale, "reflection.rangeNoticeBody", { category: categoryName, start: startAyah, end: endAyah })}`,
				""
			);
			if (quotedPassage) lines.push(quotedPassage, "");
		}

		lines.push(reflectionText.trim());
		return lines.join("\n");
	}
}
