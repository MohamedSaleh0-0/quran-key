import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { NoticePort } from "../../domain/ports/NoticePort";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { TafsirRepository } from "../../domain/ports/TafsirRepository";
import type { TafsirCatalog } from "../../domain/services/TafsirCatalog";
import type { HeadingLevel, Locale, TafsirResolutionStrategy } from "../../config/types";
import { t } from "../../config/strings";

export interface TafsirFormattingOptions {
	locale: Locale;
	wrapperStart: string;
	wrapperEnd: string;
	includeAyahText: boolean;
	useHorizontalDivider: boolean;
	rangeHeadingLevel: HeadingLevel;
	bookHeadingLevel: HeadingLevel;
	fetchDelayMs: number;
	fetchDelayThreshold: number;
	resolutionOrder: readonly TafsirResolutionStrategy[];
	favoriteBookIds: readonly string[];
	defaultBookId: string;
}

export class FetchAndInsertTafsir {
	constructor(
		private readonly quranRepository: QuranRepository,
		private readonly tafsirRepository: TafsirRepository,
		private readonly catalog: TafsirCatalog,
		private readonly notice: NoticePort
	) {}

	resolveBooks(explicitBooks: TafsirBook[] | null, lineText: string, options: TafsirFormattingOptions): TafsirBook[] {
		for (const strategy of options.resolutionOrder) {
			switch (strategy) {
				case "explicit":
					if (explicitBooks && explicitBooks.length > 0) return explicitBooks;
					break;
				case "lineAliases": {
					const mentioned = this.catalog.findMentionedIn(lineText);
					if (mentioned.length > 0) return mentioned;
					break;
				}
				case "favorites": {
					const favorites = this.catalog.byIds(options.favoriteBookIds);
					if (favorites.length > 0) return favorites;
					break;
				}
				case "default": {
					const def = this.catalog.byId(options.defaultBookId);
					if (def) return [def];
					break;
				}
			}
		}
		return [];
	}

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
		const selectedBooks = this.resolveBooks(explicitBooks, lineText, options);
		if (selectedBooks.length === 0) return false;

		const ayahRange = Array.from({ length: endAyah - startAyah + 1 }, (_, i) => startAyah + i);
		let finalOutput = `${options.rangeHeadingLevel} ${t(options.locale, "tafsir.rangeHeading", {
			surah: surahName,
			start: startAyah,
			end: endAyah,
		})}\n\n`;

		try {
			for (let bIdx = 0; bIdx < selectedBooks.length; bIdx++) {
				const book = selectedBooks[bIdx];
				let combinedBookText = "";
				for (const ayahId of ayahRange) {
					if (options.includeAyahText) {
						const local = this.quranRepository.findAyah(surahId, ayahId);
						if (local) {
							combinedBookText += `${options.wrapperStart} ${local.text} ${options.wrapperEnd} (${ayahId})\n\n`;
						}
					}
					if (ayahRange.length > options.fetchDelayThreshold) {
						await new Promise((resolve) => window.setTimeout(resolve, options.fetchDelayMs));
					}
					const rawContent = await this.tafsirRepository.fetchTafsir(book, surahId, ayahId);
					if (rawContent && rawContent.trim() !== "") {
						combinedBookText +=
							ayahRange.length > 1
								? `${t(options.locale, "tafsir.ayahHeadingLabel", { ayah: ayahId })}\n${rawContent}\n\n`
								: `${rawContent}\n\n`;
					}
				}
				finalOutput += formatBookContent(book.name, combinedBookText, options.bookHeadingLevel, options.locale);
				if (options.useHorizontalDivider && bIdx < selectedBooks.length - 1) {
					finalOutput += "---\n\n";
				}
			}

			const start: EditorPosition = { line: lineNum, ch: 0 };
			const end: EditorPosition = { line: lineNum, ch: lineText ? lineText.length : 0 };
			editor.replaceRange(finalOutput.trim() + "\n", start, end);
			return true;
		} catch {
			this.notice.show(t(options.locale, "tafsir.fetchFailed"));
			return false;
		}
	}
}

function formatBookContent(bookName: string, textContent: string, bookHeadingLevel: HeadingLevel, locale: Locale): string {
	if (!textContent || textContent.trim() === "") {
		return `${bookHeadingLevel} ${bookName}\n\n> ${t(locale, "tafsir.emptyBook")}\n\n`;
	}
	let cleanText = textContent
		.replace(/\[\[(.*?)\]\]/g, "($1)")
		.replace(/==/g, "")
		.replace(/_/g, "")
		.replace(/^-{3,}/gm, "");
	cleanText = cleanText.replace(/(?:\s*\*){2,}/g, " ");
	cleanText = cleanText.replace(/\*/g, "\u2055");

	const paragraphs = cleanText
		.split(/\n+/)
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.map((line) => `> ${line}`);

	return `${bookHeadingLevel} ${bookName}\n\n${paragraphs.join("\n>\n")}\n\n`;
}