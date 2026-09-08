import type { ReflectionCategory } from "../entities/ReflectionCategory";
import type { MarkdownSectionTarget } from "../services/MarkdownSectionExtractor";

export interface AyahIdentity {
	surahId: number;
	surahName: string;
	ayahId: number;
	ayahTextRaw: string;
	ayahTextBodyFormatted: string;
}

export interface ReflectionEntryFormatting {
	insertionMode: "afterHeading" | "endOfSection";
	entrySeparator: string;
	includeAyahText: boolean;
	fileNameTemplate: string;
}

export interface AyahNoteRef {
	title: string;
}

export interface AyahSectionExtraction {
	title: string;
	surahId: number;
	ayahId: number;
	content: string;
}

export interface AyahNoteRepository {
	ensureSurahNote(surahId: number, surahName: string): Promise<AyahNoteRef>;

	extractSection(
		surahId: number,
		ayahId: number,
		target: MarkdownSectionTarget
	): Promise<AyahSectionExtraction | null>;

	appendEntry(
		identity: AyahIdentity,
		category: ReflectionCategory,
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef>;

	linkRelatedAyat(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		relatedNoteTitles: readonly string[]
	): Promise<AyahNoteRef>;

	resolveUnifiedNoteTitle(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		createIfMissing: boolean
	): Promise<string | null>;
}
