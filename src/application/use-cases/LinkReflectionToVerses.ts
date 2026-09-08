import type { Ayah } from "../../domain/entities/Ayah";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { AyahNoteRepository } from "../../domain/ports/AyahNoteRepository";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";
import type { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import type { ReflectionCategoryCatalog } from "../../domain/services/ReflectionCategoryCatalog";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";
import type { Locale, ReflectionInsertionMode } from "../../config/types";
import { t } from "../../config/strings";

export interface ReflectionLinkOptions {
	locale: Locale;
	replaceSelectionWithBacklink: boolean;
	entryPrefixTemplate: string;
	entrySeparator: string;
	insertionMode: ReflectionInsertionMode;
	includeAyahTextInNote: boolean;
	fileNameTemplate: string;
	backlinkAliasTemplate: string;
	backlinkWrapTemplate: string;
	quoteFormattingOptions: FormattingOptions;
	includeReflectionEntryDate: boolean;
}

export interface DetectedCitation {
	surahId: number;
	surahName: string;
	startAyah: number;
	endAyah: number;
}

function formatDateISO(date: Date): string {
	const y = date.getFullYear();
	const m = (date.getMonth() + 1 < 10 ? "0" : "") + (date.getMonth() + 1);
	const d = (date.getDate() < 10 ? "0" : "") + date.getDate();
	return `${y}-${m}-${d}`;
}

export class LinkReflectionToVerses {
	constructor(
		private readonly repository: QuranRepository,
		private readonly normalizer: ArabicNormalizer,
		private readonly reference: CompiledVerseReference,
		private readonly formatter: VerseOutputFormatter,
		private readonly catalog: ReflectionCategoryCatalog,
		private readonly ayahNotes: AyahNoteRepository
	) {}

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
		const firstNoteTitle = await this.appendToAyahNotes(
			reflectionText,
			category,
			surahId,
			surahName,
			startAyah,
			endAyah,
			options
		);

		if (options.replaceSelectionWithBacklink && firstNoteTitle !== null) {
			const backlink = this.renderBacklink(firstNoteTitle, surahName, startAyah, reflectionText, options);
			editor.replaceRange(backlink, selectionStart, selectionEnd);
		}
	}

	async executeDirect(
		reflectionText: string,
		category: ReflectionCategory,
		surahId: number,
		surahName: string,
		startAyah: number,
		endAyah: number,
		options: ReflectionLinkOptions
	): Promise<void> {
		await this.appendToAyahNotes(reflectionText, category, surahId, surahName, startAyah, endAyah, options);
	}

	private async appendToAyahNotes(
		reflectionText: string,
		category: ReflectionCategory,
		surahId: number,
		surahName: string,
		startAyah: number,
		endAyah: number,
		options: ReflectionLinkOptions
	): Promise<string | null> {
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
			options.includeReflectionEntryDate,
			options.locale
		);

		let firstNoteTitle: string | null = null;
		for (let ayahId = startAyah; ayahId <= endAyah; ayahId++) {
			const ayah = this.repository.findAyah(surahId, ayahId);
			const ref = await this.ayahNotes.appendEntry(
				this.buildIdentity(surahId, surahName, ayahId, ayah, options.quoteFormattingOptions),
				category,
				entryMarkdown,
				{
					insertionMode: options.insertionMode,
					entrySeparator: options.entrySeparator,
					includeAyahText: options.includeAyahTextInNote,
					fileNameTemplate: options.fileNameTemplate,
				}
			);
			if (firstNoteTitle === null) firstNoteTitle = ref.title;
		}

		return firstNoteTitle;
	}

	private buildIdentity(surahId: number, surahName: string, ayahId: number, ayah: Ayah | null, quoteFormatting: FormattingOptions) {
		const rawText = ayah?.text ?? "";
		return {
			surahId,
			surahName,
			ayahId,
			ayahTextRaw: rawText,
			ayahTextBodyFormatted: ayah ? this.formatter.format([ayah], quoteFormatting) : "",
		};
	}

	private renderBacklink(noteTitle: string, surahName: string, ayahId: number, ayahText: string, options: ReflectionLinkOptions): string {
		const alias = options.backlinkAliasTemplate
			? options.backlinkAliasTemplate
					.split("{surah}")
					.join(surahName)
					.split("{verse}")
					.join(String(ayahId))
					.split("{ayahText}")
					.join(ayahText)
			: "";
		const link = alias ? `[[${noteTitle}|${alias}]]` : `[[${noteTitle}]]`;
		return options.backlinkWrapTemplate.split("{link}").join(link);
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
		includeReflectionEntryDate: boolean,
		locale: Locale
	): string {
		const lines: string[] = [];
		const prefix = entryPrefixTemplate
			.split("{date}")
			.join(includeReflectionEntryDate ? formatDateISO(new Date()) : "")
			.trim();
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
