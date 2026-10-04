import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { NoticePort } from "../../domain/ports/NoticePort";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { TafsirRepository } from "../../domain/ports/TafsirRepository";
import type { Locale } from "../../config/types";
import { t } from "../../config/strings";
import { TafsirMarkdownRenderer, type TafsirRenderBook } from "../../domain/services/TafsirMarkdownRenderer";

export interface TafsirFormattingOptions {
	locale: Locale;
	wrapperStart: string;
	wrapperEnd: string;
	includeAyahText: boolean;
	useHorizontalDivider: boolean;
	rangeHeadingLevel: string;
	bookHeadingLevel: string;
	ayahHeadingLevel: string;
	rangeHeadingTemplate: string;
	bookHeadingTemplate: string;
	ayahHeadingTemplate: string;
}

export class FetchAndInsertTafsir {
	private readonly renderer = new TafsirMarkdownRenderer();

	constructor(
		private readonly quranRepository: QuranRepository,
		private readonly tafsirRepository: TafsirRepository,
		private readonly notice: NoticePort
	) {}

	async execute(
		editor: EditorPort,
		lineText: string,
		lineNum: number,
		surahId: number,
		surahName: string,
		startAyah: number,
		endAyah: number,
		options: TafsirFormattingOptions,
		explicitBooks: TafsirBook[] | null = null
	): Promise<boolean> {
		const selectedBooks = explicitBooks ?? [];
		if (selectedBooks.length === 0) return false;

		const ayahRange = Array.from({ length: endAyah - startAyah + 1 }, (_, i) => startAyah + i);

		try {
			const renderedBooks: TafsirRenderBook[] = [];
			for (const book of selectedBooks) {
				const renderedAyahs = [];
				for (const ayahId of ayahRange) {
					const local = this.quranRepository.findAyah(surahId, ayahId);
					const rawContent = await this.tafsirRepository.fetchTafsir(book, surahId, ayahId);
					renderedAyahs.push({
						ayahId,
						ayahText: local?.text,
						commentary: rawContent,
					});
				}
				renderedBooks.push({ bookName: book.name, ayahs: renderedAyahs });
			}

			const finalOutput = this.renderer.render(renderedBooks, {
				surahName,
				startAyah,
				endAyah,
				wrapperStart: options.wrapperStart,
				wrapperEnd: options.wrapperEnd,
				includeAyahText: options.includeAyahText,
				useHorizontalDivider: options.useHorizontalDivider,
				rangeHeadingLevel: options.rangeHeadingLevel,
				bookHeadingLevel: options.bookHeadingLevel,
				ayahHeadingLevel: options.ayahHeadingLevel,
				rangeHeadingTemplate: options.rangeHeadingTemplate,
				bookHeadingTemplate: options.bookHeadingTemplate,
				ayahHeadingTemplate: options.ayahHeadingTemplate,
			});

			// Keep a Markdown list marker outside the replacement. Replacing the
			// complete line turns "- ayah" into an unlisted tafsir block.
			const listPrefix = lineText.match(/^(\s*(?:[-+*]|\d+[.)])\s+)/)?.[1] ?? "";
			const start: EditorPosition = { line: lineNum, ch: listPrefix.length };
			const end: EditorPosition = { line: lineNum, ch: lineText ? lineText.length : 0 };
			editor.replaceRange(finalOutput.trim() + "\n", start, end, "input.quran-key-tafsir");
			return true;
		} catch {
			this.notice.show(t(options.locale, "tafsir.fetchFailed"));
			return false;
		}
	}
}
