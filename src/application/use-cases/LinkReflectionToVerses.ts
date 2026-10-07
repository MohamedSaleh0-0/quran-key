import type { Ayah } from "../../domain/entities/Ayah";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { AyahNoteRepository } from "../../domain/ports/AyahNoteRepository";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";
import type { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import type { ReflectionCategoryCatalog } from "../../domain/services/ReflectionCategoryCatalog";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";
import type { Locale, ReflectionInsertionMode } from "../../config/types";
import { formatArabicDate, renderReflectionEntry } from "../../domain/services/ReflectionEntrySyntax";

export interface ReflectionLinkOptions {
	locale: Locale;
	entryTemplate: string;
	insertionMode: ReflectionInsertionMode;
	noteTemplate: string;
	fileNameTemplate: string;
	quoteFormattingOptions: FormattingOptions;
	includeReflectionEntryDate: boolean;
	showSuccessNotice: boolean;
	onSuccess?: (category: ReflectionCategory) => void;
}

export interface DetectedCitation {
	surahId: number;
	surahName: string;
	startAyah: number;
	endAyah: number;
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
		for (const match of this.reference.findAll(text)) {
			const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(match.surahName));
			if (surah && this.repository.findAyah(surah.id, match.startAyah)) {
				return { surahId: surah.id, surahName: surah.name, startAyah: match.startAyah, endAyah: match.endAyah };
			}
		}

		// A selection may contain Quran text but no recognizable reference.
		// Prefer the longest quote so short phrases embedded in the reflection
		// do not win over the actual selected verse.
		const normalizedSelection = this.normalizer.normalizeForSearch(text);
		const matches = this.repository
			.getAllAyahs()
			.map((ayah) => ({ ayah, quote: this.normalizer.normalizeForSearch(ayah.text) }))
			.filter(({ quote }) => quote.length >= 10 && normalizedSelection.includes(quote))
			.sort((a, b) => b.quote.length - a.quote.length);
		const match = matches[0]?.ayah;
		return match
			? { surahId: match.surahId, surahName: match.surahName, startAyah: match.ayahId, endAyah: match.ayahId }
			: null;
	}

	cleanReflectionText(text: string, surahId: number, ayahId: number, wrapperStart: string, wrapperEnd: string): string {
		const ayah = this.repository.findAyah(surahId, ayahId);
		return ayah ? this.removeCurrentAyahCitation(text, ayah, wrapperStart, wrapperEnd) : text.trim();
	}

	async execute(
		reflectionText: string,
		category: ReflectionCategory,
		surahId: number,
		surahName: string,
		startAyah: number,
		endAyah: number,
		options: ReflectionLinkOptions
	): Promise<void> {
		await this.appendToAyahNotes(
			reflectionText,
			category,
			surahId,
			surahName,
			startAyah,
			endAyah,
			options
		);

		if (options.showSuccessNotice) options.onSuccess?.(category);
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
		if (options.showSuccessNotice) options.onSuccess?.(category);
	}

	private async appendToAyahNotes(
		reflectionText: string,
		category: ReflectionCategory,
		surahId: number,
		surahName: string,
		startAyah: number,
		endAyah: number,
		options: ReflectionLinkOptions
	): Promise<void> {
		if (startAyah !== endAyah) throw new Error("Reflection entries must target exactly one ayah");
		const ayah = this.repository.findAyah(surahId, startAyah);
		if (!ayah) throw new Error("The selected ayah does not exist");
		const cleanedText = this.cleanReflectionText(
			reflectionText,
			surahId,
			startAyah,
			options.quoteFormattingOptions.wrapperStart,
			options.quoteFormattingOptions.wrapperEnd
		);
		if (!cleanedText) throw new Error("The reflection is empty after removing the current ayah citation");
		const entryMarkdown = renderReflectionEntry(
			cleanedText,
			options.entryTemplate,
			options.includeReflectionEntryDate,
			formatArabicDate(new Date())
		);
		await this.ayahNotes.appendEntry(
			this.buildIdentity(surahId, surahName, startAyah, ayah, options.quoteFormattingOptions),
			category,
			entryMarkdown,
			{
				insertionMode: options.insertionMode,
				noteTemplate: options.noteTemplate,
				fileNameTemplate: options.fileNameTemplate,
			},
		);
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

	private removeCurrentAyahCitation(text: string, ayah: Ayah, wrapperStart: string, wrapperEnd: string): string {
		let result = text;
		const references = this.reference.findAll(result).filter((match) => {
			const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(match.surahName));
			return surah?.id === ayah.surahId && match.startAyah === ayah.ayahId && match.endAyah === ayah.ayahId;
		});
		for (const match of references.reverse()) result = result.slice(0, match.index) + result.slice(match.index + match.matchText.length);

		// A selected Quran quote is usually a whole wrapped block. Match it by
		// normalized content so tashkeel, ornate markers, and punctuation do not
		// prevent cleanup. Only remove the block containing this destination ayah;
		// other Quran quotations in the reflection remain untouched.
		if (wrapperStart && wrapperEnd) {
			const start = this.escapeGlyph(wrapperStart);
			const end = this.escapeGlyph(wrapperEnd);
			const ayahText = this.normalizer.normalizeForSearch(ayah.text);
			const bismillahText = ayah.bismillah ? this.normalizer.normalizeForSearch(ayah.bismillah) : "";
			result = result.replace(new RegExp(`${start}([\\s\\S]*?)${end}`, "g"), (whole, inner: string) => {
				const normalizedInner = this.normalizer.normalizeForSearch(inner);
				return normalizedInner.includes(ayahText) || (bismillahText && normalizedInner.includes(`${bismillahText} ${ayahText}`)) ? "" : whole;
			});
		}

		// Also handle plain, unwrapped selections. This removes only a normalized
		// span of the current ayah, preserving surrounding reflection prose.
		const candidates = [ayah.text, ayah.bismillah ? `${ayah.bismillah} ${ayah.text}` : ""].filter(Boolean);
		for (const candidate of candidates) result = this.removeNormalizedSpan(result, candidate);
		return result.replace(/\s{2,}/g, " ").trim();
	}

	private removeNormalizedSpan(text: string, phrase: string): string {
		const expected = this.normalizer.normalizeForSearch(phrase).split(" ").filter(Boolean);
		if (!expected.length) return text;
		const tokens = Array.from(text.matchAll(/\S+/g));
		for (let start = 0; start < tokens.length; start++) {
			for (let end = start; end < Math.min(tokens.length, start + expected.length + 4); end++) {
				const candidate = this.normalizer.normalizeForSearch(text.slice(tokens[start].index, tokens[end].index + tokens[end][0].length)).split(" ").filter(Boolean);
				if (candidate.length === expected.length && candidate.every((part, index) => part === expected[index])) {
					return text.slice(0, tokens[start].index) + text.slice(tokens[end].index + tokens[end][0].length);
				}
			}
		}
		return text;
	}

	private escapeGlyph(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
}
