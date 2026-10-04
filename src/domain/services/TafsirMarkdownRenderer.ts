import { OrnateNumberConverter } from "./OrnateNumberConverter";

export interface TafsirRenderAyah {
	ayahId: number;
	ayahText?: string;
	commentary: string;
}

export interface TafsirRenderBook {
	bookName: string;
	ayahs: readonly TafsirRenderAyah[];
}

export interface TafsirMarkdownRenderOptions {
	surahName: string;
	startAyah: number;
	endAyah: number;
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

const EMPTY_COMMENTARY = "لم يُعثر على محتوى";

/** Renders fetched tafsir without making assumptions about the source's grouping. */
export class TafsirMarkdownRenderer {
	private readonly ornateNumberConverter = new OrnateNumberConverter();

	render(books: readonly TafsirRenderBook[], options: TafsirMarkdownRenderOptions): string {
		let output = `${options.rangeHeadingLevel} ${renderTemplate(options.rangeHeadingTemplate, {
			surah: options.surahName,
			start: options.startAyah,
			end: options.endAyah,
		})}\n\n`;

		books.forEach((book, bookIndex) => {
			output += `${options.bookHeadingLevel} ${renderTemplate(options.bookHeadingTemplate, {
				book: book.bookName,
			})}\n\n`;

			book.ayahs.forEach((ayah) => {
				output += `${options.ayahHeadingLevel} ${renderTemplate(options.ayahHeadingTemplate, {
					ayah: ayah.ayahId,
				})}\n\n`;

				if (options.includeAyahText && ayah.ayahText) {
					const wrappedAyah = `${options.wrapperStart} ${ayah.ayahText} ${options.wrapperEnd} (${ayah.ayahId})`;
					const cleanAyah = this.ornateNumberConverter.removeInnerMarkerParentheses(
						wrappedAyah,
						options.wrapperStart,
						options.wrapperEnd
					);
					output += `> ${cleanAyah}\n>\n`;
				}

				const commentary = formatCommentary(ayah.commentary);
				output += `${commentary || `> ${EMPTY_COMMENTARY}`}\n\n`;
			});

			if (options.useHorizontalDivider && bookIndex < books.length - 1) {
				output += "---\n\n";
			}
		});

		return output;
	}
}

function renderTemplate(template: string, values: Record<string, string | number>): string {
	let rendered = template.trim();
	for (const [key, value] of Object.entries(values)) {
		rendered = rendered.split(`{${key}}`).join(String(value));
	}
	return rendered;
}

function formatCommentary(text: string): string {
	const cleanText = text
		.replace(/\[\[(.*?)\]\]/g, "($1)")
		.replace(/==/g, "")
		.replace(/_/g, "")
		.replace(/^-{3,}/gm, "")
		.replace(/(?:\s*\*){2,}/g, " ")
		.replace(/\*/g, "\u2055");

	return cleanText
		.split(/\n+/)
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.map((line) => `> ${line}`)
		.join("\n>\n");
}
