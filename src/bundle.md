## use-cases\AnalyzeLineContext.ts

```typescript
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

```

## use-cases\ConvertReferenceToFootnote.ts

```typescript
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";

/** FR-28: replace a reference on the current line with an auto-numbered
 *  Markdown footnote marker, appending the reference itself as the
 *  footnote body at the end of the note. */
export class ConvertReferenceToFootnote {
	constructor(private readonly reference: CompiledVerseReference) {}

	execute(editor: EditorPort): void {
		const lineNum = editor.getCursor().line;
		const lineText = editor.getLine(lineNum);
		const match = this.reference.find(lineText);
		if (!match) return;

		const fullContent = editor.getValue();
		const existingFootnotes = fullContent.match(/\[\^quran\d+\]/g);
		const nextIndex = existingFootnotes ? existingFootnotes.length + 1 : 1;
		const footnoteTag = `[^quran${nextIndex}]`;

		const updatedLine = lineText.slice(0, match.index) + footnoteTag + lineText.slice(match.index + match.matchText.length);
		editor.setLine(lineNum, updatedLine);

		const lastLineNum = editor.lineCount() - 1;
		const lastLineText = editor.getLine(lastLineNum);
		const footerPos: EditorPosition = { line: lastLineNum, ch: lastLineText.length };
		editor.replaceRange(`\n\n${footnoteTag}: ${match.matchText}`, footerPos, footerPos);
	}
}
```

## use-cases\ExtractAndInsertVerse.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { InsertionMementoStore } from "../../domain/ports/InsertionMemento";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";
import { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import { PhraseMatcher } from "../../domain/services/PhraseMatcher";
import { SlidingWindowSearch } from "../../domain/services/SlidingWindowSearch";
import { SnippetExtractor } from "../../domain/services/SnippetExtractor";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";
import { ToggleSnippetView } from "./ToggleSnippetView";

export type AmbiguityHandler = (
	query: string,
	matches: Ayah[],
	startPos: EditorPosition,
	endPos: EditorPosition
) => void;

/** Matches "(word1-word2)" range shorthand — deliberately permissive about
 *  what's inside the parens; SnippetExtractor.extractRange does the real
 *  word-matching work and simply falls back to "no crop" if it can't. */
const RANGE_SHORTHAND_REGEX = /\(([^)]+?-[^)]+?)\)/g;

const EXPLICIT_RESOLUTION_REGEX =
	/(?:^|\s)([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,2})\s*[:\s]\s*(\d+(?:\s*-\s*\d+)?(?:\s*[,\u060C]\s*\d+(?:\s*-\s*\d+)?)*)/g;

/**
 * The plugin's primary "do the thing" command (FR-9..15). Tries, in
 * order: toggle full<->snippet, range shorthand next to a reference, a
 * text selection as a query, a {query} shorthand, an explicit
 * "Surah N[-M][, N2[-M2]]" resolution, then a sliding-window auto-detect
 * fallback. Ambiguous query matches are handed to `onAmbiguity` (a
 * presentation-layer callback) rather than this use case importing a
 * Modal type — keeps application code Obsidian-free (NFR-7).
 */
export class ExtractAndInsertVerse {
	constructor(
		private readonly repository: QuranRepository,
		private readonly normalizer: ArabicNormalizer,
		private readonly phraseMatcher: PhraseMatcher,
		private readonly slidingWindow: SlidingWindowSearch,
		private readonly snippetExtractor: SnippetExtractor,
		private readonly formatter: VerseOutputFormatter,
		private readonly reference: CompiledVerseReference,
		private readonly memento: InsertionMementoStore,
		private readonly toggle: ToggleSnippetView,
		private readonly wrapperStart: string,
		private readonly wrapperEnd: string,
		private readonly getFormattingOptions: () => FormattingOptions
	) {}

	execute(editor: EditorPort, onAmbiguity: AmbiguityHandler): boolean {
		const cursor = editor.getCursor();
		const currentLine = editor.getLine(cursor.line);

		// FR-9
		const last = this.memento.get();
		if (last) {
			const toggled = this.toggle.attempt(
				last,
				currentLine,
				cursor.line,
				this.wrapperStart,
				this.wrapperEnd,
				this.getFormattingOptions()
			);
			if (toggled) {
				editor.setLine(cursor.line, toggled.output);
				this.memento.set(toggled.nextMemento);
				return true;
			}
		}

		// FR-10
		let parenMatch: RegExpExecArray | null;
		RANGE_SHORTHAND_REGEX.lastIndex = 0;
		while ((parenMatch = RANGE_SHORTHAND_REGEX.exec(currentLine)) !== null) {
			const startCh = parenMatch.index;
			const endCh = parenMatch.index + parenMatch[0].length;
			if (cursor.ch < startCh || cursor.ch > endCh) continue;

			const refMatch = this.reference.find(currentLine);
			if (!refMatch) continue;
			const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(refMatch.surahName));
			if (!surah) continue;
			const actualAyah = this.repository.findAyah(surah.id, refMatch.startAyah);
			if (!actualAyah) continue;

			const parts = parenMatch[1].split("-");
			const cropped = this.snippetExtractor.extractRange(actualAyah.text, parts[0].trim(), parts[1]?.trim() ?? "");
			if (cropped && cropped !== actualAyah.text) {
				const dummy: Ayah = { ...actualAyah, text: cropped };
				editor.setLine(cursor.line, this.formatter.format([dummy], this.getFormattingOptions()));
				return true;
			}
		}

		// FR-11
		const selectedText = editor.getSelection().trim();
		if (selectedText.length > 0) {
			return this.resolveTextQuery(editor, selectedText, editor.getCursor("from"), editor.getCursor("to"), onAmbiguity);
		}

		// FR-12
		const curlyMatch = currentLine.match(/\{([^}]+)\}/);
		if (curlyMatch) {
			const fullCurly = curlyMatch[0];
			const innerText = curlyMatch[1].trim();
			const start: EditorPosition = { line: cursor.line, ch: currentLine.indexOf(fullCurly) };
			const end: EditorPosition = { line: cursor.line, ch: start.ch + fullCurly.length };
			return this.resolveTextQuery(editor, innerText, start, end, onAmbiguity);
		}

		if (currentLine.trim().length === 0) return false;

		// FR-13
		EXPLICIT_RESOLUTION_REGEX.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = EXPLICIT_RESOLUTION_REGEX.exec(currentLine)) !== null) {
			const surah = this.repository.findSurahByName(this.normalizer.normalizeForSearch(match[1]));
			if (!surah) continue;
			const trimmedMatch = match[0].trim();
			const start: EditorPosition = { line: cursor.line, ch: currentLine.indexOf(trimmedMatch) };
			const end: EditorPosition = { line: cursor.line, ch: start.ch + trimmedMatch.length };
			const targetIds = this.parseVerseNumbers(match[2]);
			const matched = this.repository.getAllAyahs().filter((a) => a.surahId === surah.id && targetIds.includes(a.ayahId));
			if (matched.length > 0) {
				this.insert(editor, start, end, matched, "");
				return true;
			}
		}

		// FR-14
		return this.executeSlidingWindow(editor, currentLine, cursor.line, onAmbiguity);
	}

	private resolveTextQuery(
		editor: EditorPort,
		query: string,
		start: EditorPosition,
		end: EditorPosition,
		onAmbiguity: AmbiguityHandler
	): boolean {
		const matches = this.phraseMatcher.findMatches(query, this.repository.getAllAyahs());
		if (matches.length === 1) {
			this.insert(editor, start, end, [matches[0]], query);
			return true;
		}
		if (matches.length > 1) {
			this.insert(editor, start, end, [matches[0]], query);
			const newEnd: EditorPosition = {
				line: start.line,
				ch: start.ch + this.formatter.format([matches[0]], this.getFormattingOptions()).length,
			};
			onAmbiguity(query, matches, start, newEnd); // FR-15
			return true;
		}
		return false;
	}

	private executeSlidingWindow(
		editor: EditorPort,
		lineText: string,
		lineIdx: number,
		onAmbiguity: AmbiguityHandler
	): boolean {
		const slid = this.slidingWindow.find(lineText, this.repository.getAllAyahs(), this.repository.getSearchCorpusText());
		if (!slid) return false;
		const matchChIndex = lineText.indexOf(slid.segment);
		if (matchChIndex === -1) return false;

		const start: EditorPosition = { line: lineIdx, ch: matchChIndex };
		const end: EditorPosition = { line: lineIdx, ch: matchChIndex + slid.segment.length };

		if (slid.ayahs.length === 1) {
			this.insert(editor, start, end, [slid.ayahs[0]], slid.segment);
		} else {
			this.insert(editor, start, end, [slid.ayahs[0]], slid.segment);
			const newEnd: EditorPosition = {
				line: start.line,
				ch: start.ch + this.formatter.format([slid.ayahs[0]], this.getFormattingOptions()).length,
			};
			onAmbiguity(slid.segment, slid.ayahs, start, newEnd);
		}
		return true;
	}

	/** Public so presentation code (the search/range-end modals) can reuse
	 *  the exact same insert-and-remember-for-toggle behavior as the
	 *  extract command itself, instead of duplicating it. */
	insertAyahs(editor: EditorPort, start: EditorPosition, end: EditorPosition, ayahs: Ayah[], query: string): string {
		const output = this.formatter.format(ayahs, this.getFormattingOptions());
		editor.replaceRange(output, start, end);
		this.memento.set({ line: start.line, query, ayahs, isSnippet: false });
		return output;
	}

	private insert(editor: EditorPort, start: EditorPosition, end: EditorPosition, ayahs: Ayah[], query: string): void {
		this.insertAyahs(editor, start, end, ayahs, query);
	}

	private parseVerseNumbers(rangeStr: string): number[] {
		const parts = rangeStr.split(/[,\u060C]/);
		const ids: number[] = [];
		for (const rawPart of parts) {
			const part = rawPart.trim();
			if (part.includes("-")) {
				const [a, b] = part.split("-");
				const startN = parseInt(ArabicNormalizer.normalizeNumbers(a.trim()), 10);
				const endN = parseInt(ArabicNormalizer.normalizeNumbers(b.trim()), 10);
				for (let id = startN; id <= endN; id++) ids.push(id);
			} else {
				const id = parseInt(ArabicNormalizer.normalizeNumbers(part), 10);
				if (!isNaN(id)) ids.push(id);
			}
		}
		return Array.from(new Set(ids)).sort((a, b) => a - b);
	}
}

```

## use-cases\FetchAndInsertTafsir.ts

```typescript
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { NoticePort } from "../../domain/ports/NoticePort";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { TafsirRepository } from "../../domain/ports/TafsirRepository";
import type { TafsirCatalog } from "../../domain/services/TafsirCatalog";
import type { Locale, TafsirResolutionStrategy } from "../../config/types";
import { t } from "../../config/strings";

export interface TafsirFormattingOptions {
	locale: Locale;
	wrapperStart: string;
	wrapperEnd: string;
	includeAyahText: boolean;
	useHorizontalDivider: boolean;
	rangeHeadingLevel: string;
	bookHeadingLevel: string;
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

function formatBookContent(bookName: string, textContent: string, bookHeadingLevel: string, locale: Locale): string {
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
```

## use-cases\LinkAyahsTogether.ts

```typescript
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

```

## use-cases\LinkReflectionToVerses.ts

```typescript
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
	/** true (default): the logged selection is replaced in its source
	 *  note with a backlink to the ayah note. false: the selection is
	 *  left completely untouched (a copy). Never silently erased to "". */
	replaceSelectionWithBacklink: boolean;
	entryPrefixTemplate: string;
	entrySeparator: string;
	insertionMode: ReflectionInsertionMode;
	includeAyahTextInNote: boolean;
	fileNameTemplate: string;
	backlinkAliasTemplate: string;
	backlinkWrapTemplate: string;
	/** Reused both for the >1-ayah "quoted passage" in a range notice and
	 *  for the single-ayah body quote written into a fresh unified note. */
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

		const ancestorChain = this.catalog.ancestorChain(category.id);
		const chain = ancestorChain.length > 0 ? ancestorChain : [category];

		let firstNoteTitle: string | null = null;
		for (let ayahId = startAyah; ayahId <= endAyah; ayahId++) {
			const ayah = this.repository.findAyah(surahId, ayahId);
			const ref = await this.ayahNotes.appendEntry(
				this.buildIdentity(surahId, surahName, ayahId, ayah, options.quoteFormattingOptions),
				chain,
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

		if (options.replaceSelectionWithBacklink && firstNoteTitle !== null) {
			const backlink = this.renderBacklink(firstNoteTitle, surahName, startAyah, reflectionText, options);
			editor.replaceRange(backlink, selectionStart, selectionEnd);
		}
		// else: replaceSelectionWithBacklink is false -> leave the selection untouched (a true copy).
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

```

## use-cases\RemoveQuranReference.ts

```typescript
import type { EditorPort } from "../../domain/ports/EditorPort";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";

/** FR-27: strip any reference matching the configured format from the
 *  current line. Delegates the actual regex work to the compiled
 *  reference (NFR-3) rather than a hardcoded `[Surah:N-M]` pattern. */
export class RemoveQuranReference {
	constructor(private readonly reference: CompiledVerseReference) {}

	execute(editor: EditorPort): void {
		const lineNum = editor.getCursor().line;
		const lineText = editor.getLine(lineNum);
		editor.setLine(lineNum, this.reference.strip(lineText));
	}
}

```

## use-cases\SearchQuranVerses.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { SearchStrategy } from "../../config/types";
import { FuzzyMatcher } from "../../domain/services/FuzzyMatcher";
import { PhraseMatcher } from "../../domain/services/PhraseMatcher";

/**
 * Backs the global/live search modal (FR-16/17). `pool`, when given, lets
 * the modal search within a previously-narrowed set instead of the full
 * corpus (e.g. refining a context-parsed ambiguity).
 *
 * Which matcher runs is a setting (settings.searchStrategy), not a
 * hardcoded choice — v2 fix for the "search returns anything containing
 * the words in any order" complaint. "literal" delegates to PhraseMatcher
 * (contiguous, order-preserving — the same engine ExtractAndInsertVerse's
 * direct-query path uses), but — unlike that direct-query path — with
 * `allowPrefixOnLastWord` on: this is a live, as-you-type search box, so
 * the word currently being typed shouldn't have to be finished before
 * anything shows up. "fuzzy" delegates to FuzzyMatcher (any
 * order/position), preserved as the looser opt-in mode.
 */
export class SearchQuranVerses {
	constructor(
		private readonly repository: QuranRepository,
		private readonly phraseMatcher: PhraseMatcher,
		private readonly fuzzyMatcher: FuzzyMatcher,
		private readonly maxResults: number,
		private readonly strategy: SearchStrategy
	) {}

	execute(query: string, pool?: readonly Ayah[]): Ayah[] {
		const corpus = pool ?? this.repository.getAllAyahs();
		if (this.strategy === "literal") {
			return this.phraseMatcher.findMatches(query, corpus, true).slice(0, this.maxResults);
		}
		return this.fuzzyMatcher.findMatches(query, corpus, this.maxResults);
	}
}


```

## use-cases\StripTashkeel.ts

```typescript
import type { EditorPort } from "../../domain/ports/EditorPort";
import type { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";

/** FR-29: strip tashkeel from the current selection, or the whole line if
 *  nothing is selected. Thin wrapper around ArabicNormalizer.stripTashkeel
 *  — kept as its own use case (rather than inlined into a command) so it
 *  stays consistent with the toggle behind settings.stripTashkeel and is
 *  independently testable. */
export class StripTashkeel {
	constructor(private readonly normalizer: ArabicNormalizer) {}

	execute(editor: EditorPort): void {
		const selectedText = editor.getSelection();
		if (selectedText.length > 0) {
			const cursorFrom = editor.getCursor("from");
			const cursorTo = editor.getCursor("to");
			editor.replaceRange(this.normalizer.stripTashkeel(selectedText), cursorFrom, cursorTo);
			return;
		}
		const lineNum = editor.getCursor().line;
		const lineText = editor.getLine(lineNum);
		editor.setLine(lineNum, this.normalizer.stripTashkeel(lineText));
	}
}

```

## use-cases\ToggleSnippetView.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";
import type { InsertionMemento } from "../../domain/ports/InsertionMemento";
import type { SnippetExtractor } from "../../domain/services/SnippetExtractor";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";

export interface ToggleResult {
	output: string;
	nextMemento: InsertionMemento;
}

/**
 * FR-9: on a repeat invoke at the same spot, toggle between the full ayah
 * and the snippet the user originally typed as their search query — a
 * "double-undo" affordance so re-running the extract command narrows,
 * then widens, then narrows the quote again.
 *
 * v1 had this embedded inline as the first branch of a much larger
 * function. Split out here so this specific (slightly fiddly) behavior is
 * independently unit-testable without exercising the rest of the
 * extraction resolution chain.
 */
export class ToggleSnippetView {
	constructor(
		private readonly snippetExtractor: SnippetExtractor,
		private readonly formatter: VerseOutputFormatter
	) {}

	/** Returns null when toggling doesn't apply — the caller should fall
	 *  through to the rest of the extraction resolution chain. */
	attempt(
		memento: InsertionMemento,
		currentLine: string,
		cursorLine: number,
		wrapperStart: string,
		wrapperEnd: string,
		formattingOptions: FormattingOptions
	): ToggleResult | null {
		if (memento.line !== cursorLine) return null;
		if (currentLine.indexOf(wrapperStart) === -1 || currentLine.indexOf(wrapperEnd) === -1) return null;

		const targetAyah = memento.ayahs[0];
		const queryText = memento.query.trim();

		if (!memento.isSnippet) {
			if (queryText.length === 0) return null;
			const snippetText = this.snippetExtractor.extractSnippet(targetAyah.text, queryText);
			if (snippetText === targetAyah.text) return null; // nothing narrower to show
			const dummy: Ayah = { ...targetAyah, text: snippetText };
			return {
				output: this.formatter.format([dummy], formattingOptions),
				nextMemento: { ...memento, isSnippet: true },
			};
		}

		return {
			output: this.formatter.format(memento.ayahs, formattingOptions),
			nextMemento: { ...memento, isSnippet: false },
		};
	}
}

```

## defaults.ts

```typescript
import type { NormalizationRule, PluginConfig } from "./types";
import builtinNormalizationRules from "../../data/normalizationRules.json";

function seedNormalizationRules(): NormalizationRule[] {
	return (builtinNormalizationRules as Array<Record<string, unknown>>).map((r) => ({
		id: String(r.id),
		description: String(r.description),
		pattern: String(r.pattern),
		flags: String(r.flags ?? "g"),
		replacement: String(r.replacement),
		enabled: true,
	}));
}

export const DEFAULT_SETTINGS: PluginConfig = {
	// Text normalization & verse formatting
	stripTashkeel: false,
	useOrnateNumbers: true,
	ornateRingGlyph: "\u06DD", // ۝
	wrapperStart: "\uFD3F", // ﴿
	wrapperEnd: "\uFD3E", // ﴾
	referenceFormat: "[{surah}:{verse}]",
	normalizationRules: seedNormalizationRules(),

	// Qur'anic text styling (تطبيق آية ومصحف المدينة)
	quranFontFamily: "'KFGQPC Uthmanic Script HAFS', 'Amiri Quran', serif",
	quranFontSize: 1.3,
	quranLineHeight: 2.4,
	quranColor: "#dfc56b",
	styleOrnateNumbers: true,
	customCss: "",

	// Search & interface
	showAnalytics: true,
	maxSuggestionResults: 30,
	maxSlidingWindowWords: 12,
	interfaceLanguage: "ar",
	searchStrategy: "literal",

	// Tafsir
	defaultTafsirBookId: "saadi",
	favoriteBooksIds: ["saadi", "ibn-katheer", "muyassar"],
	customTafsirBooks: [],
	tafsirBookResolutionOrder: ["explicit", "lineAliases", "favorites", "default"],
	includeAyahTextInTafsir: true,
	useHorizontalDivider: true,
	rangeHeadingLevel: "###",
	bookHeadingLevel: "####",
	tafsirFetchDelayMs: 150,
	tafsirFetchDelayThreshold: 2,

	// Reflections (تدبر / أثر / user-defined categories)
	customReflectionCategories: [],
	ayahNotesFolder: "ملاحظات الآيات",
	deleteSelectionAfterLinkingReflection: true,
	reflectionBacklinkAliasTemplate: "",
	reflectionBacklinkWrapTemplate: "{link}",
	reflectionEntryPrefixTemplate: "### {date}",
	reflectionEntrySeparator: "\n\n---\n\n",
	reflectionInsertionMode: "afterHeading",
	reflectionFileNameTemplate: "{ayahText} ({surah} {verse})",
	reflectionFileNameAyahTextMaxLength: 60,
	includeAyahTextInReflectionNote: true,
};

export function migrateLegacySettings(raw: Partial<PluginConfig> | undefined): Partial<PluginConfig> {
	if (!raw) return {};
	let migrated = raw;
	if ((raw as { referenceFormat?: string }).referenceFormat === "[Surah:Verse]") {
		migrated = { ...migrated, referenceFormat: "[{surah}:{verse}]" };
	}
	return migrated;
}
```

## strings.ts

```typescript
import type { Locale } from "./types";

export const STRINGS: Record<Locale, Record<string, string>> = {
	ar: {
		"search.placeholder": "اكتب كلمات البحث بدقة لدراسة المواضيع القرآنيّة...",
		"analytics.total": "إجمالي المواضع",
		"analytics.mostQuoted": "الأكثر تكراراً",
		"analytics.densest": "الأعلى كثافة نصية",
		"analytics.empty": "-",
		"rangeEnd.placeholderPrefix": "اختر آية نهاية النطاق لسورة",
		"rangeEnd.placeholderSuffix": "تبدأ من الآية",
		"tafsir.pickerTitle": "تخصيص كُتُب التفسير المطلوبة",
		"tafsir.pickerPlaceholder": "ابحث في كتب التفسير (اكتب اسم المفسر أو جزءاً منه)...",
		"tafsir.pickerEmpty": "لم يتم العثور على كتب تطابق بحثك الحالي.",
		"tafsir.noBookFound": "لم يتم العثور على تفسير لهذا الموضع.",
		"tafsir.fetchFailed": "فشل الاتصال بالشبكة. تم الاحتفاظ بالأمر الحالي دون تغيير.",
		"tafsir.rangeHeading": "تفسير سورة {surah} ({start} - {end})",
		"tafsir.ayahHeadingLabel": "[تفسير آية {ayah}]:",
		"tafsir.emptyBook": "لم يتم العثور على التفسير لهذا الموضوع.",
		"tafsir.pickerConfirm": "إدراج المحدد",
		"tafsir.pickerHint": "اختر كتاباً أو أكثر ثم اضغط «إدراج المحدد» (أو Shift+Enter).",
		"tafsir.addSourceTitle": "+ إضافة مصدر تفسير مخصص",
		"tafsir.addSourceNamePlaceholder": "الاسم",
		"tafsir.addSourceAliasesPlaceholder": "أسماء بديلة، مفصولة بفواصل",
		"tafsir.addSourceUrlPlaceholder": "رابط يحوي {bookId} و{surahId} و{ayahId}",
		"tafsir.addSourceButton": "إضافة",
		"reflection.noSelection": "حدد نصًا أولاً لتسجيله.",
		"reflection.unknownCategory": "تصنيف غير معروف.",
		"reflection.rangeNoticeTitle": "ملحوظة",
		"reflection.rangeNoticeBody": "هذا {category} عام على الآيات من {start} إلى {end}، وليس خاصًا بهذه الآية وحدها.",
		"linkAyat.title": "ربط آيات متشابهة",
		"linkAyat.placeholder": "ابحث عن آية لإضافتها إلى الربط...",
		"linkAyat.empty": "اكتب كلمات بحث لعرض الآيات.",
		"linkAyat.selectedPrefix": "المُختار:",
		"linkAyat.hint": "اختر آيتين على الأقل ثم اضغط «ربط المحدد» (أو Shift+Enter).",
		"linkAyat.confirm": "ربط المحدد",
	},
	en: {
		"search.placeholder": "Type search words to look up Qur'anic verses...",
		"analytics.total": "Total matches",
		"analytics.mostQuoted": "Most quoted",
		"analytics.densest": "Highest density",
		"analytics.empty": "-",
		"rangeEnd.placeholderPrefix": "Choose the range's ending ayah for",
		"rangeEnd.placeholderSuffix": "starting from ayah",
		"tafsir.pickerTitle": "Choose tafsir books",
		"tafsir.pickerPlaceholder": "Search across all tafsir books (author or part of the name)...",
		"tafsir.pickerEmpty": "No books match your current search.",
		"tafsir.noBookFound": "No tafsir found for this position.",
		"tafsir.fetchFailed": "Network request failed. The line was left unchanged.",
		"tafsir.rangeHeading": "Tafsir of Surah {surah} ({start}-{end})",
		"tafsir.ayahHeadingLabel": "[Tafsir of ayah {ayah}]:",
		"tafsir.emptyBook": "No commentary found for this ayah.",
		"tafsir.pickerConfirm": "Insert selected",
		"tafsir.pickerHint": "Select one or more books, then click \"Insert selected\" (or Shift+Enter).",
		"tafsir.addSourceTitle": "+ Add a custom tafsir source",
		"tafsir.addSourceNamePlaceholder": "Name",
		"tafsir.addSourceAliasesPlaceholder": "aliases, comma-separated",
		"tafsir.addSourceUrlPlaceholder": "URL containing {bookId}, {surahId}, {ayahId}",
		"tafsir.addSourceButton": "Add",
		"reflection.noSelection": "Select some text first to log it.",
		"reflection.unknownCategory": "Unknown reflection category.",
		"reflection.rangeNoticeTitle": "Note",
		"reflection.rangeNoticeBody": "This {category} concerns the range {start}\u2013{end} as a whole, not only this ayah.",
		"linkAyat.title": "Link related ayahs",
		"linkAyat.placeholder": "Search for an ayah to add to the link...",
		"linkAyat.empty": "Type search words to see ayahs.",
		"linkAyat.selectedPrefix": "Selected:",
		"linkAyat.hint": "Select at least two ayahs, then click \"Link selected\" (or Shift+Enter).",
		"linkAyat.confirm": "Link selected",
	},
};

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
	const currentLocale: Locale = locale === "en" ? "en" : "ar";
	const table: Record<string, string> = STRINGS[currentLocale] ?? STRINGS.ar;
	const rawValue: string = table[key] ?? STRINGS.ar[key] ?? key;
	let value: string = rawValue;
	if (vars) {
		for (const k of Object.keys(vars)) {
			const val = String(vars[k]);
			value = value.split(`{${k}}`).join(val);
		}
	}
	return value;
}

```

## types.ts

```typescript
/**
 * Central settings schema. Nothing in domain/application/infrastructure
 * reads a literal where a value here could go instead — see
 * docs/ARCHITECTURE.md §6 for the full hardcoded -> configurable map.
 *
 * v2.1 changes (see docs/ARCHITECTURE.md §9 "Unified ayah notes"):
 * - `HeadingLevel` union removed. Obsidian's own convention (H1 often
 *   owned by the note title) means different users want different
 *   levels for different purposes — a fixed "H3-H5" menu (v2.0) was
 *   itself a hardcoded literal masquerading as a setting. Every heading
 *   level is now a free-text field (still validated at compile time by
 *   VerseReference-style helpers where it matters, e.g. non-empty and
 *   matching /^#{1,6}$/).
 * - `ReflectionCategoryDescriptor` gained `organizationMode`,
 *   `headingText`, `headingLevel`, `parentCategoryId` — a category no
 *   longer *must* own a folder; by default (`"unified"`) its entries
 *   live under a heading inside one note per ayah. `folder` is only
 *   consulted when `organizationMode === "ownFolder"`.
 */

export type Locale = "ar" | "en";

export type TafsirResolutionStrategy =
	| "explicit" // an override chosen in a picker for this specific call
	| "lineAliases" // book names/aliases mentioned in the current line's text
	| "favorites" // settings.favoriteBooksIds
	| "default"; // settings.defaultTafsirBookId

export type SearchStrategy =
	| "literal" // PhraseMatcher: query words must appear contiguously, in order
	| "fuzzy"; // FuzzyMatcher: query words may appear anywhere, in any order

/** How a reflection entry finds a home. "unified" (the default): entries
 *  live under this category's heading inside the single note for that
 *  ayah. "ownFolder": entries live in their own per-ayah file under
 *  `folder`, and a single link line is kept in sync (both directions)
 *  with the unified note, which stays "the reference" either way. */
export type CategoryOrganizationMode = "unified" | "ownFolder";

/** Where a new entry lands relative to already-existing entries under
 *  the same heading. "afterHeading": newest directly under the heading
 *  (newest-first). "endOfSection": appended at the section's end
 *  (chronological, oldest-first) — see HeadingSectionInserter. This is
 *  one global setting (a formatting taste, not a per-category axis). */
export type ReflectionInsertionMode = "afterHeading" | "endOfSection";

/** A tafsir source. Builtin books (data/tafsirBooks.json) and
 *  user-added books (settings.customTafsirBooks) share this exact shape —
 *  a custom source is not a second-class citizen. */
export interface TafsirBookDescriptor {
	id: string;
	name: string;
	aliases: string[];
	/** {bookId}, {surahId}, {ayahId} are substituted at fetch time. */
	urlTemplate: string;
	isBuiltin: boolean;
}

/**
 * A category of personal writing linked to an ayah (تدبر، أثر، or any
 * user-defined category — "فوائد عملية", "فوائد لغوية", ...). Only تدبر
 * and أثر are builtin; everything else is a use-case the user configures
 * for themselves, including whether it lives in the unified note or gets
 * its own folder.
 */
export interface ReflectionCategoryDescriptor {
	id: string;
	name: string;
	organizationMode: CategoryOrganizationMode;
	/** Heading text this category's entries live under, e.g. "تدبرات". */
	headingText: string;
	/** e.g. "###". Free text — see the file-level note above. */
	headingLevel: string;
	/** Id of an ancestor category whose heading this one should nest
	 *  under the first time it's created (e.g. "فوائد لغوية" under
	 *  "فوائد") — null for a top-level heading. Consulted only once, at
	 *  heading-creation time; see HeadingSectionInserter and
	 *  ReflectionCategoryCatalog.ancestorChain for the cycle-safe walk. */
	parentCategoryId: string | null;
	/** Vault-relative folder — used only when organizationMode is "ownFolder". */
	folder: string;
	isBuiltin: boolean;
}

/** One Arabic-text normalization rule. Ships with sane defaults in
 *  settings.normalizationRules; fully user-editable from there. */
export interface NormalizationRule {
	id: string;
	description: string;
	/** Regex source (no slashes). Matched literally against normalized text. */
	pattern: string;
	flags: string;
	replacement: string;
	enabled: boolean;
}

export interface PluginConfig {
	// --- Text normalization & verse formatting ---
	stripTashkeel: boolean;
	useOrnateNumbers: boolean;
	/** Ring glyph used to wrap ornate ayah numbers, e.g. "۝". */
	ornateRingGlyph: string;
	/** Verse wrapper glyphs, e.g. "﴿" / "﴾". */
	wrapperStart: string;
	wrapperEnd: string;
	/** Template with {surah} and {verse} placeholders, e.g. "[{surah}:{verse}]".
	 *  Actually compiled into the parser regex AND the output formatter —
	 *  see VerseReference.compile() (fixes the v1 dead-setting bug). */
	referenceFormat: string;
	/** User-editable normalization/substitution rules, seeded from
	 *  data/normalizationRules.json but independent after first load. */
	normalizationRules: NormalizationRule[];

	// --- Qur'anic text styling (Live Preview / Reading view) ---
	quranFontFamily: string;
	quranFontSize: number; // em
	quranLineHeight: number;
	quranColor: string;
	styleOrnateNumbers: boolean;
	customCss: string;

	// --- Search & interface ---
	showAnalytics: boolean;
	maxSuggestionResults: number;
	maxSlidingWindowWords: number;
	interfaceLanguage: Locale;
	searchStrategy: SearchStrategy;

	// --- Tafsir ---
	defaultTafsirBookId: string;
	favoriteBooksIds: string[];
	customTafsirBooks: TafsirBookDescriptor[];
	tafsirBookResolutionOrder: TafsirResolutionStrategy[];
	includeAyahTextInTafsir: boolean;
	useHorizontalDivider: boolean;
	/** Free-text heading marker, e.g. "###". See file-level note above. */
	rangeHeadingLevel: string;
	/** Free-text heading marker, e.g. "####". */
	bookHeadingLevel: string;
	tafsirFetchDelayMs: number;
	tafsirFetchDelayThreshold: number;

	// --- Reflections (تدبر / أثر / user-defined categories) ---
	customReflectionCategories: ReflectionCategoryDescriptor[];
	/** Vault-relative folder for unified per-ayah notes (used by every
	 *  category whose organizationMode is "unified", i.e. by default). */
	ayahNotesFolder: string;
	/** When true (default), the selection that was logged is replaced
	 *  in its original note with a backlink to the ayah note instead of
	 *  being erased — v1/v2.0's `deleteSelectionAfterLinkingReflection`
	 *  used to just delete it, silently losing the content's origin.
	 *  When false, the selection is left completely untouched (a copy). */
	deleteSelectionAfterLinkingReflection: boolean;
	/** {surah}/{verse}/{ayahText} available. Empty = link with no alias,
	 *  i.e. plain "[[Note Title]]". */
	reflectionBacklinkAliasTemplate: string;
	/** Wraps the rendered backlink; the only placeholder is {link}. */
	reflectionBacklinkWrapTemplate: string;
	/** Whatever precedes each dated entry — not restricted to a heading.
	 *  {date} is the only placeholder, e.g. "### {date}", "- {date}",
	 *  "1. {date}", or empty for no prefix at all. */
	reflectionEntryPrefixTemplate: string;
	/** Inserted between consecutive entries under the same heading (or
	 *  in the same own-folder file). Can be left empty. */
	reflectionEntrySeparator: string;
	/** Where a new entry lands relative to existing ones — see
	 *  ReflectionInsertionMode. */
	reflectionInsertionMode: ReflectionInsertionMode;
	/** Must contain {ayahText}; {surah} and {verse} are also available.
	 *  Builds the unified/own-folder note's on-disk title. */
	reflectionFileNameTemplate: string;
	reflectionFileNameAyahTextMaxLength: number;
	/** Whether a freshly-created unified note gets the ayah's own text
	 *  quoted at the top (once, not repeated per entry). */
	includeAyahTextInReflectionNote: boolean;
}

```

## entities\Ayah.ts

```typescript
/** A single Qur'anic verse from the loaded corpus. */
export interface Ayah {
	/** Stable sequential id assigned at load time (position in the corpus). */
	readonly id: number;
	readonly surahId: number;
	readonly ayahId: number;
	readonly surahName: string;
	readonly text: string;
}

```

## entities\ReflectionCategory.ts

```typescript
/**
 * A category of personal writing a user links to an ayah — their own
 * reflection (تدبر) vs. something they're just recording that isn't their
 * own composition (أثر), or any use-case-specific category they define
 * themselves (فوائد عملية، فوائد لغوية، ...). Structurally identical to
 * `ReflectionCategoryDescriptor` in src/config/types.ts by design — the
 * domain layer never imports the config layer (see docs/ARCHITECTURE.md
 * §2) — so this is declared independently, same convention as
 * TafsirBook/TafsirBookDescriptor.
 */
export type CategoryOrganizationMode = "unified" | "ownFolder";

export interface ReflectionCategory {
	readonly id: string;
	readonly name: string;
	readonly organizationMode: CategoryOrganizationMode;
	/** Heading text this category's entries live under in the unified
	 *  note, e.g. "تدبرات". Also used (as a link-line anchor) for
	 *  "ownFolder" categories — see AyahNoteRepository. */
	readonly headingText: string;
	/** e.g. "###". */
	readonly headingLevel: string;
	/** Id of the ancestor category this one nests its heading under the
	 *  first time it's created — null for a top-level heading. */
	readonly parentCategoryId: string | null;
	/** Vault-relative folder — meaningful only when organizationMode is
	 *  "ownFolder". */
	readonly folder: string;
	readonly isBuiltin: boolean;
}

```

## entities\TafsirBook.ts

```typescript
/**
 * A tafsir (commentary) source — builtin or user-added.
 *
 * Structurally identical to `TafsirBookDescriptor` in
 * src/config/types.ts by design: the domain layer never imports the
 * config layer (see docs/ARCHITECTURE.md §2), so this is declared
 * independently rather than reused across the boundary. Small, deliberate
 * duplication at a hexagonal-architecture seam.
 */
export interface TafsirBook {
	readonly id: string;
	readonly name: string;
	readonly aliases: readonly string[];
	/** {bookId}, {surahId}, {ayahId} placeholders, substituted at fetch time. */
	readonly urlTemplate: string;
	readonly isBuiltin: boolean;
}

```

## ports\AyahNoteRepository.ts

```typescript
import type { ReflectionCategory } from "../entities/ReflectionCategory";

export interface AyahIdentity {
	surahId: number;
	surahName: string;
	ayahId: number;
	/** Raw (unwrapped) ayah text — used for the {ayahText} filename placeholder. */
	ayahTextRaw: string;
	/** Fully-formatted ayah text (wrapper glyphs / ornate numbers already
	 *  applied per settings) — used when quoting the ayah inside a
	 *  freshly-created note's body. Only read if includeAyahText is true. */
	ayahTextBodyFormatted: string;
}

export interface ReflectionEntryFormatting {
	insertionMode: "afterHeading" | "endOfSection";
	entrySeparator: string;
	includeAyahText: boolean;
	fileNameTemplate: string;
}

export interface AyahNoteRef {
	/** Display title (basename, no folder/extension) of the resolved note
	 *  — usable directly as a wikilink target: `[[${title}]]`. */
	title: string;
}

/**
 * How the plugin persists content against ayahs: one unified note per
 * ayah by default, with an opt-in per-category "own folder" escape hatch.
 * Replaces v1/v2.0's ReflectionFileRepository (one file per
 * category+ayah, always) — that shape no longer matches the unified note
 * default. See docs/ARCHITECTURE.md §9 "Unified ayah notes".
 */
export interface AyahNoteRepository {
	/** Writes `entryMarkdown` under `ancestorChain`'s leaf category's
	 *  heading (creating any missing ancestor headings top-down first —
	 *  see ReflectionCategoryCatalog.ancestorChain). For an "ownFolder"
	 *  leaf category, the entry instead goes to that category's own
	 *  per-ayah file, and a bidirectional link is kept in sync with the
	 *  unified note. Creates the unified note (and, for "ownFolder", the
	 *  own-folder note) if it doesn't exist yet. */
	appendEntry(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef>;

	/** Union-merges `relatedNoteTitles` into this ayah's `relatedAyat`
	 *  frontmatter on its *unified* note — creates the note if it doesn't
	 *  exist yet, never overwrites links already there. */
	linkRelatedAyat(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		relatedNoteTitles: readonly string[]
	): Promise<AyahNoteRef>;

	/** Resolves the unified note's display title for this ayah. If
	 *  `createIfMissing` is false and no such note exists yet, returns
	 *  null instead of creating one (used for a backlink where "nothing
	 *  logged yet for this ayah" should stay that way). */
	resolveUnifiedNoteTitle(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		createIfMissing: boolean
	): Promise<string | null>;
}

```

## ports\EditorPort.ts

```typescript
export interface EditorPosition {
	line: number;
	ch: number;
}

export type CursorAnchor = "from" | "to" | "head" | "anchor";

/** The slice of Obsidian's `Editor` the application layer actually needs.
 *  Kept intentionally small so a test double is trivial to write and so
 *  use cases never import `obsidian`. */
export interface EditorPort {
	getCursor(anchor?: CursorAnchor): EditorPosition;
	getLine(line: number): string;
	lineCount(): number;
	setLine(line: number, text: string): void;
	replaceRange(text: string, from: EditorPosition, to: EditorPosition): void;
	getSelection(): string;
	getValue(): string;
}

```

## ports\InsertionMemento.ts

```typescript
import type { Ayah } from "../entities/Ayah";

/** State needed to implement the "toggle full ayah <-> last-typed
 *  snippet on repeat invoke" behavior (FR-9), kept out of the editor
 *  adapter so it's independently testable. */
export interface InsertionMemento {
	line: number;
	query: string;
	ayahs: readonly Ayah[];
	isSnippet: boolean;
}

export interface InsertionMementoStore {
	get(): InsertionMemento | null;
	set(memento: InsertionMemento | null): void;
}

```

## ports\NoticePort.ts

```typescript
/** Abstraction over Obsidian's `Notice` so domain/application code can
 *  surface a message to the user without importing `obsidian`. */
export interface NoticePort {
	show(message: string): void;
}

```

## ports\QuranRepository.ts

```typescript
import type { Ayah } from "../entities/Ayah";

/** How the domain/application layers access the Qur'an corpus. Implemented
 *  once against Obsidian's bundled data today (ObsidianQuranRepository);
 *  could equally be backed by a vault file or a remote source later
 *  without any use case changing. */
export interface QuranRepository {
	loadAll(): Promise<void>;
	getAllAyahs(): readonly Ayah[];
	/** Normalized, space-joined text of the whole corpus (in the same
	 *  order as getAllAyahs()) for sliding-window substring search. */
	getSearchCorpusText(): string;
	findSurahByName(normalizedSurahName: string): { id: number; name: string } | null;
	findAyah(surahId: number, ayahId: number): Ayah | null;
}

```

## ports\ReflectionFileRepository.ts

```typescript
import type { ReflectionCategory } from "../entities/ReflectionCategory";

export interface ReflectionFileEntry {
	surahId: number;
	surahName: string;
	ayahId: number;
	/** Precomputed file title (no ".md", no folder) — see
	 *  ReflectionFileNameBuilder. Purely cosmetic: the repository never
	 *  uses this to *find* a file, only to *name* a new one — see its
	 *  own doc comment. */
	fileTitle: string;
	/** Fully-formatted Markdown for one dated entry (heading, optional
	 *  range notice, optional quoted passage, the reflection text) —
	 *  built entirely by the application layer; this port only decides
	 *  *where* it's persisted and whether to create vs. append. */
	entryMarkdown: string;
}

/** Persists one تدبر/أثر entry into its per-ayah note file (one file per
 *  ayah under category.folder, e.g. "تدبرات/... .md") — creating the file
 *  (with frontmatter identifying which ayah it belongs to) the first time
 *  an ayah is linked, appending a new dated entry to it on every later
 *  occasion. */
export interface ReflectionFileRepository {
	appendEntry(category: ReflectionCategory, entry: ReflectionFileEntry): Promise<void>;
}

```

## ports\TafsirRepository.ts

```typescript
import type { TafsirBook } from "../entities/TafsirBook";

/** Fetches commentary text for one (book, surah, ayah). The HTTP
 *  implementation is one adapter among possibly several — see
 *  docs/ARCHITECTURE.md §8 "Add a tafsir source". */
export interface TafsirRepository {
	fetchTafsir(book: TafsirBook, surahId: number, ayahId: number): Promise<string>;
}

```

## services\AnalyticsCalculator.ts

```typescript
import type { Ayah } from "../entities/Ayah";

export interface AnalyticsResult {
	totalMatches: number;
	mostQuoted: { surahName: string; count: number; densityPercent: number } | null;
	densest: { surahName: string; densityPercent: number } | null;
}

/** Pure computation behind the search-modal analytics dashboard (FR-20):
 *  total match count, the surah quoted most (by raw count) with its
 *  density, and the surah with the highest density (matches / total
 *  words in that surah) — which need not be the same surah. */
export class AnalyticsCalculator {
	static compute(matches: readonly Ayah[], corpus: readonly Ayah[]): AnalyticsResult {
		if (matches.length === 0) {
			return { totalMatches: 0, mostQuoted: null, densest: null };
		}

		const surahCounts = new Map<number, number>();
		for (const a of matches) surahCounts.set(a.surahId, (surahCounts.get(a.surahId) ?? 0) + 1);

		const wordCountCache = new Map<number, number>();
		const wordsInSurah = (surahId: number): number => {
			let cached = wordCountCache.get(surahId);
			if (cached === undefined) {
				cached = corpus
					.filter((a) => a.surahId === surahId)
					.reduce((sum, a) => sum + a.text.split(/\s+/).length, 0);
				wordCountCache.set(surahId, cached);
			}
			return cached;
		};

		let maxSurahId: number | null = null;
		let maxCount = 0;
		let highestDensitySurahId: number | null = null;
		let highestDensity = 0;

		for (const [surahId, count] of surahCounts) {
			if (count > maxCount) {
				maxCount = count;
				maxSurahId = surahId;
			}
			const density = count / (wordsInSurah(surahId) || 1);
			if (density > highestDensity) {
				highestDensity = density;
				highestDensitySurahId = surahId;
			}
		}

		const nameOf = (surahId: number | null): string => corpus.find((a) => a.surahId === surahId)?.surahName ?? "";

		return {
			totalMatches: matches.length,
			mostQuoted:
				maxSurahId !== null
					? {
							surahName: nameOf(maxSurahId),
							count: maxCount,
							densityPercent: (maxCount / (wordsInSurah(maxSurahId) || 1)) * 100,
					  }
					: null,
			densest:
				highestDensitySurahId !== null
					? { surahName: nameOf(highestDensitySurahId), densityPercent: highestDensity * 100 }
					: null,
		};
	}
}

```

## services\ArabicNormalizer.ts

```typescript
/**
 * Arabic text normalization for matching/search. v1 had this as a single
 * fixed function (`QuranText.normalizeForSearch`) with a hardcoded
 * substitution table baked in. Here the substitution table is injected
 * (NFR-2) — see data/normalizationRules.json for the shipped defaults and
 * settings.normalizationRules for the user-editable copy.
 *
 * Note on rule ordering: v1 applied its "يا أيها" rules before stripping
 * tashkeel and its short-alef rules after. None of the shipped rules'
 * patterns contain tashkeel marks, so applying the whole configured rule
 * list in one pass before stripping tashkeel is behaviorally identical for
 * the default ruleset while being far simpler to reason about for
 * user-added rules.
 */

export interface TextSubstitutionRule {
	pattern: string;
	flags: string;
	replacement: string;
	enabled: boolean;
}

const TASHKEEL_CLASS = "\\u0670\\u0610-\\u061A\\u064B-\\u065F\\u06D6-\\u06DC\\u06DF-\\u06E8\\u06EA-\\u06ED";
const TASHKEEL_REGEX = new RegExp(`[${TASHKEEL_CLASS}]`, "g");

export class ArabicNormalizer {
	private readonly compiledRules: Array<{ regex: RegExp; replacement: string }>;

	constructor(rules: readonly TextSubstitutionRule[]) {
		this.compiledRules = rules
			.filter((r) => r.enabled)
			.map((r) => ({ regex: new RegExp(r.pattern, r.flags || "g"), replacement: r.replacement }));
	}

	stripTashkeel(text: string): string {
		if (!text) return "";
		return text.replace(TASHKEEL_REGEX, "");
	}

	/** Normalize text for tolerant matching: applies configured
	 *  substitution rules, strips tashkeel, unifies letter-shape variants
	 *  (hamza forms, ya forms, waw-hamza, ta marbuta), then strips anything
	 *  outside the Arabic block/digits/whitespace. */
	normalizeForSearch(text: string): string {
		if (!text) return "";
		let out = text.trim();

		for (const rule of this.compiledRules) {
			out = out.replace(rule.regex, rule.replacement);
		}

		out = this.stripTashkeel(out);

		out = out
			.replace(/[\u0623\u0625\u0622\u0671\u0621\u0649]/g, "\u0627") // أ إ آ ٱ ء ى -> ا
			.replace(/[\u064A\u0626]/g, "\u064A") // ئ -> ي
			.replace(/\u0624/g, "\u0648") // ؤ -> و
			.replace(/\u0629/g, "\u0647") // ة -> ه
			.replace(/\u0640/g, ""); // strip tatweel (ـ)

		out = out.replace(/\u064A\u0627\u0627/g, "\u064A\u0627"); // ياا -> يا artifact cleanup

		out = out
			.replace(/[^\u0621-\u064A\s0-9\u0660-\u0669]/g, "")
			.replace(/\u0627+/g, "\u0627") // collapse repeated alefs
			.replace(/\s+/g, " ")
			.trim();

		return out;
	}

	/** Arabic-Indic (٠-٩) and Extended Arabic-Indic/Persian (۰-۹) digits -> Western digits. */
	static normalizeNumbers(text: string): string {
		if (!text) return "";
		return text
			.replace(/[\u0660-\u0669]/g, (d) => "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".indexOf(d).toString())
			.replace(/[\u06F0-\u06F9]/g, (d) => "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9".indexOf(d).toString());
	}
}

```

## services\FuzzyMatcher.ts

```typescript
import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PatternBuilder } from "./PatternBuilder";

/** Looser than PhraseMatcher: every query word must appear *somewhere* in
 *  an ayah's normalized text, in any order/position — surfaces partial or
 *  reordered recollections of a verse. Powers the live search-modal
 *  suggestions (FR-16/17). */
export class FuzzyMatcher {
	constructor(private readonly normalizer: ArabicNormalizer) {}

	findMatches(query: string, corpus: readonly Ayah[], limit: number): Ayah[] {
		const words = this.normalizer
			.normalizeForSearch(query)
			.split(/\s+/)
			.filter((w) => w.length > 0);
		if (words.length === 0) return [];
		const regexes = words.map((w) => new RegExp(PatternBuilder.makeMedialAlefsOptional(w)));
		const out: Ayah[] = [];
		for (const a of corpus) {
			const normText = this.normalizer.normalizeForSearch(a.text);
			if (regexes.every((rx) => rx.test(normText))) {
				out.push(a);
				if (out.length >= limit) break;
			}
		}
		return out;
	}
}

```

## services\HeadingSectionInserter.ts

```typescript
export type InsertionMode = "afterHeading" | "endOfSection";

export interface HeadingSectionOptions {
	/** e.g. "###". */
	headingLevel: string;
	headingText: string;
	/** Consulted only if the heading doesn't exist yet — nests the new
	 *  heading at the end of the parent's section instead of at the end
	 *  of the file. Both must be given together or not at all. */
	parentHeadingLevel: string | null;
	parentHeadingText: string | null;
	insertionMode: InsertionMode;
	/** Inserted between this entry and whatever else is already in the
	 *  section — never inserted into an empty section. May be "". */
	separator: string;
}

const HEADING_LINE_REGEX = /^(#{1,6})\s+(.*)$/;

function depthOf(marker: string): number {
	return marker.length;
}

function headingLineIndex(lines: readonly string[], level: string, text: string): number {
	const target = `${level} ${text}`.trim();
	return lines.findIndex((l) => l.trim() === target);
}

/** First line index after `startIndex` whose heading depth is <= `ownDepth`
 *  (a sibling-or-higher-level heading) — i.e. where this section ends.
 *  `lines.length` if the section runs to the end of the file. */
function sectionEndIndex(lines: readonly string[], startIndex: number, ownDepth: number): number {
	for (let i = startIndex + 1; i < lines.length; i++) {
		const m = lines[i].match(HEADING_LINE_REGEX);
		if (m && depthOf(m[1]) <= ownDepth) return i;
	}
	return lines.length;
}

function toLines(content: string): string[] {
	return content.length > 0 ? content.split("\n") : [];
}

function fromLines(lines: readonly string[]): string {
	// Collapse any accidental triple-blank-lines from the splice math below,
	// then guarantee exactly one trailing newline (Obsidian's own convention).
	return lines
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trimEnd()
		.concat("\n");
}

/**
 * Finds/creates a heading section inside a single note's Markdown and
 * inserts content into it. Deliberately narrow in scope (see the
 * architecture discussion this was designed in): it does not understand
 * or manage a full outline, does not reorder existing headings, and only
 * ever nests a *new* heading under one already-resolved parent — it never
 * walks a parent chain itself (that's ReflectionCategoryCatalog's job,
 * top-down, one ensureHeadingExists() call per ancestor).
 */
export class HeadingSectionInserter {
	/** Inserts `entryBlock` under the section for `headingLevel headingText`,
	 *  creating that heading (nested under the parent heading if given and
	 *  found, else appended at the end of the file) if it doesn't exist yet. */
	static insertEntry(content: string, options: HeadingSectionOptions, entryBlock: string): string {
		let lines = toLines(content);
		let headingIdx = headingLineIndex(lines, options.headingLevel, options.headingText);
		const ownDepth = depthOf(options.headingLevel);

		if (headingIdx === -1) {
			lines = this.createHeadingLines(lines, options);
			headingIdx = headingLineIndex(lines, options.headingLevel, options.headingText);
		}

		const sectionEnd = sectionEndIndex(lines, headingIdx, ownDepth);
		const sectionIsEmpty = lines.slice(headingIdx + 1, sectionEnd).every((l) => l.trim() === "");

		let insertAt: number;
		let block: string;
		if (options.insertionMode === "afterHeading") {
			insertAt = headingIdx + 1;
			block = sectionIsEmpty ? entryBlock : `${entryBlock}${options.separator}`;
		} else {
			insertAt = sectionEnd;
			block = sectionIsEmpty ? entryBlock : `${options.separator}${entryBlock}`;
		}

		const merged = [...lines.slice(0, insertAt), ...block.split("\n"), ...lines.slice(insertAt)];
		return fromLines(merged);
	}

	/** Ensures the heading itself exists (creating it, nested under the
	 *  parent if given, if missing) without inserting any content — used
	 *  to walk an ancestor chain top-down before the leaf category's
	 *  actual entry is inserted. */
	static ensureHeadingExists(
		content: string,
		headingLevel: string,
		headingText: string,
		parentHeadingLevel: string | null,
		parentHeadingText: string | null
	): string {
		const lines = toLines(content);
		if (headingLineIndex(lines, headingLevel, headingText) !== -1) {
			return content.endsWith("\n") ? content : `${content}\n`;
		}
		return fromLines(
			this.createHeadingLines(lines, {
				headingLevel,
				headingText,
				parentHeadingLevel,
				parentHeadingText,
				insertionMode: "afterHeading",
				separator: "",
			})
		);
	}

	/** Idempotently ensures a single link line exists somewhere directly
	 *  under the heading — a no-op if that exact line is already present.
	 *  Used for the unified<->own-folder bidirectional link line. */
	static ensureLinkLine(content: string, options: HeadingSectionOptions, linkLine: string): string {
		const lines = toLines(content);
		const headingIdx = headingLineIndex(lines, options.headingLevel, options.headingText);
		if (headingIdx !== -1) {
			const ownDepth = depthOf(options.headingLevel);
			const sectionEnd = sectionEndIndex(lines, headingIdx, ownDepth);
			const alreadyPresent = lines.slice(headingIdx + 1, sectionEnd).some((l) => l.trim() === linkLine.trim());
			if (alreadyPresent) return content.endsWith("\n") ? content : `${content}\n`;
		}
		return this.insertEntry(content, { ...options, insertionMode: "afterHeading" }, linkLine);
	}

	private static createHeadingLines(lines: readonly string[], options: HeadingSectionOptions): string[] {
		const newHeading = [`${options.headingLevel} ${options.headingText}`, ""];
		if (options.parentHeadingLevel && options.parentHeadingText) {
			const parentIdx = headingLineIndex(lines, options.parentHeadingLevel, options.parentHeadingText);
			if (parentIdx !== -1) {
				const insertAt = sectionEndIndex(lines, parentIdx, depthOf(options.parentHeadingLevel));
				return [...lines.slice(0, insertAt), "", ...newHeading, ...lines.slice(insertAt)];
			}
		}
		if (lines.length === 0) return newHeading;
		return [...lines, "", ...newHeading];
	}
}

```

## services\OrnateNumberConverter.ts

```typescript
const ARABIC_INDIC_DIGITS = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";

/** Converts "(N)" ayah-number markers into ring-glyph-wrapped Arabic-Indic
 *  digits, e.g. "(12)" -> " ۝١٢ ". Both the ring glyph and whether this
 *  runs at all are settings (settings.ornateRingGlyph / useOrnateNumbers) —
 *  v1 hardcoded "۝" directly in the formatter. */
export class OrnateNumberConverter {
	constructor(private readonly ringGlyph: string) {}

	applyOrnateNumbers(text: string): string {
		return text.replace(/\((\d+)\)/g, (_match, digits: string) => {
			const arabicDigits = digits
				.split("")
				.map((d) => ARABIC_INDIC_DIGITS[parseInt(d, 10)])
				.join("");
			return ` ${this.ringGlyph}${arabicDigits} `;
		});
	}
}

```

## services\PatternBuilder.ts

```typescript
export class PatternBuilder {
	/** Turn a normalized word into a regex source where every *interior*
	 *  alef is optional, so both "رحمن" and "رحمان" spellings match the
	 *  same word without a separate normalization rule per variant. */
	static makeMedialAlefsOptional(word: string): string {
		if (!word || word.length <= 2) return word;
		let out = word[0];
		for (let i = 1; i < word.length - 1; i++) {
			out += word[i] === "\u0627" ? "\u0627?" : word[i];
		}
		return out + word[word.length - 1];
	}
}

```

## services\PhraseMatcher.ts

```typescript
import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PatternBuilder } from "./PatternBuilder";

/** Exact, order-preserving phrase matching: query words must appear
 *  contiguously in an ayah's normalized text (word-boundary anchored).
 *  Backs direct query resolution (a selection or {query}), the
 *  sliding-window search (SlidingWindowSearch), and — since
 *  settings.searchStrategy defaults to "literal" — the live search modal
 *  too. Contrast with FuzzyMatcher, which is looser and is the other
 *  option for the live search modal.
 *
 *  `allowPrefixOnLastWord` exists specifically for that live-typing case:
 *  every word the user has already *finished* typing must still match
 *  exactly, but the word they're still in the middle of typing needs to
 *  match as a prefix ("الل" should already surface "الله") — otherwise
 *  live search shows nothing until each word is complete, which is what
 *  direct query resolution and SlidingWindowSearch (matching an already
 *  fully-written quote) actually want, but a suggestion list while
 *  typing does not. Only the trailing boundary is affected: earlier
 *  words are already exact because they're pinned between `\s+`
 *  separators regardless of this flag. */
export class PhraseMatcher {
	constructor(private readonly normalizer: ArabicNormalizer) {}

	buildPattern(query: string, allowPrefixOnLastWord = false): RegExp | null {
		const normWords = this.normalizer
			.normalizeForSearch(query)
			.split(/\s+/)
			.filter((w) => w.length > 0);
		if (normWords.length === 0) return null;
		const body = normWords.map((w) => PatternBuilder.makeMedialAlefsOptional(w)).join("\\s+");
		const trailingBoundary = allowPrefixOnLastWord ? "" : "(?:\\s|$)";
		return new RegExp(`(?:^|\\s)${body}${trailingBoundary}`);
	}

	findMatches(query: string, corpus: readonly Ayah[], allowPrefixOnLastWord = false): Ayah[] {
		const pattern = this.buildPattern(query, allowPrefixOnLastWord);
		if (!pattern) return [];
		return corpus.filter((a) => pattern.test(this.normalizer.normalizeForSearch(a.text)));
	}
}


```

## services\ReflectionCategoryCatalog.ts

```typescript
import type { ReflectionCategory } from "../entities/ReflectionCategory";

/**
 * Same builtin+custom merge convention as TafsirCatalog (NFR-1): the
 * shipped تدبر/أثر categories live in data/reflectionCategories.json,
 * merged with settings.customReflectionCategories at runtime so adding a
 * third category (e.g. فائدة) needs no code change — just a Settings
 * entry (its own link command still needs a line in registerCommands.ts,
 * see createLinkReflectionCommand's doc comment).
 */
export class ReflectionCategoryCatalog {
	private readonly categories: readonly ReflectionCategory[];

	constructor(builtin: readonly ReflectionCategory[], custom: readonly ReflectionCategory[]) {
		const byId = new Map<string, ReflectionCategory>();
		for (const c of builtin) byId.set(c.id, c);
		for (const c of custom) byId.set(c.id, c);
		this.categories = Array.from(byId.values());
	}

	all(): readonly ReflectionCategory[] {
		return this.categories;
	}

	byId(id: string): ReflectionCategory | null {
		return this.categories.find((c) => c.id === id) ?? null;
	}

	/** Root-to-leaf ancestor chain for `categoryId` (the category itself
	 *  is the last element), walked via `parentCategoryId`. Cycle-safe:
	 *  if a chain of parents loops back on itself, the walk stops at the
	 *  point of the cycle rather than hanging or throwing — heading
	 *  creation must never fail because of a settings mistake, it should
	 *  just degrade to treating the category as top-level from there. */
	ancestorChain(categoryId: string): ReflectionCategory[] {
		const chain: ReflectionCategory[] = [];
		const visited = new Set<string>();
		let current = this.byId(categoryId);
		while (current && !visited.has(current.id)) {
			visited.add(current.id);
			chain.unshift(current);
			current = current.parentCategoryId ? this.byId(current.parentCategoryId) : null;
		}
		return chain;
	}
}

```

## services\ReflectionFileNameBuilder.ts

```typescript
const AYAH_TEXT_PLACEHOLDER = "{ayahText}";
const SURAH_PLACEHOLDER = "{surah}";
const VERSE_PLACEHOLDER = "{verse}";

/**
 * Builds the on-disk title for a single ayah's تدبر/أثر file from a
 * user-configurable template (settings.reflectionFileNameTemplate) — same
 * placeholder-substitution convention as VerseReference, just for a
 * filename instead of an inline citation.
 *
 * Defaults to quoting the ayah's own text (plus its reference) rather
 * than the reference alone, per explicit request: the file's title
 * should read as the ayah, not just its address. `{ayahText}` isn't
 * required — a user who prefers the old reference-only titles can set
 * the template to just "{surah} {verse}".
 *
 * File *identity* (which ayah a file belongs to) is never derived from
 * this title — see ObsidianReflectionFileRepository, which keys lookups
 * off frontmatter instead — so changing this template later never
 * orphans/duplicates existing files, only affects new ones.
 */
export class ReflectionFileNameBuilder {
	constructor(private readonly template: string, private readonly maxAyahTextLength: number) {}

	build(surahName: string, ayahId: number, ayahText: string): string {
		const truncated = this.truncate(ayahText.trim());
		return this.template
			.split(AYAH_TEXT_PLACEHOLDER)
			.join(truncated)
			.split(SURAH_PLACEHOLDER)
			.join(surahName)
			.split(VERSE_PLACEHOLDER)
			.join(String(ayahId))
			.replace(/\s{2,}/g, " ")
			.trim();
	}

	private truncate(text: string): string {
		if (this.maxAyahTextLength <= 0 || text.length <= this.maxAyahTextLength) return text;
		return `${text.slice(0, this.maxAyahTextLength).trim()}\u2026`;
	}
}

```

## services\SlidingWindowSearch.ts

```typescript
import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PhraseMatcher } from "./PhraseMatcher";

export interface SlidingWindowMatch {
	/** The raw (un-normalized) text segment as it appears on the line. */
	segment: string;
	startWordIndex: number;
	wordCount: number;
	ayahs: Ayah[];
}

/**
 * Auto-detects an unmarked Qur'anic quote already typed on a line: masks
 * out anything already inside wrapper glyphs, then tries shrinking word
 * windows (maxWindowWords down to 2), longest match wins. v1 duplicated
 * this algorithm almost verbatim in two places (context analysis and the
 * extraction fallback) — consolidated to one implementation here, used by
 * both AnalyzeLineContext and ExtractAndInsertVerse.
 *
 * Performance: tests each candidate window against the pre-concatenated,
 * normalized corpus string first (cheap) before filtering the full ayah
 * array (expensive) — same optimization v1 used via its "giant string".
 */
export class SlidingWindowSearch {
	constructor(
		private readonly normalizer: ArabicNormalizer,
		private readonly phraseMatcher: PhraseMatcher,
		private readonly wrapperStart: string,
		private readonly wrapperEnd: string,
		private readonly maxWindowWords: number
	) {}

	private maskWrapped(line: string): string {
		const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const rx = new RegExp(`${escape(this.wrapperStart)}.*?${escape(this.wrapperEnd)}`, "g");
		return line.replace(rx, " ");
	}

	find(lineText: string, corpus: readonly Ayah[], searchCorpusText: string): SlidingWindowMatch | null {
		const maskedLine = this.maskWrapped(lineText);
		const rawWords = maskedLine.split(/\s+/).filter((w) => w.trim().length > 0);

		for (let len = Math.min(rawWords.length, this.maxWindowWords); len >= 2; len--) {
			for (let start = 0; start <= rawWords.length - len; start++) {
				const segment = rawWords.slice(start, start + len).join(" ");
				const pattern = this.phraseMatcher.buildPattern(segment);
				if (!pattern) continue;
				if (!pattern.test(searchCorpusText)) continue; // fast reject
				const matches = corpus.filter((a) => pattern.test(this.normalizer.normalizeForSearch(a.text)));
				if (matches.length > 0) {
					return { segment, startWordIndex: start, wordCount: len, ayahs: matches };
				}
			}
		}
		return null;
	}
}

```

## services\SnippetExtractor.ts

```typescript
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PatternBuilder } from "./PatternBuilder";

/**
 * Word-index based extraction: finding a snippet (a run of words) inside a
 * full ayah, or a word..word range inside a full ayah. Depends only on
 * ArabicNormalizer (injected) and the configured wrapper glyphs — no
 * Obsidian types, fully unit-testable.
 */
export class SnippetExtractor {
	constructor(
		private readonly normalizer: ArabicNormalizer,
		private readonly wrapperStart: string,
		private readonly wrapperEnd: string
	) {}

	/** Find `userSnippet`'s words as a contiguous run inside `fullVerse` and
	 *  return just that run (original spelling/tashkeel preserved). Falls
	 *  back to `fullVerse` unchanged if no match is found. */
	extractSnippet(fullVerse: string, userSnippet: string): string {
		if (!userSnippet) return fullVerse;
		const verseWords = fullVerse.trim().split(/\s+/);
		const normVerseWords = verseWords.map((w) => this.normalizer.normalizeForSearch(w));
		const searchWords = userSnippet
			.trim()
			.split(/\s+/)
			.map((w) => this.normalizer.normalizeForSearch(w));
		if (searchWords.length === 0) return fullVerse;
		const patterns = searchWords.map((w) => PatternBuilder.makeMedialAlefsOptional(w));

		for (let i = 0; i <= normVerseWords.length - searchWords.length; i++) {
			let matched = true;
			for (let j = 0; j < searchWords.length; j++) {
				const rx = new RegExp(`^${patterns[j]}$`);
				if (!rx.test(normVerseWords[i + j])) {
					matched = false;
					break;
				}
			}
			if (matched) return verseWords.slice(i, i + searchWords.length).join(" ");
		}
		return fullVerse;
	}

	/** Crop `fullVerse` to the inclusive word range between `startWord` and
	 *  `endWord` (e.g. from a "(word1-word2)" shorthand). Strips any
	 *  existing wrapper glyphs / "(N)" markers before searching. */
	extractRange(fullVerse: string, startWord: string, endWord: string): string {
		if (!startWord || !endWord) return fullVerse;
		const cleanVerse = fullVerse
			.split(this.wrapperStart)
			.join("")
			.split(this.wrapperEnd)
			.join("")
			.replace(/\(\d+\)/g, "")
			.trim();
		const verseWords = cleanVerse.split(/\s+/);
		const normVerseWords = verseWords.map((w) => this.normalizer.normalizeForSearch(w));

		const startPattern = new RegExp(
			`^${PatternBuilder.makeMedialAlefsOptional(this.normalizer.normalizeForSearch(startWord))}$`
		);
		const endPattern = new RegExp(
			`^${PatternBuilder.makeMedialAlefsOptional(this.normalizer.normalizeForSearch(endWord))}$`
		);

		let startIndex = -1;
		let endIndex = -1;
		for (let i = 0; i < normVerseWords.length; i++) {
			if (startIndex === -1 && startPattern.test(normVerseWords[i])) startIndex = i;
			if (startIndex !== -1 && endPattern.test(normVerseWords[i])) {
				endIndex = i;
				break;
			}
		}
		if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
			return verseWords.slice(startIndex, endIndex + 1).join(" ");
		}
		return cleanVerse;
	}
}

```

## services\TafsirCatalog.ts

```typescript
import type { TafsirBook } from "../entities/TafsirBook";

/**
 * v1's `TAFSIR_BOOKS_LIST` was a hardcoded 42-entry array baked into the
 * bundle — a user could not add a source without editing source and
 * rebuilding. Here the builtin list is bundled *data*
 * (data/tafsirBooks.json) and this class merges it with
 * `settings.customTafsirBooks` (NFR-1); a custom entry with an id that
 * matches a builtin one overrides it (e.g. to re-point its URL), anything
 * else is additive.
 */
export class TafsirCatalog {
	private readonly books: readonly TafsirBook[];

	constructor(builtin: readonly TafsirBook[], custom: readonly TafsirBook[]) {
		const byId = new Map<string, TafsirBook>();
		for (const b of builtin) byId.set(b.id, b);
		for (const b of custom) byId.set(b.id, b);
		this.books = Array.from(byId.values());
	}

	all(): readonly TafsirBook[] {
		return this.books;
	}

	byId(id: string): TafsirBook | null {
		return this.books.find((b) => b.id === id) ?? null;
	}

	byIds(ids: readonly string[]): TafsirBook[] {
		return this.books.filter((b) => ids.includes(b.id));
	}

	/** Books whose name or an alias literally appears in `lineText`
	 *  (used to auto-detect intent, e.g. a line mentioning "ابن كثير"). */
	findMentionedIn(lineText: string): TafsirBook[] {
		if (!lineText) return [];
		return this.books.filter((b) => b.aliases.some((alias) => lineText.indexOf(alias) !== -1));
	}

	/** Case-insensitive substring search across name + aliases, for the
	 *  book-picker modal. */
	search(query: string): TafsirBook[] {
		const q = query.toLowerCase().trim();
		if (!q) return [...this.books];
		return this.books.filter(
			(b) => b.name.toLowerCase().includes(q) || b.aliases.some((a) => a.toLowerCase().includes(q))
		);
	}
}

```

## services\VerseOutputFormatter.ts

```typescript
import type { Ayah } from "../entities/Ayah";
import type { CompiledVerseReference } from "../value-objects/VerseReference";
import type { OrnateNumberConverter } from "./OrnateNumberConverter";

export interface FormattingOptions {
	wrapperStart: string;
	wrapperEnd: string;
	useOrnateNumbers: boolean;
	stripTashkeelOnOutput: boolean;
}

/** Builds the final `﴿ ayah text (n) ﴾ [Surah:n-m]` string. Every glyph is
 *  a parameter (from settings), and the reference suffix is delegated to
 *  the compiled VerseReference so the template is respected end-to-end. */
export class VerseOutputFormatter {
	constructor(
		private readonly ornateConverter: OrnateNumberConverter,
		private readonly reference: CompiledVerseReference,
		private readonly stripTashkeelFn: (text: string) => string
	) {}

	format(ayahs: readonly Ayah[], options: FormattingOptions): string {
		if (ayahs.length === 0) return "";
		const formatted = ayahs.map((a) => {
			const text = options.stripTashkeelOnOutput ? this.stripTashkeelFn(a.text) : a.text;
			return `${text} (${a.ayahId})`;
		});
		const core = `${options.wrapperStart} ${formatted.join(" ")} ${options.wrapperEnd}`;
		const finalCore = options.useOrnateNumbers ? this.ornateConverter.applyOrnateNumbers(core) : core;

		const first = ayahs[0];
		const last = ayahs[ayahs.length - 1];
		const reference = ` ${this.reference.format(first.surahName, first.ayahId, last.ayahId)}`;
		return finalCore + reference;
	}
}

```

## value-objects\VerseReference.ts

```typescript
/**
 * v1 declared a `referenceFormat` setting ("[Surah:Verse]") but every
 * regex and every formatted output string hardcoded literal `[`, `:`,
 * `]` — the setting was pure decoration. This value object is the fix:
 * `compile()` turns a template containing the `{surah}` and `{verse}`
 * placeholders into BOTH a parser and a formatter, so changing the
 * template in Settings changes what the plugin recognizes on a line and
 * what it writes, everywhere, from one source of truth.
 */

const SURAH_PLACEHOLDER = "{surah}";
const VERSE_PLACEHOLDER = "{verse}";

export interface VerseReferenceMatch {
	surahName: string;
	startAyah: number;
	endAyah: number;
	/** The full matched substring, e.g. "[البقرة:255]". */
	matchText: string;
	/** Character offset of the match within the searched text. */
	index: number;
}

export interface CompiledVerseReference {
	/** First match anywhere in `text`, or null. */
	find(text: string): VerseReferenceMatch | null;
	/** Every non-overlapping match in `text`. */
	findAll(text: string): VerseReferenceMatch[];
	/** True if `text` contains at least one reference. */
	test(text: string): boolean;
	/** Build the reference string for a surah name + ayah (or ayah range). */
	format(surahName: string, startAyah: number, endAyah: number): string;
	/** Remove every reference in `text` (and one preceding whitespace
	 *  character per match, matching v1's "remove reference" behavior). */
	strip(text: string): string;
}

function escapeRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class VerseReference {
	static compile(template: string): CompiledVerseReference {
		const surahIdx = template.indexOf(SURAH_PLACEHOLDER);
		const verseIdx = template.indexOf(VERSE_PLACEHOLDER);
		if (surahIdx === -1 || verseIdx === -1) {
			throw new Error(
				`referenceFormat "${template}" must contain both ${SURAH_PLACEHOLDER} and ${VERSE_PLACEHOLDER}`
			);
		}
		const surahFirst = surahIdx < verseIdx;

		const before = template.slice(0, Math.min(surahIdx, verseIdx));
		const between = surahFirst
			? template.slice(surahIdx + SURAH_PLACEHOLDER.length, verseIdx)
			: template.slice(verseIdx + VERSE_PLACEHOLDER.length, surahIdx);
		const after = template.slice(
			Math.max(surahIdx, verseIdx) + (surahFirst ? VERSE_PLACEHOLDER.length : SURAH_PLACEHOLDER.length)
		);

		// Arabic-letter run for the surah name, digit(s) + optional "-digit(s)" for the ayah/range.
		const surahGroup = "([\\u0600-\\u06FF\\s]+)";
		const verseGroup = "(\\d+)(?:-(\\d+))?";

		const source = surahFirst
			? `${escapeRegex(before)}${surahGroup}${escapeRegex(between)}${verseGroup}${escapeRegex(after)}`
			: `${escapeRegex(before)}${verseGroup}${escapeRegex(between)}${surahGroup}${escapeRegex(after)}`;

		function toMatch(m: RegExpExecArray): VerseReferenceMatch {
			const surahName = (surahFirst ? m[1] : m[3]).trim();
			const startAyah = parseInt(surahFirst ? m[2] : m[1], 10);
			const endAyahRaw = surahFirst ? m[3] : m[2];
			return {
				surahName,
				startAyah,
				endAyah: endAyahRaw ? parseInt(endAyahRaw, 10) : startAyah,
				matchText: m[0],
				index: m.index,
			};
		}

		return {
			find(text: string): VerseReferenceMatch | null {
				const m = new RegExp(source).exec(text);
				return m ? toMatch(m) : null;
			},
			findAll(text: string): VerseReferenceMatch[] {
				const rx = new RegExp(source, "g");
				const out: VerseReferenceMatch[] = [];
				let m: RegExpExecArray | null;
				while ((m = rx.exec(text)) !== null) {
					out.push(toMatch(m));
					if (m[0].length === 0) rx.lastIndex++; // guard against zero-width loops
				}
				return out;
			},
			test(text: string): boolean {
				return new RegExp(source).test(text);
			},
			format(surahName: string, startAyah: number, endAyah: number): string {
				const verseStr = startAyah === endAyah ? `${startAyah}` : `${startAyah}-${endAyah}`;
				return template.replace(SURAH_PLACEHOLDER, surahName).replace(VERSE_PLACEHOLDER, verseStr);
			},
			strip(text: string): string {
				const rx = new RegExp(`\\s*(?:${source})`, "g");
				return text.replace(rx, "");
			},
		};
	}
}

```

## http\HttpTafsirRepository.ts

```typescript
import { requestUrl } from "obsidian";
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { TafsirRepository } from "../../domain/ports/TafsirRepository";

interface TafsirApiResponse {
	data?: string;
}

export class HttpTafsirRepository implements TafsirRepository {
	private readonly cache = new Map<string, string>();

	async fetchTafsir(book: TafsirBook, surahId: number, ayahId: number): Promise<string> {
		const key = `${book.id}_${surahId}_${ayahId}`;
		const cached = this.cache.get(key);
		if (cached !== undefined) return cached;

		const url = book.urlTemplate
			.replace("{bookId}", encodeURIComponent(book.id))
			.replace("{surahId}", String(surahId))
			.replace("{ayahId}", String(ayahId));

		const response = await requestUrl({ url });
		if (response.status === 200 && response.json) {
			const json = response.json as TafsirApiResponse;
			if (json.data) {
				const text = String(json.data);
				this.cache.set(key, text);
				return text;
			}
		}
		return "";
	}
}
```

## memory\InMemoryInsertionMemento.ts

```typescript
import type { InsertionMemento, InsertionMementoStore } from "../../domain/ports/InsertionMemento";

export class InMemoryInsertionMemento implements InsertionMementoStore {
	private current: InsertionMemento | null = null;

	get(): InsertionMemento | null {
		return this.current;
	}

	set(memento: InsertionMemento | null): void {
		this.current = memento;
	}
}

```

## obsidian\ObsidianAyahNoteRepository.ts

```typescript
import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type {
	AyahIdentity,
	AyahNoteRef,
	AyahNoteRepository,
	ReflectionEntryFormatting,
} from "../../domain/ports/AyahNoteRepository";
import { HeadingSectionInserter } from "../../domain/services/HeadingSectionInserter";
import { ReflectionFileNameBuilder } from "../../domain/services/ReflectionFileNameBuilder";

function sanitizeFileNameSegment(segment: string): string {
	return segment.replace(/[\\/:*?"<>|]/g, "").trim();
}

/** Everything this adapter needs from settings, read live (not captured
 *  at construction) so a Settings-tab change takes effect on the very
 *  next write without a full services rebuild. */
export interface AyahNoteSettingsSource {
	ayahNotesFolder: string;
	reflectionFileNameAyahTextMaxLength: number;
}

export class ObsidianAyahNoteRepository implements AyahNoteRepository {
	constructor(private readonly app: App, private readonly getSettings: () => AyahNoteSettingsSource) {}

	async appendEntry(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		const leaf = ancestorChain[ancestorChain.length - 1];
		if (leaf.organizationMode === "ownFolder") {
			return this.appendToOwnFolderNote(identity, ancestorChain, entryMarkdown, formatting);
		}
		return this.appendToUnifiedNote(identity, ancestorChain, entryMarkdown, formatting);
	}

	async linkRelatedAyat(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		relatedNoteTitles: readonly string[]
	): Promise<AyahNoteRef> {
		const file = await this.findOrCreateUnifiedNote(identity, fileNameTemplate, includeAyahText);
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			const existing = Array.isArray(fm.relatedAyat) ? (fm.relatedAyat as string[]) : [];
			const merged = new Set(existing);
			for (const title of relatedNoteTitles) merged.add(`[[${title}]]`);
			fm.relatedAyat = Array.from(merged);
		});
		return { title: file.basename };
	}

	async resolveUnifiedNoteTitle(
		identity: AyahIdentity,
		fileNameTemplate: string,
		includeAyahText: boolean,
		createIfMissing: boolean
	): Promise<string | null> {
		if (!createIfMissing) {
			return this.findExistingUnifiedFile(identity.surahId, identity.ayahId)?.basename ?? null;
		}
		const file = await this.findOrCreateUnifiedNote(identity, fileNameTemplate, includeAyahText);
		return file.basename;
	}

	// --- unified note ---

	private async appendToUnifiedNote(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		const file = await this.findOrCreateUnifiedNote(identity, formatting.fileNameTemplate, formatting.includeAyahText);
		await this.ensureAncestorHeadings(file, ancestorChain);
		const leaf = ancestorChain[ancestorChain.length - 1];
		const parent = ancestorChain.length > 1 ? ancestorChain[ancestorChain.length - 2] : null;
		await this.app.vault.process(file, (current) =>
			HeadingSectionInserter.insertEntry(
				current,
				{
					headingLevel: leaf.headingLevel,
					headingText: leaf.headingText,
					parentHeadingLevel: parent?.headingLevel ?? null,
					parentHeadingText: parent?.headingText ?? null,
					insertionMode: formatting.insertionMode,
					separator: formatting.entrySeparator,
				},
				entryMarkdown
			)
		);
		return { title: file.basename };
	}

	private async ensureAncestorHeadings(file: TFile, chain: readonly ReflectionCategory[]): Promise<void> {
		for (let i = 0; i < chain.length; i++) {
			const node = chain[i];
			const parent = i > 0 ? chain[i - 1] : null;
			await this.app.vault.process(file, (current) =>
				HeadingSectionInserter.ensureHeadingExists(
					current,
					node.headingLevel,
					node.headingText,
					parent?.headingLevel ?? null,
					parent?.headingText ?? null
				)
			);
		}
	}

	private findExistingUnifiedFile(surahId: number, ayahId: number): TFile | null {
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.getSettings().ayahNotesFolder));
		if (!(folder instanceof TFolder)) return null;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (fm?.surahId === surahId && fm?.ayah === ayahId) return child;
		}
		return null;
	}

	private async findOrCreateUnifiedNote(identity: AyahIdentity, fileNameTemplate: string, includeAyahText: boolean): Promise<TFile> {
		const existing = this.findExistingUnifiedFile(identity.surahId, identity.ayahId);
		if (existing) return existing;

		const settings = this.getSettings();
		await this.ensureFolder(settings.ayahNotesFolder);
		const title = new ReflectionFileNameBuilder(fileNameTemplate, settings.reflectionFileNameAyahTextMaxLength).build(
			identity.surahName,
			identity.ayahId,
			identity.ayahTextRaw
		);
		const path = this.uniquePath(settings.ayahNotesFolder, title);
		const frontmatter = [
			"---",
			`surah: "${identity.surahName}"`,
			`surahId: ${identity.surahId}`,
			`ayah: ${identity.ayahId}`,
			"relatedAyat: []",
			"---",
			"",
			"",
		].join("\n");
		const body = includeAyahText ? `${identity.ayahTextBodyFormatted}\n\n` : "";
		return this.app.vault.create(path, `${frontmatter}${body}`);
	}

	// --- own-folder note (opt-in per category) ---

	private async appendToOwnFolderNote(
		identity: AyahIdentity,
		ancestorChain: readonly ReflectionCategory[],
		entryMarkdown: string,
		formatting: ReflectionEntryFormatting
	): Promise<AyahNoteRef> {
		const category = ancestorChain[ancestorChain.length - 1];
		const unified = await this.findOrCreateUnifiedNote(identity, formatting.fileNameTemplate, formatting.includeAyahText);
		const ownFile = await this.findOrCreateOwnFolderNote(category, identity, formatting.fileNameTemplate, unified.basename);

		await this.app.vault.process(ownFile, (current) => {
			const trimmed = current.replace(/\s+$/, "");
			return trimmed.length > 0 ? `${trimmed}${formatting.entrySeparator}${entryMarkdown}\n` : `${entryMarkdown}\n`;
		});

		// Keep the unified note as "the reference": ensure a single link
		// line to the own-folder note sits under this category's heading
		// there too (idempotent — safe to call on every entry).
		await this.ensureAncestorHeadings(unified, ancestorChain);
		const parent = ancestorChain.length > 1 ? ancestorChain[ancestorChain.length - 2] : null;
		await this.app.vault.process(unified, (current) =>
			HeadingSectionInserter.ensureLinkLine(
				current,
				{
					headingLevel: category.headingLevel,
					headingText: category.headingText,
					parentHeadingLevel: parent?.headingLevel ?? null,
					parentHeadingText: parent?.headingText ?? null,
					insertionMode: "afterHeading",
					separator: formatting.entrySeparator,
				},
				`[[${ownFile.basename}]]`
			)
		);

		return { title: ownFile.basename };
	}

	private findExistingOwnFolderFile(category: ReflectionCategory, surahId: number, ayahId: number): TFile | null {
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(category.folder));
		if (!(folder instanceof TFolder)) return null;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (fm?.surahId === surahId && fm?.ayah === ayahId && fm?.category === category.id) return child;
		}
		return null;
	}

	private async findOrCreateOwnFolderNote(
		category: ReflectionCategory,
		identity: AyahIdentity,
		fileNameTemplate: string,
		unifiedTitle: string
	): Promise<TFile> {
		const existing = this.findExistingOwnFolderFile(category, identity.surahId, identity.ayahId);
		if (existing) return existing;

		const settings = this.getSettings();
		await this.ensureFolder(category.folder);
		const title = new ReflectionFileNameBuilder(fileNameTemplate, settings.reflectionFileNameAyahTextMaxLength).build(
			identity.surahName,
			identity.ayahId,
			identity.ayahTextRaw
		);
		const path = this.uniquePath(category.folder, title);
		const frontmatter = [
			"---",
			`surah: "${identity.surahName}"`,
			`surahId: ${identity.surahId}`,
			`ayah: ${identity.ayahId}`,
			`category: ${category.id}`,
			`ayahNote: "[[${unifiedTitle}]]"`,
			"---",
			"",
			"",
		].join("\n");
		return this.app.vault.create(path, frontmatter);
	}

	// --- shared file helpers (same as v1's ObsidianReflectionFileRepository) ---

	private uniquePath(folderPath: string, title: string): string {
		const base = sanitizeFileNameSegment(title) || "آية";
		let candidate = normalizePath(`${folderPath}/${base}.md`);
		let suffix = 2;
		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = normalizePath(`${folderPath}/${base} (${suffix}).md`);
			suffix++;
		}
		return candidate;
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath);
		if (this.app.vault.getAbstractFileByPath(normalized)) return;

		const segments = normalized.split("/").filter(Boolean);
		let current = "";
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				try {
					await this.app.vault.createFolder(current);
				} catch {
					// Benign race
				}
			}
		}
	}
}

```

## obsidian\ObsidianEditorAdapter.ts

```typescript
import type { Editor } from "obsidian";
import type { CursorAnchor, EditorPort, EditorPosition } from "../../domain/ports/EditorPort";

/** Obsidian's public `Editor` type doesn't declare `cm`, but the
 *  underlying CodeMirror instance is reachable at runtime (v1 relied on
 *  this too) to get one grouped undo step instead of two. Scoped to this
 *  single adapter method so nothing above infrastructure ever touches
 *  CodeMirror directly. */
interface EditorWithCm extends Editor {
	cm?: {
		dispatch: (tx: { changes: { from: number; to: number; insert: string }; userEvent: string }) => void;
	};
}

export class ObsidianEditorAdapter implements EditorPort {
	constructor(private readonly editor: Editor) {}

	getCursor(anchor: CursorAnchor = "head"): EditorPosition {
		const pos = this.editor.getCursor(anchor);
		return { line: pos.line, ch: pos.ch };
	}

	getLine(line: number): string {
		return this.editor.getLine(line);
	}

	lineCount(): number {
		return this.editor.lineCount();
	}

	setLine(line: number, text: string): void {
		this.editor.setLine(line, text);
	}

	replaceRange(text: string, from: EditorPosition, to: EditorPosition): void {
		const editor = this.editor as EditorWithCm;
		if (editor.cm && typeof editor.cm.dispatch === "function" && typeof editor.posToOffset === "function") {
			const fromOffset = editor.posToOffset(from);
			const toOffset = editor.posToOffset(to);
			editor.cm.dispatch({ changes: { from: fromOffset, to: toOffset, insert: text }, userEvent: "input" });
			return;
		}
		this.editor.replaceRange(text, from, to);
	}

	getSelection(): string {
		return this.editor.getSelection();
	}

	getValue(): string {
		return this.editor.getValue();
	}
}
```

## obsidian\ObsidianNoticeAdapter.ts

```typescript
import { Notice } from "obsidian";
import type { NoticePort } from "../../domain/ports/NoticePort";

export class ObsidianNoticeAdapter implements NoticePort {
	show(message: string): void {
		new Notice(message);
	}
}

```

## obsidian\ObsidianQuranRepository.ts

```typescript
import type { Vault } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import sampleCorpus from "../../../data/ayahs.json";

interface RawAyah {
	surah_id: number;
	ayah_id: number;
	surah_name: string;
	text: string;
	page?: number;
}

export class ObsidianQuranRepository implements QuranRepository {
	private ayahs: Ayah[] = [];
	private searchCorpusText = "";

	constructor(private readonly vault: Vault, private readonly normalizer: ArabicNormalizer) {
		void this.vault;
	}

	async loadAll(): Promise<void> {
		if (this.ayahs.length > 0) return;

		const raw: RawAyah[] = Array.isArray(sampleCorpus)
			? sampleCorpus
			: (sampleCorpus as { ayahs: RawAyah[] }).ayahs;

		this.ayahs = raw.map((a, index) => ({
			id: index + 1,
			surahId: a.surah_id,
			ayahId: a.ayah_id,
			surahName: a.surah_name,
			text: a.text,
		}));

		this.searchCorpusText = this.ayahs
			.map((a) => this.normalizer.normalizeForSearch(a.text))
			.join(" @@@ ");
	}

	getAllAyahs(): readonly Ayah[] {
		return this.ayahs;
	}

	getSearchCorpusText(): string {
		return this.searchCorpusText;
	}

	findSurahByName(normalizedSurahName: string): { id: number; name: string } | null {
		const sample = this.ayahs.find((a) => this.normalizer.normalizeForSearch(a.surahName) === normalizedSurahName);
		return sample ? { id: sample.surahId, name: sample.surahName } : null;
	}

	findAyah(surahId: number, ayahId: number): Ayah | null {
		return this.ayahs.find((a) => a.surahId === surahId && a.ayahId === ayahId) ?? null;
	}
}
```

## obsidian\ObsidianReflectionFileRepository.ts

```typescript
import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { ReflectionCategory } from "../../domain/entities/ReflectionCategory";
import type { ReflectionFileEntry, ReflectionFileRepository } from "../../domain/ports/ReflectionFileRepository";

function sanitizeFileNameSegment(segment: string): string {
	return segment.replace(/[\\/:*?"<>|]/g, "").trim();
}

export class ObsidianReflectionFileRepository implements ReflectionFileRepository {
	constructor(private readonly app: App) {}

	async appendEntry(category: ReflectionCategory, entry: ReflectionFileEntry): Promise<void> {
		await this.ensureFolder(category.folder);

		const existing = this.findExistingFile(category.folder, entry.surahId, entry.ayahId);
		if (existing) {
			await this.app.vault.process(existing, (current) => {
				return `${current.trim()}\n\n---\n\n${entry.entryMarkdown}\n`;
			});
			return;
		}

		const path = this.uniquePath(category.folder, entry.fileTitle);
		const frontmatter = [
			"---",
			`surah: "${entry.surahName}"`,
			`surahId: ${entry.surahId}`,
			`ayah: ${entry.ayahId}`,
			`category: ${category.id}`,
			"---",
			"",
			"",
		].join("\n");
		await this.app.vault.create(path, `${frontmatter}${entry.entryMarkdown}\n`);
	}

	private findExistingFile(folderPath: string, surahId: number, ayahId: number): TFile | null {
		const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
		if (!(folder instanceof TFolder)) return null;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const frontmatter = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (frontmatter?.surahId === surahId && frontmatter?.ayah === ayahId) return child;
		}
		return null;
	}

	private uniquePath(folderPath: string, title: string): string {
		const base = sanitizeFileNameSegment(title) || "تدبر";
		let candidate = normalizePath(`${folderPath}/${base}.md`);
		let suffix = 2;
		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = normalizePath(`${folderPath}/${base} (${suffix}).md`);
			suffix++;
		}
		return candidate;
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath);
		if (this.app.vault.getAbstractFileByPath(normalized)) return;

		const segments = normalized.split("/").filter(Boolean);
		let current = "";
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				try {
					await this.app.vault.createFolder(current);
				} catch {
					// Benign race
				}
			}
		}
	}
}
```

## obsidian\QuranHighlightExtension.ts

```typescript
import { Decoration, MatchDecorator, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import type { PluginConfig } from "../../config/types";
import { DEFAULT_SETTINGS } from "../../config/defaults";

const HIGHLIGHT_CLASS = "cm-quran-key-text";
const ORNATE_NUMBER_CLASS = "quran-key-ornate-number";
const ARABIC_INDIC_DIGITS = "\u0660-\u0669";
const CUSTOM_STYLE_TAG_ID = "quran-key-custom-styles";

function escapeRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createQuranHighlightExtension(wrapperStart: string, wrapperEnd: string) {
	const pattern = new RegExp(`${escapeRegex(wrapperStart)}.*?${escapeRegex(wrapperEnd)}`, "g");
	const decorator = new MatchDecorator({
		regexp: pattern,
		decoration: Decoration.mark({ class: HIGHLIGHT_CLASS }),
	});

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = decorator.createDeco(view);
			}
			update(update: ViewUpdate) {
				this.decorations = decorator.updateDeco(update, this.decorations);
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

export function createOrnateNumberHighlightExtension(ringGlyph: string) {
	const pattern = new RegExp(`${escapeRegex(ringGlyph)}[${ARABIC_INDIC_DIGITS}]+`, "g");
	const decorator = new MatchDecorator({
		regexp: pattern,
		decoration: Decoration.mark({ class: ORNATE_NUMBER_CLASS }),
	});

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = decorator.createDeco(view);
			}
			update(update: ViewUpdate) {
				this.decorations = decorator.updateDeco(update, this.decorations);
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

export function createOrnateNumberPostProcessor(ringGlyph: string): (el: HTMLElement) => void {
	const pattern = new RegExp(`(${escapeRegex(ringGlyph)}[${ARABIC_INDIC_DIGITS}]+)`, "g");

	function walk(node: Node): void {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.nodeValue || "";
			if (text.includes(ringGlyph)) {
				const frag = createFragment();
				let lastIndex = 0;
				let m: RegExpExecArray | null;
				while ((m = pattern.exec(text)) !== null) {
					if (m.index > lastIndex) {
						frag.appendText(text.slice(lastIndex, m.index));
					}
					frag.createSpan({ cls: ORNATE_NUMBER_CLASS, text: m[0] });
					lastIndex = m.index + m[0].length;
				}
				if (lastIndex < text.length) {
					frag.appendText(text.slice(lastIndex));
				}
				node.parentNode?.replaceChild(frag, node);
			}
		} else {
			const children = Array.from(node.childNodes);
			for (const child of children) walk(child);
		}
	}

	return walk;
}

export function createMarkdownPostProcessor(wrapperStart: string, wrapperEnd: string): (el: HTMLElement) => void {
	const pattern = new RegExp(`${escapeRegex(wrapperStart)}(.*?)${escapeRegex(wrapperEnd)}`, "g");

	function walk(node: Node): void {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.nodeValue || "";
			if (text.includes(wrapperStart) && text.includes(wrapperEnd)) {
				const frag = createFragment();
				let lastIndex = 0;
				let m: RegExpExecArray | null;
				while ((m = pattern.exec(text)) !== null) {
					if (m.index > lastIndex) {
						frag.appendText(text.slice(lastIndex, m.index));
					}
					frag.createSpan({ cls: HIGHLIGHT_CLASS, text: `${wrapperStart}${m[1]}${wrapperEnd}` });
					lastIndex = m.index + m[0].length;
				}
				if (lastIndex < text.length) {
					frag.appendText(text.slice(lastIndex));
				}
				node.parentNode?.replaceChild(frag, node);
			}
		} else {
			const children = Array.from(node.childNodes);
			for (const child of children) walk(child);
		}
	}

	return walk;
}

export function applyStyleVariables(settings: PluginConfig): void {
	// ضمان عدم سقوط الخط للويندوز إذا كانت الخانة فارغة
	const fontFamily = settings.quranFontFamily?.trim() || DEFAULT_SETTINGS.quranFontFamily;
	const fontSize = settings.quranFontSize || DEFAULT_SETTINGS.quranFontSize;
	const lineHeight = settings.quranLineHeight || DEFAULT_SETTINGS.quranLineHeight;

	document.body.style.setProperty("--quran-key-font-family", fontFamily);
	document.body.style.setProperty("--quran-key-font-size", `${fontSize}em`);
	document.body.style.setProperty("--quran-key-line-height", String(lineHeight));
	document.body.style.setProperty("--quran-key-line-height-loose", String(lineHeight + 0.4));
	document.body.style.setProperty("--quran-key-color", settings.quranColor || DEFAULT_SETTINGS.quranColor);

	let customStyleEl = document.getElementById(CUSTOM_STYLE_TAG_ID) as HTMLStyleElement | null;
	if (!customStyleEl) {
		customStyleEl = document.createElement("style");
		customStyleEl.id = CUSTOM_STYLE_TAG_ID;
		document.head.appendChild(customStyleEl);
	}
	customStyleEl.textContent = settings.customCss || "";
}

export function cleanupStyleVariables(): void {
	document.body.style.removeProperty("--quran-key-font-family");
	document.body.style.removeProperty("--quran-key-font-size");
	document.body.style.removeProperty("--quran-key-line-height");
	document.body.style.removeProperty("--quran-key-line-height-loose");
	document.body.style.removeProperty("--quran-key-color");

	const customStyleEl = document.getElementById(CUSTOM_STYLE_TAG_ID);
	if (customStyleEl) {
		customStyleEl.remove();
	}
}
```

## repositories\WordMeaningRepository.ts

```typescript

```

## AppServices.ts

```typescript
import type { App, Editor } from "obsidian";
import type { PluginConfig } from "../config/types";
import type { EditorPort } from "../domain/ports/EditorPort";
import type { QuranRepository } from "../domain/ports/QuranRepository";
import type { AyahNoteRepository } from "../domain/ports/AyahNoteRepository";
import type { ArabicNormalizer } from "../domain/services/ArabicNormalizer";
import type { TafsirCatalog } from "../domain/services/TafsirCatalog";
import type { ReflectionCategoryCatalog } from "../domain/services/ReflectionCategoryCatalog";
import type { AnalyzeLineContext } from "../application/use-cases/AnalyzeLineContext";
import type { ConvertReferenceToFootnote } from "../application/use-cases/ConvertReferenceToFootnote";
import type { ExtractAndInsertVerse } from "../application/use-cases/ExtractAndInsertVerse";
import type { FetchAndInsertTafsir, TafsirFormattingOptions } from "../application/use-cases/FetchAndInsertTafsir";
import type { LinkReflectionToVerses, ReflectionLinkOptions } from "../application/use-cases/LinkReflectionToVerses";
import type { LinkAyahsTogether } from "../application/use-cases/LinkAyahsTogether";
import type { RemoveQuranReference } from "../application/use-cases/RemoveQuranReference";
import type { SearchQuranVerses } from "../application/use-cases/SearchQuranVerses";
import type { StripTashkeel } from "../application/use-cases/StripTashkeel";

/**
 * The single object presentation code (commands, modals, the settings
 * tab) depends on. Built once in main.ts's composition root and rebuilt
 * (see `main.ts` `rebuildCoreServices`) whenever a setting that affects
 * parsing/formatting changes — presentation code never constructs a
 * concrete adapter or use case itself.
 */
export interface AppServices {
	app: App;
	settings: PluginConfig;
	repository: QuranRepository;
	ayahNotes: AyahNoteRepository;
	catalog: TafsirCatalog;
	reflectionCatalog: ReflectionCategoryCatalog;
	normalizer: ArabicNormalizer;
	useCases: {
		search: SearchQuranVerses;
		analyzeContext: AnalyzeLineContext;
		extract: ExtractAndInsertVerse;
		fetchTafsir: FetchAndInsertTafsir;
		removeReference: RemoveQuranReference;
		convertToFootnote: ConvertReferenceToFootnote;
		stripTashkeel: StripTashkeel;
		linkReflection: LinkReflectionToVerses;
		linkAyahsTogether: LinkAyahsTogether;
	};
	buildTafsirOptions: () => TafsirFormattingOptions;
	buildReflectionOptions: () => ReflectionLinkOptions;
	wrapEditor: (editor: Editor) => EditorPort;
	saveSettings: () => Promise<void>;
}

```

## commands\CommandRegistry.ts

```typescript
import type { Editor, MarkdownView, Plugin } from "obsidian";

/** One entry per command palette action. NFR-9: adding a feature is
 *  "write a new file exporting one of these, add it to the array in
 *  registerCommands.ts" — never a change to onload() itself. */
export interface CommandDefinition {
	id: string;
	name: string;
	run: (editor: Editor, view: MarkdownView) => void | Promise<void>;
}

export function registerCommands(plugin: Plugin, definitions: readonly CommandDefinition[]): void {
	for (const def of definitions) {
		plugin.addCommand({
			id: def.id,
			name: def.name,
			editorCallback: (editor, view) => {
				void def.run(editor, view as MarkdownView);
			},
		});
	}
}

```

## commands\definitions\convertToFootnote.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";

export function createConvertToFootnoteCommand(services: AppServices): CommandDefinition {
	return {
		id: "convert-reference-to-footnote",
		name: "Convert Quran reference to footnote",
		run: (editor) => {
			services.useCases.convertToFootnote.execute(services.wrapEditor(editor));
		},
	};
}
```

## commands\definitions\extractContext.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

/** FR-9..15: the plugin's primary "do the thing" command. */
export function createExtractContextCommand(services: AppServices): CommandDefinition {
	return {
		id: "extract-quran-context",
		name: "Extract Quran verse from context",
		run: (editor) => {
			const editorPort = services.wrapEditor(editor);
			const success = services.useCases.extract.execute(editorPort, (query, matches, start, end) => {
				new QuranSearchModal(services, editor, query, matches, start, end).open();
			});
			if (!success) {
				new QuranSearchModal(services, editor).open();
			}
		},
	};
}
```

## commands\definitions\fetchContextualTafsir.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { TafsirBookPickerModal } from "../../modals/TafsirBookPickerModal";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

/** FR-26 "current line" entry point: run context analysis first; only
 *  fall back to a manual picker if the line doesn't resolve to an ayah. */
export function createFetchContextualTafsirCommand(services: AppServices): CommandDefinition {
	return {
		id: "fetch-contextual-tafsir",
		name: "Fetch contextual tafsir for current line",
		run: async (editor) => {
			const editorPort = services.wrapEditor(editor);
			const cursor = editorPort.getCursor();
			const lineText = editorPort.getLine(cursor.line);
			const context = services.useCases.analyzeContext.execute(editorPort);

			if (context) {
				await services.useCases.fetchTafsir.execute(
					editorPort,
					lineText,
					cursor.line,
					context.surahId,
					context.surahName,
					context.startAyah,
					context.endAyah,
					services.buildTafsirOptions()
				);
				return;
			}

			new TafsirBookPickerModal(services.app, services, (chosenBooks) => {
				if (chosenBooks.length === 0) return;
				new QuranSearchModal(services, editor, "", null, null, null, async (ayahs) => {
					if (ayahs.length === 0) return;
					const first = ayahs[0];
					const last = ayahs[ayahs.length - 1];
					await services.useCases.fetchTafsir.execute(
						editorPort,
						lineText,
						cursor.line,
						first.surahId,
						first.surahName,
						first.ayahId,
						last.ayahId,
						services.buildTafsirOptions(),
						chosenBooks
					);
				}).open();
			}).open();
		},
	};
}
```

## commands\definitions\linkAyat.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { LinkAyatModal } from "../../modals/LinkAyatModal";

export function createLinkAyatCommand(services: AppServices): CommandDefinition {
	return {
		id: "link-ayat-together",
		name: "Link related ayahs",
		run: () => {
			new LinkAyatModal(services.app, services).open();
		},
	};
}

```

## commands\definitions\linkReflection.ts

```typescript
import { Notice } from "obsidian";
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { QuranSearchModal } from "../../modals/QuranSearchModal";
import { t } from "../../../config/strings";

/**
 * Shared by every reflection category's link command — registerCommands.ts
 * calls this factory once per builtin category id ("tadabbur", "athar"),
 * each producing its own independent command-palette entry, since the
 * linking mechanics are identical and only the target category differs.
 * A custom category added from Settings doesn't automatically get a
 * command (needs its own registerCommands.ts line + a reload) — a
 * reasonable v1 boundary, see QuranKeySettingsTab's reflection-category
 * section.
 */
export function createLinkReflectionCommand(services: AppServices, categoryId: string): CommandDefinition {
	const category = services.reflectionCatalog.byId(categoryId);

	return {
		id: `link-reflection-${categoryId}`,
		name: category ? `Log selection as ${category.name}` : `Log selection (${categoryId})`,
		run: (editor) => {
			const locale = services.settings.interfaceLanguage;
			const cat = services.reflectionCatalog.byId(categoryId);
			if (!cat) {
				new Notice(t(locale, "reflection.unknownCategory"));
				return;
			}

			const editorPort = services.wrapEditor(editor);
			const selectedText = editorPort.getSelection().trim();
			if (!selectedText) {
				new Notice(t(locale, "reflection.noSelection"));
				return;
			}
			const from = editorPort.getCursor("from");
			const to = editorPort.getCursor("to");

			const link = (surahId: number, surahName: string, startAyah: number, endAyah: number) =>
				services.useCases.linkReflection.execute(
					editorPort,
					from,
					to,
					selectedText,
					cat,
					surahId,
					surahName,
					startAyah,
					endAyah,
					services.buildReflectionOptions()
				);

			const detected = services.useCases.linkReflection.detectExistingCitation(selectedText);
			if (detected) {
				void link(detected.surahId, detected.surahName, detected.startAyah, detected.endAyah);
				return;
			}

			new QuranSearchModal(services, editor, "", null, null, null, async (ayahs) => {
				if (ayahs.length === 0) return;
				const first = ayahs[0];
				const last = ayahs[ayahs.length - 1];
				await link(first.surahId, first.surahName, first.ayahId, last.ayahId);
			}).open();
		},
	};
}
```

## commands\definitions\openGlobalSearch.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

export function createOpenGlobalSearchCommand(services: AppServices): CommandDefinition {
	return {
		id: "open-quran-global-search",
		name: "Open global Quran search modal",
		run: (editor) => {
			new QuranSearchModal(services, editor).open();
		},
	};
}
```

## commands\definitions\openGlobalTafsir.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";
import { TafsirBookPickerModal } from "../../modals/TafsirBookPickerModal";
import { QuranSearchModal } from "../../modals/QuranSearchModal";

/** FR-26 "global" entry point: pick books first, then pick verse(s) — via
 *  the current line's context if it resolves to one, otherwise via the
 *  search modal's override mode. */
export function createOpenGlobalTafsirCommand(services: AppServices): CommandDefinition {
	return {
		id: "open-tafsir-global-modal",
		name: "Open global tafsir selection modal",
		run: (editor) => {
			new TafsirBookPickerModal(services.app, services, (chosenBooks) => {
				if (chosenBooks.length === 0) return;
				const editorPort = services.wrapEditor(editor);
				const cursor = editorPort.getCursor();
				const lineText = editorPort.getLine(cursor.line);
				const context = services.useCases.analyzeContext.execute(editorPort);

				if (context) {
					void services.useCases.fetchTafsir.execute(
						editorPort,
						lineText,
						cursor.line,
						context.surahId,
						context.surahName,
						context.startAyah,
						context.endAyah,
						services.buildTafsirOptions(),
						chosenBooks
					);
					return;
				}

				new QuranSearchModal(services, editor, "", null, null, null, async (ayahs) => {
					if (ayahs.length === 0) return;
					const first = ayahs[0];
					const last = ayahs[ayahs.length - 1];
					await services.useCases.fetchTafsir.execute(
						editorPort,
						lineText,
						cursor.line,
						first.surahId,
						first.surahName,
						first.ayahId,
						last.ayahId,
						services.buildTafsirOptions(),
						chosenBooks
					);
				}).open();
			}).open();
		},
	};
}
```

## commands\definitions\removeReference.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";

export function createRemoveReferenceCommand(services: AppServices): CommandDefinition {
	return {
		id: "remove-quran-reference",
		name: "Remove Quran reference from line",
		run: (editor) => {
			services.useCases.removeReference.execute(services.wrapEditor(editor));
		},
	};
}
```

## commands\definitions\stripTashkeel.ts

```typescript
import type { CommandDefinition } from "../CommandRegistry";
import type { AppServices } from "../../AppServices";

export function createStripTashkeelCommand(services: AppServices): CommandDefinition {
	return {
		id: "strip-tashkeel-globally",
		name: "Strip tashkeel from selection or line",
		run: (editor) => {
			services.useCases.stripTashkeel.execute(services.wrapEditor(editor));
		},
	};
}
```

## commands\registerCommands.ts

```typescript
import type { Plugin } from "obsidian";
import type { AppServices } from "../AppServices";
import { registerCommands as register } from "./CommandRegistry";
import { createOpenGlobalSearchCommand } from "./definitions/openGlobalSearch";
import { createOpenGlobalTafsirCommand } from "./definitions/openGlobalTafsir";
import { createExtractContextCommand } from "./definitions/extractContext";
import { createFetchContextualTafsirCommand } from "./definitions/fetchContextualTafsir";
import { createRemoveReferenceCommand } from "./definitions/removeReference";
import { createConvertToFootnoteCommand } from "./definitions/convertToFootnote";
import { createStripTashkeelCommand } from "./definitions/stripTashkeel";
import { createLinkReflectionCommand } from "./definitions/linkReflection";
import { createLinkReflectionPickerCommand } from "./definitions/linkReflectionCategoryPicker";
import { createLinkAyatCommand } from "./definitions/linkAyat";

/** The plugin's full command inventory. To add a new command: write a
 *  `create*Command(services)` factory next to these (see
 *  docs/ARCHITECTURE.md §8) and add it to this array — nothing else
 *  changes.
 *
 *  Reflection categories are the one exception to "one line per command"
 *  above: every category in the catalog (builtin + custom, whatever
 *  exists at startup) gets its own command generated from the same
 *  factory, so a user can bind a hotkey directly to "Log selection as
 *  تدبرات الشيخ فلان" without that category needing a hardcoded line
 *  here. Categories created *after* startup (Settings, or the picker's
 *  "create new" flow) register their command immediately at creation
 *  time instead — see AppServices.registerReflectionCategoryCommand. */
export function registerAllCommands(plugin: Plugin, services: AppServices): void {
	register(plugin, [
		createOpenGlobalSearchCommand(services),
		createOpenGlobalTafsirCommand(services),
		createExtractContextCommand(services),
		createFetchContextualTafsirCommand(services),
		createRemoveReferenceCommand(services),
		createConvertToFootnoteCommand(services),
		createStripTashkeelCommand(services),
		...services.reflectionCatalog.all().map((cat) => createLinkReflectionCommand(services, cat.id)),
		createLinkReflectionPickerCommand(services),
		createLinkAyatCommand(services),
	]);
}
```

## components\AnalyticsDashboard.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";
import { AnalyticsCalculator } from "../../domain/services/AnalyticsCalculator";
import type { Locale } from "../../config/types";
import { t } from "../../config/strings";

export class AnalyticsDashboard {
	private readonly container: HTMLElement;
	private readonly totalEl: HTMLElement;
	private readonly mostQuotedEl: HTMLElement;
	private readonly densestEl: HTMLElement;
	private readonly locale: Locale;

	constructor(anchorEl: HTMLElement, locale: Locale) {
		this.locale = locale;
		this.container = createDiv({ cls: "quran-key-analytics-dashboard" });
		if (locale === "ar") this.container.setAttribute("dir", "rtl");

		const total = this.makeStat("analytics.total");
		const mostQuoted = this.makeStat("analytics.mostQuoted");
		const densest = this.makeStat("analytics.densest");
		this.container.append(total.wrap, mostQuoted.wrap, densest.wrap);
		this.totalEl = total.value;
		this.mostQuotedEl = mostQuoted.value;
		this.densestEl = densest.value;

		anchorEl.insertAdjacentElement("afterend", this.container);
	}

	private makeStat(labelKey: string): { wrap: HTMLElement; value: HTMLElement } {
		const wrap = createDiv({ cls: "quran-key-analytics-stat" });
		wrap.createSpan({ cls: "quran-key-analytics-label", text: t(this.locale, labelKey) });
		const value = wrap.createSpan({ cls: "quran-key-analytics-value", text: t(this.locale, "analytics.empty") });
		return { wrap, value };
	}

	update(matches: readonly Ayah[], corpus: readonly Ayah[]): void {
		const result = AnalyticsCalculator.compute(matches, corpus);
		const empty = t(this.locale, "analytics.empty");
		this.totalEl.setText(String(result.totalMatches));
		this.mostQuotedEl.setText(
			result.mostQuoted
				? `${result.mostQuoted.surahName} (${result.mostQuoted.count}, ${result.mostQuoted.densityPercent.toFixed(3)}%)`
				: empty
		);
		this.densestEl.setText(
			result.densest
				? `${result.densest.surahName} (${result.densest.densityPercent.toFixed(3)}%)`
				: empty
		);
	}

	destroy(): void {
		this.container.remove();
	}
}
```

## modals\highlightMatch.ts

```typescript
const TASHKEEL_FILLER = "[\\u064B-\\u065F\\u0670\\u06E6\\u06E5\\u06D6-\\u06DC\\u06DF-\\u06E8\\u06EA-\\u06ED\\s]*";

function escapeRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds a per-character regex fragment tolerant of common Arabic
 *  spelling variants (hamza forms, ya/hamza-ya, waw/hamza-waw, ta
 *  marbuta/ha), with optional tashkeel between characters. */
function buildTolerantCharPattern(word: string): string {
	let pattern = "";
	for (const char of word) {
		if (char === "\u0627") pattern += "[\u0627\u0623\u0625\u0622\u0671\u0621\u0649]";
		else if (char === "\u064A") pattern += "[\u064A\u0626]";
		else if (char === "\u0648") pattern += "[\u0648\u0624]";
		else if (char === "\u0647") pattern += "[\u0647\u0629]";
		else pattern += escapeRegex(char);
		pattern += TASHKEEL_FILLER;
	}
	return pattern;
}

/** Safely renders `text` into `containerEl` with matches highlighted using DOM elements (no innerHTML). */
export function renderHighlightedText(
	containerEl: HTMLElement,
	text: string,
	query: string,
	normalizeForSearch: (s: string) => string
): void {
	containerEl.empty();
	if (!query || query.trim().length === 0) {
		containerEl.setText(text);
		return;
	}

	const cleanWords = normalizeForSearch(query).split(/\s+/).filter((w) => w.length > 0);
	if (cleanWords.length === 0) {
		containerEl.setText(text);
		return;
	}

	const combined = cleanWords.map(buildTolerantCharPattern).join(`${TASHKEEL_FILLER}\\s+${TASHKEEL_FILLER}`);
	let rx: RegExp;
	try {
		rx = new RegExp(combined, "g");
	} catch {
		containerEl.setText(text);
		return;
	}

	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = rx.exec(text)) !== null) {
		if (match.index > lastIndex) {
			containerEl.appendText(text.slice(lastIndex, match.index));
		}
		containerEl.createSpan({ cls: "quran-key-highlight", text: match[0] });
		lastIndex = match.index + match[0].length;
		if (match[0].length === 0) rx.lastIndex++;
	}

	if (lastIndex < text.length) {
		containerEl.appendText(text.slice(lastIndex));
	}
}
```

## modals\LinkAyatModal.ts

```typescript
import { Modal } from "obsidian";
import type { App } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { AppServices } from "../AppServices";
import { t } from "../../config/strings";

/**
 * "Link ayat" command: pick 2+ ayahs (any surah, any count) that share
 * something — a repeated phrase, a theme, whatever the user has in mind —
 * and link them all together via LinkAyahsTogether. Deliberately modeled
 * on TafsirBookPickerModal (search box + checkbox list + keyboard nav +
 * explicit confirm) rather than QuranSearchModal, which is a SuggestModal
 * built to close on a *single* choice.
 */
export class LinkAyatModal extends Modal {
	private readonly selected = new Map<number, Ayah>(); // keyed by Ayah.id
	private activeIndex = 0;
	private filtered: Ayah[] = [];
	private listEl!: HTMLElement;
	private searchEl!: HTMLInputElement;
	private confirmBtn!: HTMLButtonElement;

	constructor(app: App, private readonly services: AppServices) {
		super(app);
	}

	private get locale() {
		return this.services.settings.interfaceLanguage;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("quran-key-picker-modal");

		contentEl.createEl("h2", { text: t(this.locale, "linkAyat.title") });

		this.searchEl = contentEl.createEl("input", { type: "text", placeholder: t(this.locale, "linkAyat.placeholder") });
		this.searchEl.focus();

		this.listEl = contentEl.createDiv({ cls: "quran-key-picker-list" });
		this.filtered = [];
		this.renderList();

		this.searchEl.addEventListener("input", () => {
			const query = this.searchEl.value.trim();
			this.filtered = query.length === 0 ? [] : this.services.useCases.search.execute(query).slice(0, this.services.settings.maxSuggestionResults);
			this.activeIndex = 0;
			this.renderList();
		});

		this.renderFooter(contentEl);

		this.modalEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key === "ArrowDown") {
					evt.preventDefault();
					if (this.filtered.length > 0) {
						this.activeIndex = (this.activeIndex + 1) % this.filtered.length;
						this.renderList();
					}
				} else if (evt.key === "ArrowUp") {
					evt.preventDefault();
					if (this.filtered.length > 0) {
						this.activeIndex = (this.activeIndex - 1 + this.filtered.length) % this.filtered.length;
						this.renderList();
					}
				} else if (evt.key === "Enter" && !evt.shiftKey) {
					evt.preventDefault();
					const ayah = this.filtered[this.activeIndex];
					if (ayah) this.toggle(ayah);
				} else if (evt.key === "Enter" && evt.shiftKey) {
					evt.preventDefault();
					this.submitAndClose();
				}
			},
			true
		);
	}

	private renderList(): void {
		this.listEl.empty();
		if (this.filtered.length === 0) {
			this.listEl.createDiv({ text: t(this.locale, "linkAyat.empty") });
			return;
		}
		this.filtered.forEach((ayah, idx) => {
			const isActive = idx === this.activeIndex;
			const isChecked = this.selected.has(ayah.id);
			const item = this.listEl.createDiv({ cls: `quran-key-picker-item${isActive ? " is-active" : ""}` });
			const right = item.createDiv({ cls: "quran-key-picker-item-right" });
			const checkbox = right.createEl("input", { type: "checkbox" });
			checkbox.checked = isChecked;
			right.createSpan({ text: ayah.text, cls: `quran-key-picker-item-name${isChecked ? " is-checked" : ""}` });
			item.createSpan({ text: `${ayah.surahName} ${ayah.ayahId}`, cls: "quran-key-modal-alias" });
			item.addEventListener("click", () => {
				this.activeIndex = idx;
				this.toggle(ayah);
				this.searchEl.focus(); // keep keyboard nav working after a mouse click — see TafsirBookPickerModal
			});
		});
	}

	private toggle(ayah: Ayah): void {
		if (this.selected.has(ayah.id)) this.selected.delete(ayah.id);
		else this.selected.set(ayah.id, ayah);
		this.renderList();
		this.updateConfirmState();
		this.renderSelectedSummary();
	}

	private selectedSummaryEl?: HTMLElement;

	private renderSelectedSummary(): void {
		if (!this.selectedSummaryEl) return;
		this.selectedSummaryEl.empty();
		if (this.selected.size === 0) return;
		this.selectedSummaryEl.createSpan({ text: t(this.locale, "linkAyat.selectedPrefix") });
		for (const ayah of this.selected.values()) {
			this.selectedSummaryEl.createSpan({ text: ` ${ayah.surahName} ${ayah.ayahId} ·`, cls: "quran-key-modal-alias" });
		}
	}

	private renderFooter(containerEl: HTMLElement): void {
		this.selectedSummaryEl = containerEl.createDiv({ cls: "quran-key-picker-hint" });
		const footer = containerEl.createDiv({ cls: "quran-key-picker-footer" });
		footer.createSpan({ text: t(this.locale, "linkAyat.hint"), cls: "quran-key-picker-hint" });
		this.confirmBtn = footer.createEl("button", { text: t(this.locale, "linkAyat.confirm"), cls: "mod-cta" });
		this.confirmBtn.addEventListener("click", () => this.submitAndClose());
		this.updateConfirmState();
	}

	private updateConfirmState(): void {
		if (!this.confirmBtn) return;
		// Needs 2+, not 1+ — linking a single ayah to nothing is a no-op (LinkAyahsTogether.execute short-circuits on this too).
		this.confirmBtn.disabled = this.selected.size < 2;
	}

	private async submitAndClose(): Promise<void> {
		if (this.selected.size < 2) return;
		const ayahs = Array.from(this.selected.values());
		this.close();
		await this.services.useCases.linkAyahsTogether.execute(
			ayahs,
			this.services.settings.reflectionFileNameTemplate,
			this.services.settings.includeAyahTextInReflectionNote,
			{
				wrapperStart: this.services.settings.wrapperStart,
				wrapperEnd: this.services.settings.wrapperEnd,
				useOrnateNumbers: this.services.settings.useOrnateNumbers,
				stripTashkeelOnOutput: this.services.settings.stripTashkeel,
			}
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

```

## modals\QuranSearchModal.ts

```typescript
import { SuggestModal } from "obsidian";
import type { Editor, EditorPosition as ObsidianEditorPosition } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { EditorPosition } from "../../domain/ports/EditorPort";
import type { AppServices } from "../AppServices";
import { AnalyticsDashboard } from "../components/AnalyticsDashboard";
import { renderHighlightedText } from "./highlightMatch";
import { TafsirBookPickerModal } from "./TafsirBookPickerModal";
import { RangeEndSuggestModal } from "./RangeEndSuggestModal";
import type { VerseSelectHandler } from "./types";
import { t } from "../../config/strings";

function toPosition(pos: ObsidianEditorPosition): EditorPosition {
	return { line: pos.line, ch: pos.ch };
}

export class QuranSearchModal extends SuggestModal<Ayah> {
	private currentQuery = "";
	private dashboard: AnalyticsDashboard | null = null;

	constructor(
		private readonly services: AppServices,
		private readonly editor: Editor,
		private readonly initialQuery: string = "",
		private readonly preFilteredMatches: Ayah[] | null = null,
		private readonly startPos: EditorPosition | null = null,
		private readonly endPos: EditorPosition | null = null,
		private readonly onVerseSelectOverride?: VerseSelectHandler
	) {
		super(services.app);
		this.setPlaceholder(t(services.settings.interfaceLanguage, "search.placeholder"));
	}

	onOpen(): void {
		void super.onOpen();
		const { settings } = this.services;

		if (settings.showAnalytics) {
			const inputContainer = this.inputEl.parentElement;
			if (inputContainer) this.dashboard = new AnalyticsDashboard(inputContainer, settings.interfaceLanguage);
		}

		this.inputEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key !== "Enter") return;
				const isCtrlOrMeta = evt.ctrlKey || evt.metaKey;
				const isShift = evt.shiftKey;
				if (!isCtrlOrMeta && !isShift) return;
				evt.preventDefault();
				evt.stopPropagation();
				this.handleModifiedEnter(isCtrlOrMeta);
			},
			true
		);

		if (this.initialQuery) {
			this.inputEl.value = this.initialQuery;
			this.currentQuery = this.initialQuery;
			window.setTimeout(() => this.inputEl.dispatchEvent(new Event("input")), 50);
		}
	}

	onClose(): void {
		this.dashboard?.destroy();
	}

	private handleModifiedEnter(isRangeRequest: boolean): void {
		const suggestions = this.getSuggestions(this.inputEl.value);
		if (suggestions.length === 0) return;

		const activeEl = this.containerEl.querySelector(".suggestion-item.is-selected");
		let target = suggestions[0];
		if (activeEl) {
			const allItems = Array.from(this.containerEl.querySelectorAll(".suggestion-item"));
			const idx = allItems.indexOf(activeEl);
			if (idx !== -1 && suggestions[idx]) target = suggestions[idx];
		}

		const start = this.startPos ?? toPosition(this.editor.getCursor("from"));
		const end = this.endPos ?? toPosition(this.editor.getCursor("to"));
		this.close();

		if (isRangeRequest) {
			new RangeEndSuggestModal(this.services, this.editor, target, start, end, this.onVerseSelectOverride).open();
			return;
		}

		if (this.onVerseSelectOverride) {
			void this.onVerseSelectOverride([target]);
		} else {
			this.openTafsirFlow(target, target);
		}
	}

	private openTafsirFlow(startAyah: Ayah, endAyah: Ayah): void {
		new TafsirBookPickerModal(this.services.app, this.services, (chosenBooks) => {
			if (chosenBooks.length === 0) return;
			const editorPort = this.services.wrapEditor(this.editor);
			const cursor = editorPort.getCursor();
			void this.services.useCases.fetchTafsir.execute(
				editorPort,
				editorPort.getLine(cursor.line),
				cursor.line,
				startAyah.surahId,
				startAyah.surahName,
				startAyah.ayahId,
				endAyah.ayahId,
				this.services.buildTafsirOptions(),
				chosenBooks
			);
		}).open();
	}

	getSuggestions(query: string): Ayah[] {
		this.currentQuery = query;
		const { normalizer } = this.services;
		const cleanQuery = normalizer.normalizeForSearch(query);
		const cleanInitial = this.initialQuery ? normalizer.normalizeForSearch(this.initialQuery) : "";
		const usePreFiltered =
			Boolean(this.preFilteredMatches) &&
			cleanQuery.length > 0 &&
			(cleanQuery.includes(cleanInitial) || cleanInitial.includes(cleanQuery));
		const pool = usePreFiltered && this.preFilteredMatches ? this.preFilteredMatches : undefined;

		const matches = this.services.useCases.search.execute(query, pool);
		if (this.dashboard) this.dashboard.update(matches, this.services.repository.getAllAyahs());
		return matches;
	}

	renderSuggestion(item: Ayah, el: HTMLElement): void {
		const textEl = el.createDiv({ cls: "quran-key-suggestion-text" });
		renderHighlightedText(textEl, item.text, this.currentQuery, (s) => this.services.normalizer.normalizeForSearch(s));
		el.createEl("small", {
			text: `${item.surahName} - \u0627\u0644\u0622\u064A\u0629 ${item.ayahId}`,
			cls: "quran-key-suggestion-meta",
		});
	}

	onChooseSuggestion(item: Ayah): void {
		const start = this.startPos ?? toPosition(this.editor.getCursor("from"));
		const end = this.endPos ?? toPosition(this.editor.getCursor("to"));
		if (this.onVerseSelectOverride) {
			void this.onVerseSelectOverride([item]);
			return;
		}
		this.services.useCases.extract.insertAyahs(this.services.wrapEditor(this.editor), start, end, [item], this.currentQuery);
	}
}
```

## modals\RangeEndSuggestModal.ts

```typescript
import { SuggestModal } from "obsidian";
import type { Editor } from "obsidian";
import type { Ayah } from "../../domain/entities/Ayah";
import type { EditorPosition } from "../../domain/ports/EditorPort";
import type { AppServices } from "../AppServices";
import { TafsirBookPickerModal } from "./TafsirBookPickerModal";
import type { VerseSelectHandler } from "./types";
import { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import { t } from "../../config/strings";

export class RangeEndSuggestModal extends SuggestModal<Ayah> {
	constructor(
		private readonly services: AppServices,
		private readonly editor: Editor,
		private readonly startAyah: Ayah,
		private readonly startPos: EditorPosition,
		private readonly endPos: EditorPosition,
		private readonly onVerseSelectOverride?: VerseSelectHandler
	) {
		super(services.app);
		const locale = services.settings.interfaceLanguage;
		this.setPlaceholder(
			`${t(locale, "rangeEnd.placeholderPrefix")} ${startAyah.surahName} (${t(locale, "rangeEnd.placeholderSuffix")} ${startAyah.ayahId})`
		);
	}

	onOpen(): void {
		void super.onOpen();
		this.inputEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key !== "Enter" || !evt.shiftKey) return;
				evt.preventDefault();
				evt.stopPropagation();

				const suggestions = this.getSuggestions(this.inputEl.value);
				if (suggestions.length === 0) return;
				const activeEl = this.containerEl.querySelector(".suggestion-item.is-selected");
				let endAyah = suggestions[0];
				if (activeEl) {
					const allItems = Array.from(this.containerEl.querySelectorAll(".suggestion-item"));
					const idx = allItems.indexOf(activeEl);
					if (idx !== -1 && suggestions[idx]) endAyah = suggestions[idx];
				}
				const rangeAyahs = this.buildRange(endAyah);
				this.close();

				if (this.onVerseSelectOverride) {
					void this.onVerseSelectOverride(rangeAyahs);
					return;
				}
				this.openTafsirFlow(rangeAyahs);
			},
			true
		);
	}

	private buildRange(endAyah: Ayah): Ayah[] {
		return this.services.repository
			.getAllAyahs()
			.filter(
				(a) => a.surahId === this.startAyah.surahId && a.ayahId >= this.startAyah.ayahId && a.ayahId <= endAyah.ayahId
			);
	}

	private openTafsirFlow(rangeAyahs: Ayah[]): void {
		if (rangeAyahs.length === 0) return;
		new TafsirBookPickerModal(this.services.app, this.services, (chosenBooks) => {
			if (chosenBooks.length === 0) return;
			const editorPort = this.services.wrapEditor(this.editor);
			const cursor = editorPort.getCursor();
			const first = rangeAyahs[0];
			const last = rangeAyahs[rangeAyahs.length - 1];
			void this.services.useCases.fetchTafsir.execute(
				editorPort,
				editorPort.getLine(cursor.line),
				cursor.line,
				first.surahId,
				first.surahName,
				first.ayahId,
				last.ayahId,
				this.services.buildTafsirOptions(),
				chosenBooks
			);
		}).open();
	}

	getSuggestions(query: string): Ayah[] {
		const pool = this.services.repository
			.getAllAyahs()
			.filter((a) => a.surahId === this.startAyah.surahId && a.ayahId >= this.startAyah.ayahId);
		if (!query || query.trim() === "") return pool.slice(0, this.services.settings.maxSuggestionResults);

		const cleanQuery = this.services.normalizer.normalizeForSearch(query);
		const numericQuery = ArabicNormalizer.normalizeNumbers(query);
		return pool
			.filter(
				(a) =>
					a.ayahId.toString().includes(numericQuery) ||
					this.services.normalizer.normalizeForSearch(a.text).includes(cleanQuery)
			)
			.slice(0, this.services.settings.maxSuggestionResults);
	}

	renderSuggestion(item: Ayah, el: HTMLElement): void {
		const textEl = el.createDiv({ cls: "quran-key-suggestion-text" });
		textEl.setText(item.text);
		el.createEl("small", { text: `\u0627\u0644\u0622\u064A\u0629 ${item.ayahId}`, cls: "quran-key-suggestion-meta" });
	}

	onChooseSuggestion(endAyah: Ayah): void {
		const rangeAyahs = this.buildRange(endAyah);
		if (this.onVerseSelectOverride) {
			void this.onVerseSelectOverride(rangeAyahs);
			return;
		}
		this.services.useCases.extract.insertAyahs(this.services.wrapEditor(this.editor), this.startPos, this.endPos, rangeAyahs, "");
	}
}
```

## modals\TafsirBookPickerModal.ts

```typescript
import { Modal, Setting } from "obsidian";
import type { App, TextComponent } from "obsidian";
import type { TafsirBook } from "../../domain/entities/TafsirBook";
import type { AppServices } from "../AppServices";
import { t } from "../../config/strings";

export class TafsirBookPickerModal extends Modal {
	private readonly selected = new Set<string>();
	private activeIndex = 0;
	private filtered: TafsirBook[];
	private listEl!: HTMLElement;
	private searchEl!: HTMLInputElement;
	private confirmBtn!: HTMLButtonElement;

	constructor(
		app: App,
		private readonly services: AppServices,
		private readonly onSubmit: (books: TafsirBook[]) => void
	) {
		super(app);
		this.filtered = [...this.services.catalog.all()];
	}

	private get locale() {
		return this.services.settings.interfaceLanguage;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("quran-key-picker-modal");

		contentEl.createEl("h2", { text: t(this.locale, "tafsir.pickerTitle") });

		this.searchEl = contentEl.createEl("input", {
			type: "text",
			placeholder: t(this.locale, "tafsir.pickerPlaceholder"),
		});
		this.searchEl.focus();

		this.listEl = contentEl.createDiv({ cls: "quran-key-picker-list" });
		this.renderList();

		this.searchEl.addEventListener("input", () => {
			this.filtered = this.services.catalog.search(this.searchEl.value);
			this.activeIndex = 0;
			this.renderList();
		});

		this.renderAddSourceForm(contentEl);
		this.renderFooter(contentEl);

		this.modalEl.addEventListener(
			"keydown",
			(evt) => {
				if (evt.key === "ArrowDown") {
					evt.preventDefault();
					if (this.filtered.length > 0) {
						this.activeIndex = (this.activeIndex + 1) % this.filtered.length;
						this.renderList();
					}
				} else if (evt.key === "ArrowUp") {
					evt.preventDefault();
					if (this.filtered.length > 0) {
						this.activeIndex = (this.activeIndex - 1 + this.filtered.length) % this.filtered.length;
						this.renderList();
					}
				} else if (evt.key === "Enter" && !evt.shiftKey) {
					evt.preventDefault();
					const book = this.filtered[this.activeIndex];
					if (book) this.toggle(book.id);
				} else if (evt.key === "Enter" && evt.shiftKey) {
					evt.preventDefault();
					this.submitAndClose();
				}
			},
			true
		);
	}

	private renderList(): void {
		this.listEl.empty();
		if (this.filtered.length === 0) {
			this.listEl.createDiv({ text: t(this.locale, "tafsir.pickerEmpty") });
			return;
		}
		this.filtered.forEach((book, idx) => {
			const isActive = idx === this.activeIndex;
			const isChecked = this.selected.has(book.id);
			const item = this.listEl.createDiv({ cls: `quran-key-picker-item${isActive ? " is-active" : ""}` });
			const right = item.createDiv({ cls: "quran-key-picker-item-right" });
			const checkbox = right.createEl("input", { type: "checkbox" });
			checkbox.checked = isChecked;
			right.createSpan({
				text: book.name,
				cls: `quran-key-picker-item-name${isChecked ? " is-checked" : ""}`,
			});
			if (book.aliases.length > 0) {
				item.createSpan({ text: book.aliases.join("\u060C "), cls: "quran-key-modal-alias" });
			}
			item.addEventListener("click", () => {
				this.activeIndex = idx;
				this.toggle(book.id);
				// `renderList()` (called from `toggle()`) empties and rebuilds every
				// list item, including whichever one the browser had just focused
				// via this click — the old node is gone, so focus silently falls
				// back to <body>. Since the keydown listener below is registered on
				// `modalEl` with `capture: true`, it only fires for descendants of
				// the *focused* element; once focus is on <body> (an ancestor of
				// modalEl, not a descendant), the listener is out of the event path
				// entirely and arrow keys fall through to the browser's default
				// (scrolling) instead of moving `activeIndex`. Re-focusing a stable
				// element inside the modal after every click keeps it fixed.
				this.searchEl.focus();
			});
		});
	}

	private toggle(bookId: string): void {
		if (this.selected.has(bookId)) this.selected.delete(bookId);
		else this.selected.add(bookId);
		this.renderList();
		this.updateConfirmState();
	}

	private renderAddSourceForm(containerEl: HTMLElement): void {
		const details = containerEl.createEl("details", { cls: "quran-key-picker-add-source" });
		details.createEl("summary", { text: t(this.locale, "tafsir.addSourceTitle") });
		const body = details.createDiv();

		let nameInput!: TextComponent;
		let aliasesInput!: TextComponent;
		let urlInput!: TextComponent;

		new Setting(body)
			.setName(t(this.locale, "tafsir.addSourceNamePlaceholder"))
			.addText((tx) => {
				nameInput = tx;
			});

		new Setting(body)
			.setName(t(this.locale, "tafsir.addSourceAliasesPlaceholder"))
			.addText((tx) => {
				aliasesInput = tx;
			});

		new Setting(body)
			.setName(t(this.locale, "tafsir.addSourceUrlPlaceholder"))
			.addText((tx) => {
				urlInput = tx;
			});

		new Setting(body).addButton((btn) =>
			btn
				.setButtonText(t(this.locale, "tafsir.addSourceButton"))
				.setCta()
				.onClick(async () => {
					const addedId = await this.addCustomSource(nameInput.getValue(), aliasesInput.getValue(), urlInput.getValue());
					if (addedId) {
						nameInput.setValue("");
						aliasesInput.setValue("");
						urlInput.setValue("");
					}
				})
		);
	}

	private async addCustomSource(name: string, aliasesRaw: string, urlTemplate: string): Promise<string | null> {
		if (!name.trim() || !urlTemplate.trim()) return null;
		const id = `custom-${name
			.trim()
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9\u0600-\u06ff-]/g, "")}-${Date.now().toString(36)}`;

		this.services.settings.customTafsirBooks = [
			...this.services.settings.customTafsirBooks,
			{
				id,
				name: name.trim(),
				aliases: aliasesRaw
					.split(",")
					.map((a) => a.trim())
					.filter(Boolean),
				urlTemplate: urlTemplate.trim(),
				isBuiltin: false,
			},
		];

		await this.services.saveSettings();

		this.selected.add(id);
		this.filtered = this.services.catalog.search(this.searchEl.value);
		this.renderList();
		this.updateConfirmState();
		return id;
	}

	private renderFooter(containerEl: HTMLElement): void {
		const footer = containerEl.createDiv({ cls: "quran-key-picker-footer" });
		footer.createSpan({ text: t(this.locale, "tafsir.pickerHint"), cls: "quran-key-picker-hint" });
		this.confirmBtn = footer.createEl("button", {
			text: t(this.locale, "tafsir.pickerConfirm"),
			cls: "mod-cta",
		});
		this.confirmBtn.addEventListener("click", () => this.submitAndClose());
		this.updateConfirmState();
	}

	private updateConfirmState(): void {
		if (!this.confirmBtn) return;
		this.confirmBtn.disabled = this.selected.size === 0;
	}

	private submitAndClose(): void {
		if (this.selected.size === 0) return;
		const chosen = this.services.catalog.all().filter((b) => this.selected.has(b.id));
		this.close();
		this.onSubmit(chosen);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

```

## modals\types.ts

```typescript
import type { Ayah } from "../../domain/entities/Ayah";

/** Callback used when a search/range-end modal is opened in "pick a verse
 *  for tafsir" mode instead of its default "insert a verse" mode — see
 *  QuranSearchModal's doc comment. */
export type VerseSelectHandler = (ayahs: Ayah[]) => void | Promise<void>;

```

## settings\QuranKeySettingsTab.ts

```typescript
import { PluginSettingTab, Setting } from "obsidian";
import type { App, Plugin } from "obsidian";
import type { CategoryOrganizationMode, Locale, TafsirResolutionStrategy } from "../../config/types";
import type { AppServices } from "../AppServices";
import { SETTINGS_SCHEMA, type SettingFieldDefinition } from "./SettingsSchema";

const RESOLUTION_LABELS: Record<TafsirResolutionStrategy, Record<Locale, string>> = {
	explicit: { ar: "اختيار صريح من قائمة", en: "Explicit picker choice" },
	lineAliases: { ar: "أسماء مذكورة في السطر", en: "Names mentioned on the line" },
	favorites: { ar: "الكتب المفضلة", en: "Favorite books" },
	default: { ar: "الكتاب الافتراضي", en: "Default book" },
};

export class QuranKeySettingsTab extends PluginSettingTab {
	constructor(app: App, plugin: Plugin, private readonly services: AppServices) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const locale = this.services.settings.interfaceLanguage;

		for (const section of SETTINGS_SCHEMA) {
			new Setting(containerEl).setName(section.heading[locale]).setHeading();
			for (const field of section.fields) this.renderField(containerEl, field, locale);
		}

		new Setting(containerEl).setName(locale === "ar" ? "تخصيص كتب التفسير" : "Tafsir book options").setHeading();
		this.renderDefaultTafsirBook(containerEl, locale);
		this.renderFavorites(containerEl, locale);
		this.renderCustomBooks(containerEl, locale);
		this.renderResolutionOrder(containerEl, locale);

		new Setting(containerEl).setName(locale === "ar" ? "تصنيفات الملاحظات" : "Note categories").setHeading();
		this.renderReflectionCategories(containerEl, locale);

		new Setting(containerEl).setName(locale === "ar" ? "قواعد التطبيع" : "Normalization").setHeading();
		this.renderNormalizationRules(containerEl, locale);

		new Setting(containerEl).setName(locale === "ar" ? "إعدادات متقدمة" : "Advanced").setHeading();
		this.renderAdvancedTunables(containerEl, locale);
	}

	private async save(): Promise<void> {
		await this.services.saveSettings();
	}

	private renderField(containerEl: HTMLElement, field: SettingFieldDefinition, locale: Locale): void {
		const settings = this.services.settings as unknown as Record<string, unknown>;
		const setting = new Setting(containerEl).setName(field.label[locale]).setDesc(field.description[locale]);

		switch (field.type) {
			case "toggle":
				setting.addToggle((toggle) =>
					toggle.setValue(Boolean(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					})
				);
				break;
			case "text":
				setting.addText((text) =>
					text.setValue(String(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					})
				);
				break;
			case "textarea":
				setting.addTextArea((textarea) => {
					textarea.setValue(String(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					});
					textarea.inputEl.rows = 6;
					textarea.inputEl.addClass("quran-key-settings-textarea");
				});
				break;
			case "dropdown":
				setting.addDropdown((dropdown) => {
					for (const opt of field.dropdownOptions ?? []) dropdown.addOption(opt.value, opt.label);
					dropdown.setValue(String(settings[field.key]));
					dropdown.onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					});
				});
				break;
			case "slider":
				setting.addSlider((slider) => {
					const { min, max, step } = field.slider ?? { min: 0, max: 1, step: 0.1 };
					slider
						.setLimits(min, max, step)
						.setValue(Number(settings[field.key]))
						.onChange(async (value) => {
							settings[field.key] = value;
							await this.save();
						});
				});
				break;
			case "color":
				setting.addColorPicker((picker) =>
					picker.setValue(String(settings[field.key])).onChange(async (value) => {
						settings[field.key] = value;
						await this.save();
					})
				);
				break;
		}
	}

	private renderDefaultTafsirBook(containerEl: HTMLElement, locale: Locale): void {
		new Setting(containerEl)
			.setName(locale === "ar" ? "الكتاب الافتراضي" : "Default tafsir book")
			.setDesc(
				locale === "ar"
					? "يُستخدم إذا لم تُحلّ أي خطوة أعلاه في ترتيب الأولوية أدناه."
					: "Used when no earlier step in the resolution order below resolves."
			)
			.addDropdown((dropdown) => {
				for (const book of this.services.catalog.all()) dropdown.addOption(book.id, book.name);
				dropdown.setValue(this.services.settings.defaultTafsirBookId);
				dropdown.onChange(async (value) => {
					this.services.settings.defaultTafsirBookId = value;
					await this.save();
				});
			});
	}

	private renderFavorites(containerEl: HTMLElement, locale: Locale): void {
		const section = containerEl.createEl("details");
		section.createEl("summary", { text: locale === "ar" ? "كتب التفسير المفضلة" : "Favorite tafsir books" });
		const list = section.createDiv();
		for (const book of this.services.catalog.all()) {
			new Setting(list).setName(book.name).addToggle((toggle) =>
				toggle.setValue(this.services.settings.favoriteBooksIds.includes(book.id)).onChange(async (value) => {
					const set = new Set(this.services.settings.favoriteBooksIds);
					if (value) set.add(book.id);
					else set.delete(book.id);
					this.services.settings.favoriteBooksIds = Array.from(set);
					await this.save();
				})
			);
		}
	}

	private renderCustomBooks(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv();
		const renderList = () => {
			list.empty();
			for (const book of this.services.settings.customTafsirBooks) {
				new Setting(list)
					.setName(book.name)
					.setDesc(book.urlTemplate)
					.addExtraButton((btn) =>
						btn.setIcon("trash").onClick(async () => {
							this.services.settings.customTafsirBooks = this.services.settings.customTafsirBooks.filter(
								(b) => b.id !== book.id
							);
							await this.save();
							renderList();
						})
					);
			}
		};
		renderList();

		let newId = "";
		let newName = "";
		let newAliases = "";
		let newUrl = "";
		new Setting(containerEl)
			.setName(locale === "ar" ? "إضافة مصدر تفسير جديد" : "Add a new tafsir source")
			.setDesc(
				locale === "ar"
					? "استخدم {bookId} و{surahId} و{ayahId} داخل الرابط — يتم استبدالها تلقائياً عند الجلب."
					: "Use {bookId}, {surahId}, {ayahId} inside the URL — substituted automatically at fetch time."
			)
			.addText((t) => t.setPlaceholder("id").onChange((v) => (newId = v)))
			.addText((t) => t.setPlaceholder(locale === "ar" ? "الاسم" : "Name").onChange((v) => (newName = v)))
			.addText((t) =>
				t.setPlaceholder(locale === "ar" ? "أسماء بديلة، مفصولة بفواصل" : "aliases, comma-separated").onChange((v) => (newAliases = v))
			)
			.addText((t) => t.setPlaceholder("https://example.com/tafsir?src={bookId}&s={surahId}&a={ayahId}").onChange((v) => (newUrl = v)))
			.addButton((btn) =>
				btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
					if (!newId.trim() || !newName.trim() || !newUrl.trim()) return;
					this.services.settings.customTafsirBooks = [
						...this.services.settings.customTafsirBooks,
						{
							id: newId.trim(),
							name: newName.trim(),
							aliases: newAliases
								.split(",")
								.map((a) => a.trim())
								.filter(Boolean),
							urlTemplate: newUrl.trim(),
							isBuiltin: false,
						},
					];
					await this.save();
					this.display();
				})
			);
	}

	private renderResolutionOrder(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv();
		const renderList = () => {
			list.empty();
			const order = this.services.settings.tafsirBookResolutionOrder;
			order.forEach((strategy, idx) => {
				const row = new Setting(list).setName(`${idx + 1}. ${RESOLUTION_LABELS[strategy]?.[locale] ?? strategy}`);
				row.addExtraButton((btn) =>
					btn
						.setIcon("arrow-up")
						.setDisabled(idx === 0)
						.onClick(async () => {
							const next = [...order];
							[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
							this.services.settings.tafsirBookResolutionOrder = next;
							await this.save();
							renderList();
						})
				);
				row.addExtraButton((btn) =>
					btn
						.setIcon("arrow-down")
						.setDisabled(idx === order.length - 1)
						.onClick(async () => {
							const next = [...order];
							[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
							this.services.settings.tafsirBookResolutionOrder = next;
							await this.save();
							renderList();
						})
				);
			});
		};
		renderList();
	}

	/** Each category is (id, name, organizationMode, heading level+text,
	 *  parent category, folder — the last relevant only for "ownFolder").
	 *  تدبر/أثر are builtin (not deletable, but every other field —
	 *  including organizationMode — is still editable: a user who wants
	 *  تدبر to live in its own folder can flip it here). */
	private renderReflectionCategories(containerEl: HTMLElement, locale: Locale): void {
		const list = containerEl.createDiv();
		const allCategories = () => [...this.services.reflectionCatalog.all()];

		const patchCategory = (id: string, patch: Partial<(typeof this.services.settings.customReflectionCategories)[number]>) => {
			const builtin = allCategories().find((c) => c.id === id && c.isBuiltin);
			const custom = this.services.settings.customReflectionCategories;
			const idx = custom.findIndex((c) => c.id === id);
			if (idx !== -1) {
				const next = [...custom];
				next[idx] = { ...next[idx], ...patch };
				this.services.settings.customReflectionCategories = next;
			} else if (builtin) {
				// First edit of a builtin category — record it as a custom
				// override, same override convention as TafsirCatalog (NFR-1).
				this.services.settings.customReflectionCategories = [...custom, { ...builtin, ...patch }];
			}
		};

		const renderList = () => {
			list.empty();
			for (const cat of allCategories()) {
				const details = list.createEl("details", { cls: "quran-key-picker-add-source" });
				details.createEl("summary", { text: `${cat.name}${cat.isBuiltin ? " " + (locale === "ar" ? "(أساسي)" : "(builtin)") : ""}` });
				const body = details.createDiv();

				new Setting(body)
					.setName(locale === "ar" ? "الاسم" : "Name")
					.addText((tx) =>
						tx.setValue(cat.name).onChange(async (v) => {
							patchCategory(cat.id, { name: v });
							await this.save();
						})
					);

				new Setting(body)
					.setName(locale === "ar" ? "مكان التدوين" : "Organization")
					.setDesc(
						locale === "ar"
							? "موحّد: يُكتب تحت عنوان داخل ملاحظة الآية الواحدة. مجلد مستقل: ملف خاص بهذا التصنيف لكل آية."
							: "Unified: written under a heading inside the ayah's single note. Own folder: a dedicated per-ayah file for this category."
					)
					.addDropdown((dd) => {
						dd.addOption("unified", locale === "ar" ? "موحّد" : "unified");
						dd.addOption("ownFolder", locale === "ar" ? "مجلد مستقل" : "ownFolder");
						dd.setValue(cat.organizationMode);
						dd.onChange(async (v) => {
							patchCategory(cat.id, { organizationMode: v as CategoryOrganizationMode });
							await this.save();
						});
					});

				new Setting(body)
					.setName(locale === "ar" ? "نص العنوان" : "Heading text")
					.addText((tx) =>
						tx.setValue(cat.headingText).onChange(async (v) => {
							patchCategory(cat.id, { headingText: v });
							await this.save();
						})
					);

				new Setting(body)
					.setName(locale === "ar" ? "مستوى العنوان" : "Heading level")
					.setDesc(locale === "ar" ? "مثل ### — نص حر." : "e.g. ### — free text.")
					.addText((tx) =>
						tx.setValue(cat.headingLevel).onChange(async (v) => {
							patchCategory(cat.id, { headingLevel: v });
							await this.save();
						})
					);

				new Setting(body)
					.setName(locale === "ar" ? "تصنيف أب (اختياري)" : "Parent category (optional)")
					.setDesc(
						locale === "ar"
							? "يُستخدم مرة واحدة فقط، عند إنشاء العنوان لأول مرة، لتضمينه تحت عنوان الأب."
							: "Consulted only once, when this heading is first created, to nest it under the parent's."
					)
					.addDropdown((dd) => {
						dd.addOption("", locale === "ar" ? "بلا" : "none");
						for (const other of allCategories()) {
							if (other.id === cat.id) continue;
							dd.addOption(other.id, other.name);
						}
						dd.setValue(cat.parentCategoryId ?? "");
						dd.onChange(async (v) => {
							patchCategory(cat.id, { parentCategoryId: v || null });
							await this.save();
						});
					});

				new Setting(body)
					.setName(locale === "ar" ? "المجلد (لوضع «مجلد مستقل» فقط)" : "Folder (only used in \"ownFolder\" mode)")
					.addText((tx) =>
						tx.setValue(cat.folder).onChange(async (v) => {
							patchCategory(cat.id, { folder: v });
							await this.save();
						})
					);

				if (!cat.isBuiltin) {
					new Setting(body).addExtraButton((btn) =>
						btn.setIcon("trash").onClick(async () => {
							this.services.settings.customReflectionCategories = this.services.settings.customReflectionCategories.filter(
								(c) => c.id !== cat.id
							);
							await this.save();
							renderList();
						})
					);
				}
			}
		};
		renderList();

		let newId = "";
		let newName = "";
		new Setting(containerEl)
			.setName(locale === "ar" ? "إضافة تصنيف جديد" : "Add a new category")
			.setDesc(
				locale === "ar"
					? "مثال: «فوائد عملية». بعد الإضافة، اضبط مكان التدوين والعنوان من القائمة أعلاه."
					: 'e.g. "Practical benefits". After adding, configure its organization and heading above.'
			)
			.addText((t) => t.setPlaceholder("id").onChange((v) => (newId = v)))
			.addText((t) => t.setPlaceholder(locale === "ar" ? "الاسم" : "Name").onChange((v) => (newName = v)))
			.addButton((btn) =>
				btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
					if (!newId.trim() || !newName.trim()) return;
					this.services.settings.customReflectionCategories = [
						...this.services.settings.customReflectionCategories,
						{
							id: newId.trim(),
							name: newName.trim(),
							organizationMode: "unified",
							headingText: newName.trim(),
							headingLevel: "###",
							parentCategoryId: null,
							folder: "",
							isBuiltin: false,
						},
					];
					await this.save();
					renderList();
				})
			);
	}

	private renderNormalizationRules(containerEl: HTMLElement, locale: Locale): void {
		const details = containerEl.createEl("details");
		details.createEl("summary", { text: locale === "ar" ? "قواعد تطبيع النص العربي" : "Arabic normalization rules" });
		const list = details.createDiv();
		const renderList = () => {
			list.empty();
			this.services.settings.normalizationRules.forEach((rule, idx) => {
				const row = new Setting(list).setName(rule.description || rule.id).setDesc(`${rule.pattern} -> ${rule.replacement}`);
				row.addToggle((toggle) =>
					toggle.setValue(rule.enabled).onChange(async (value) => {
						const rules = [...this.services.settings.normalizationRules];
						rules[idx] = { ...rules[idx], enabled: value };
						this.services.settings.normalizationRules = rules;
						await this.save();
					})
				);
				row.addExtraButton((btn) =>
					btn.setIcon("trash").onClick(async () => {
						this.services.settings.normalizationRules = this.services.settings.normalizationRules.filter((_, i) => i !== idx);
						await this.save();
						renderList();
					})
				);
			});

			let pattern = "";
			let replacement = "";
			let description = "";
			new Setting(list)
				.setName(locale === "ar" ? "إضافة قاعدة" : "Add a rule")
				.addText((t) => t.setPlaceholder(locale === "ar" ? "النمط (بلا علامات /)" : "pattern (no slashes)").onChange((v) => (pattern = v)))
				.addText((t) => t.setPlaceholder(locale === "ar" ? "البديل" : "replacement").onChange((v) => (replacement = v)))
				.addText((t) => t.setPlaceholder(locale === "ar" ? "وصف مختصر" : "short description").onChange((v) => (description = v)))
				.addButton((btn) =>
					btn.setButtonText(locale === "ar" ? "إضافة" : "Add").onClick(async () => {
						if (!pattern.trim()) return;
						this.services.settings.normalizationRules = [
							...this.services.settings.normalizationRules,
							{
								id: `custom-${Date.now()}`,
								description: description.trim(),
								pattern: pattern.trim(),
								flags: "g",
								replacement,
								enabled: true,
							},
						];
						await this.save();
						renderList();
					})
				);
		};
		renderList();
	}

	private renderAdvancedTunables(containerEl: HTMLElement, locale: Locale): void {
		const numberField = (
			key: "maxSlidingWindowWords" | "maxSuggestionResults" | "tafsirFetchDelayMs" | "tafsirFetchDelayThreshold" | "reflectionFileNameAyahTextMaxLength",
			label: Record<Locale, string>,
			desc: Record<Locale, string>
		) => {
			new Setting(containerEl)
				.setName(label[locale])
				.setDesc(desc[locale])
				.addText((text) =>
					text.setValue(String(this.services.settings[key])).onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.services.settings[key] = num;
							await this.save();
						}
					})
				);
		};

		numberField(
			"maxSlidingWindowWords",
			{ ar: "أقصى عرض لنافذة البحث الانزلاقي", en: "Max sliding-window width" },
			{ ar: "أقصى عدد كلمات يحاول الاكتشاف التلقائي مطابقتها دفعة واحدة.", en: "Largest word-count window the auto-detect fallback tries." }
		);
		numberField(
			"maxSuggestionResults",
			{ ar: "أقصى عدد نتائج مقترحة", en: "Max suggestion results" },
			{ ar: "أقصى عدد آيات تظهر في نوافذ البحث/النطاق/الربط.", en: "Cap on suggestions shown in the search/range/link-ayat modals." }
		);
		numberField(
			"tafsirFetchDelayMs",
			{ ar: "تأخير الجلب (ميلي ثانية)", en: "Fetch delay (ms)" },
			{ ar: "التأخير بين طلبات التفسير المتتالية عند طول النطاق.", en: "Delay inserted between consecutive tafsir requests for long ranges." }
		);
		numberField(
			"tafsirFetchDelayThreshold",
			{ ar: "عتبة تفعيل التأخير (عدد الآيات)", en: "Delay threshold (ayah count)" },
			{ ar: "أقل طول نطاق يبدأ عنده تفعيل التأخير أعلاه.", en: "Range length above which the delay above kicks in." }
		);
		numberField(
			"reflectionFileNameAyahTextMaxLength",
			{ ar: "أقصى طول لنص الآية داخل اسم الملف", en: "Max ayah-text length in filename" },
			{
				ar: "يُقتطع نص الآية داخل عنوان الملف عند هذا الطول (٠ = بلا اقتطاع).",
				en: "Ayah text inside the file title is truncated at this length (0 = no truncation).",
			}
		);
	}
}

```

## settings\SettingsSchema.ts

```typescript
import type { Locale } from "../../config/types";

export type SettingFieldType = "toggle" | "text" | "textarea" | "dropdown" | "slider" | "color";

export interface SettingFieldDefinition {
	key: string;
	type: SettingFieldType;
	label: Record<Locale, string>;
	description: Record<Locale, string>;
	dropdownOptions?: Array<{ value: string; label: string }>;
	slider?: { min: number; max: number; step: number };
}

export interface SettingsSectionDefinition {
	id: string;
	heading: Record<Locale, string>;
	fields: SettingFieldDefinition[];
}

export const SETTINGS_SCHEMA: SettingsSectionDefinition[] = [
	{
		id: "text",
		heading: { ar: "التحكم في النصوص والتخريج", en: "Text handling & output" },
		fields: [
			{
				key: "stripTashkeel",
				type: "toggle",
				label: { ar: "إدراج النص مجرداً من التشكيل", en: "Strip tashkeel on insert" },
				description: {
					ar: "عند التفعيل، تُدرَج الآيات بلا علامات ضبط وتشكيل كحالة افتراضية.",
					en: "When enabled, inserted ayahs have tashkeel/diacritics stripped by default.",
				},
			},
			{
				key: "useOrnateNumbers",
				type: "toggle",
				label: { ar: "استخدام الأرقام المزخرفة", en: "Use ornate numbers" },
				description: {
					ar: "تحويل رقم الآية العادي بين قوسين إلى الرمز المصحفي المزخرف بالأرقام العربية.",
					en: "Converts plain \"(n)\" ayah markers into the ring-glyph ornate style.",
				},
			},
			{
				key: "referenceFormat",
				type: "text",
				label: { ar: "صيغة الإحالة المرجعية", en: "Reference format" },
				description: {
					ar: "يجب أن تحوي {surah} و{verse}، مثل [{surah}:{verse}]. تتحكم فعلياً في التعرف على المرجع وكتابته (راجع ARCHITECTURE.md NFR-3).",
					en: "Must contain {surah} and {verse}, e.g. [{surah}:{verse}]. Actually drives parsing AND output (see docs/ARCHITECTURE.md NFR-3).",
				},
			},
			{
				key: "wrapperStart",
				type: "text",
				label: { ar: "بداية إطار الآية", en: "Verse wrapper — start glyph" },
				description: { ar: "الرمز الذي يفتتح به نص الآية المدرجة.", en: "Glyph that opens an inserted ayah." },
			},
			{
				key: "wrapperEnd",
				type: "text",
				label: { ar: "نهاية إطار الآية", en: "Verse wrapper — end glyph" },
				description: { ar: "الرمز الذي يختتم به نص الآية المدرجة.", en: "Glyph that closes an inserted ayah." },
			},
			{
				key: "ornateRingGlyph",
				type: "text",
				label: { ar: "رمز الرقم المزخرف", en: "Ornate number ring glyph" },
				description: { ar: "الرمز المستخدم مع الأرقام المزخرفة (الافتراضي: ۝).", en: "Glyph used to ring ornate ayah numbers (default: ۝)." },
			},
		],
	},
	{
		id: "search",
		heading: { ar: "البحث والواجهة", en: "Search & interface" },
		fields: [
			{
				key: "showAnalytics",
				type: "toggle",
				label: { ar: "إظهار لوحة التحليلات", en: "Show analytics dashboard" },
				description: {
					ar: "عرض إحصاءات فورية (الإجمالي، الأكثر تكراراً، الأعلى كثافة) أسفل شريط البحث.",
					en: "Live match statistics under the search modal's input.",
				},
			},
			{
				key: "interfaceLanguage",
				type: "dropdown",
				label: { ar: "لغة الواجهة", en: "Interface language" },
				description: {
					ar: "لغة النصوص التفاعلية (البحث، لوحة التحليلات، منتقي التفسير).",
					en: "Language for the plugin's interactive UI text.",
				},
				dropdownOptions: [
					{ value: "ar", label: "العربية" },
					{ value: "en", label: "English" },
				],
			},
			{
				key: "searchStrategy",
				type: "dropdown",
				label: { ar: "آلية البحث عن الآيات", en: "Verse search mechanism" },
				description: {
					ar: "حرفي: يجب أن تظهر كلمات البحث متتالية وبنفس ترتيبها داخل الآية. تقريبي: يكفي أن تظهر كل كلمة في أي مكان بالآية.",
					en: "Literal: search words must appear contiguously and in order within the ayah. Fuzzy: each word just needs to appear anywhere in the ayah.",
				},
				dropdownOptions: [
					{ value: "literal", label: "Literal" },
					{ value: "fuzzy", label: "Fuzzy" },
				],
			},
		],
	},
	{
		id: "tafsir",
		heading: { ar: "إعدادات محرك التفسير السياقي", en: "Tafsir engine" },
		fields: [
			{
				key: "rangeHeadingLevel",
				type: "text",
				label: { ar: "حجم عنوان نطاق الآيات", en: "Range heading level" },
				description: {
					ar: "مثل ### أو ## أو أي مستوى تريده — نص حر بلا سقف أو حد أدنى.",
					en: "e.g. ### or ## or any level you like — free text, no fixed ceiling or floor.",
				},
			},
			{
				key: "bookHeadingLevel",
				type: "text",
				label: { ar: "حجم عنوان كتاب التفسير", en: "Book heading level" },
				description: {
					ar: "مستوى الـ Heading لعنوان كل كتاب تفسير على حدة — نص حر.",
					en: "Heading level for each book's own heading — free text.",
				},
			},
			{
				key: "includeAyahTextInTafsir",
				type: "toggle",
				label: { ar: "تضمين نص الآية القرآنية", en: "Include ayah text" },
				description: { ar: "طباعة نص الآية داخل الأقواس قبل متن تفسيرها.", en: "Print the ayah's own text before its commentary." },
			},
			{
				key: "useHorizontalDivider",
				type: "toggle",
				label: { ar: "استخدام فاصل أفقي", en: "Use horizontal divider" },
				description: { ar: "إدراج فاصل (---) بين كتب تفسير متعددة لنفس النطاق.", en: "Insert a '---' divider between multiple books' output." },
			},
		],
	},
	{
		id: "style",
		heading: { ar: "تنسيق مظهر الأقواس القرآنية", en: "Qur'anic text style" },
		fields: [
			{
				key: "quranFontFamily",
				type: "text",
				label: { ar: "نوع الخط المصحفي", en: "Font family" },
				description: {
					ar: "الخط المدمج الافتراضي هو خط مجمع الملك فهد (KFGQPC Uthmanic Script HAFS) مطابق لتطبيق آية، مع خط Amiri Quran كبديل.",
					en: "Default bundled font is King Fahd Complex (KFGQPC Uthmanic Script HAFS), with Amiri Quran as fallback.",
				},
			},
			{
				key: "quranFontSize",
				type: "slider",
				label: { ar: "حجم الخط", en: "Font size" },
				description: { ar: "حجم خط الآية بوحدة (em) نسبةً لمتن النص.", en: "Ayah font size in em, relative to body text." },
				slider: { min: 0.8, max: 2.5, step: 0.05 },
			},
			{
				key: "quranLineHeight",
				type: "slider",
				label: { ar: "ارتفاع السطر", en: "Line height" },
				description: { ar: "تباعد الأسطر لمنع تداخل الحركات وعلامات الوقف (الافتراضي 2.4).", en: "Line spacing to prevent tashkeel/waqf marks overlapping (default 2.4)." },
				slider: { min: 1.5, max: 3.5, step: 0.1 },
			},
			{
				key: "quranColor",
				type: "color",
				label: { ar: "لون الآيات", en: "Qur'anic text color" },
				description: { ar: "اللون المميز للشواهد القرآنية داخل الأقواس.", en: "Accent color for Qur'anic quotes inside the wrapper glyphs." },
			},
			{
				key: "styleOrnateNumbers",
				type: "toggle",
				label: { ar: "تنسيق الأرقام المزخرفة", en: "Style ornate numbers" },
				description: {
					ar: "عند التفعيل، يُميَّز الرقم المزخرف بصرياً في المعاينة المباشرة وعرض القراءة عبر الصنف .quran-key-ornate-number.",
					en: "When enabled, ornate ayah numbers get their own visual highlight in Live Preview and Reading view.",
				},
			},
			{
				key: "customCss",
				type: "textarea",
				label: { ar: "CSS مخصص", en: "Custom CSS" },
				description: {
					ar: "يُلحق حرفياً بعد المتغيرات المولّدة تلقائياً.",
					en: "Appended verbatim after the auto-generated CSS variables.",
				},
			},
		],
	},
	{
		id: "reflections",
		heading: { ar: "ملاحظات الآيات (التدبرات والآثار)", en: "Ayah notes (تدبر / أثر)" },
		fields: [
			{
				key: "ayahNotesFolder",
				type: "text",
				label: { ar: "مجلد ملاحظات الآيات الموحّدة", en: "Unified ayah notes folder" },
				description: {
					ar: "المجلد الذي تُحفظ فيه ملاحظة الآية الموحّدة.",
					en: "Folder holding each ayah's unified note.",
				},
			},
			{
				key: "includeAyahTextInReflectionNote",
				type: "toggle",
				label: { ar: "تضمين نص الآية في أول الملاحظة", en: "Include ayah text at the top of the note" },
				description: {
					ar: "يُكتب مرة واحدة فقط عند إنشاء الملاحظة لأول مرة.",
					en: "Written once, when the note is first created.",
				},
			},
			{
				key: "reflectionInsertionMode",
				type: "dropdown",
				label: { ar: "ترتيب المُدخلات الجديدة", en: "New-entry placement" },
				description: {
					ar: "مباشرة أسفل العنوان: الأحدث يظهر أولاً. نهاية القسم: ترتيب زمني.",
					en: "Directly under the heading: newest first. End of section: chronological.",
				},
				dropdownOptions: [
					{ value: "afterHeading", label: "afterHeading" },
					{ value: "endOfSection", label: "endOfSection" },
				],
			},
			{
				key: "reflectionEntrySeparator",
				type: "textarea",
				label: { ar: "الفاصل بين المُدخلات", en: "Separator between entries" },
				description: {
					ar: "يُدرج بين كل مُدخل والذي يليه. يدعم أسطر Enter أو \\n. اتركه فارغاً تماماً للقوائم النقطية.",
					en: "Inserted between entries. Supports newlines or \\n. Leave empty for continuous lists.",
				},
			},
			{
				key: "deleteSelectionAfterLinkingReflection",
				type: "toggle",
				label: { ar: "استبدال النص المحدد برابط للآية", en: "Replace selection with a backlink" },
				description: {
					ar: "عند التفعيل، يُستبدل النص المحدد برابط لملاحظة الآية بدل حذفه. عند التعطيل يبقى النص كما هو.",
					en: "When enabled, the selected text is replaced with a backlink to the ayah note.",
				},
			},
			{
				key: "reflectionBacklinkAliasTemplate",
				type: "text",
				label: { ar: "صيغة نص الرابط (alias)", en: "Backlink alias template" },
				description: {
					ar: "{surah} و{verse} و{ayahText} متاحة. اتركه فارغاً لرابط بلا alias.",
					en: "{surah}, {verse}, {ayahText} available. Leave empty for no alias.",
				},
			},
			{
				key: "reflectionBacklinkWrapTemplate",
				type: "text",
				label: { ar: "صيغة إحاطة الرابط", en: "Backlink wrap template" },
				description: {
					ar: "{link} هو المتغيّر الوحيد. مثال: \"↳ نُقل إلى {link}\".",
					en: 'Only {link} is available as a placeholder.',
				},
			},
			{
				key: "reflectionFileNameTemplate",
				type: "text",
				label: { ar: "صيغة عنوان ملف الآية", en: "Ayah note title format" },
				description: {
					ar: "يجب أن تحوي {ayahText}؛ يمكن أيضاً استخدام {surah} و{verse}.",
					en: 'Must contain {ayahText}; {surah} and {verse} are also available.',
				},
			},
			{
				key: "reflectionEntryPrefixTemplate",
				type: "text",
				label: { ar: "صيغة بداية كل مُدخل", en: "Entry prefix format" },
				description: {
					ar: "{date} هو المتغيّر الوحيد المتاح. أمثلة: \"### {date}\" أو \"- {date}\".",
					en: 'Only {date} is available as a placeholder.',
				},
			},
		],
	},
];
```

## main.ts

```typescript
import { Plugin } from "obsidian";
import type { Editor } from "obsidian";
import type { Extension } from "@codemirror/state";

import { DEFAULT_SETTINGS, migrateLegacySettings } from "./config/defaults";
import type { PluginConfig } from "./config/types";
import type { TafsirBook } from "./domain/entities/TafsirBook";
import type { ReflectionCategory } from "./domain/entities/ReflectionCategory";
import { ArabicNormalizer } from "./domain/services/ArabicNormalizer";
import { PhraseMatcher } from "./domain/services/PhraseMatcher";
import { FuzzyMatcher } from "./domain/services/FuzzyMatcher";
import { SlidingWindowSearch } from "./domain/services/SlidingWindowSearch";
import { SnippetExtractor } from "./domain/services/SnippetExtractor";
import { OrnateNumberConverter } from "./domain/services/OrnateNumberConverter";
import { VerseOutputFormatter, type FormattingOptions } from "./domain/services/VerseOutputFormatter";
import { TafsirCatalog } from "./domain/services/TafsirCatalog";
import { ReflectionCategoryCatalog } from "./domain/services/ReflectionCategoryCatalog";
import { VerseReference } from "./domain/value-objects/VerseReference";

import { SearchQuranVerses } from "./application/use-cases/SearchQuranVerses";
import { AnalyzeLineContext } from "./application/use-cases/AnalyzeLineContext";
import { ExtractAndInsertVerse } from "./application/use-cases/ExtractAndInsertVerse";
import { ToggleSnippetView } from "./application/use-cases/ToggleSnippetView";
import { FetchAndInsertTafsir, type TafsirFormattingOptions } from "./application/use-cases/FetchAndInsertTafsir";
import { LinkReflectionToVerses, type ReflectionLinkOptions } from "./application/use-cases/LinkReflectionToVerses";
import { LinkAyahsTogether } from "./application/use-cases/LinkAyahsTogether";
import { RemoveQuranReference } from "./application/use-cases/RemoveQuranReference";
import { ConvertReferenceToFootnote } from "./application/use-cases/ConvertReferenceToFootnote";
import { StripTashkeel } from "./application/use-cases/StripTashkeel";

import { ObsidianQuranRepository } from "./infrastructure/obsidian/ObsidianQuranRepository";
import { ObsidianEditorAdapter } from "./infrastructure/obsidian/ObsidianEditorAdapter";
import { ObsidianNoticeAdapter } from "./infrastructure/obsidian/ObsidianNoticeAdapter";
import { ObsidianAyahNoteRepository } from "./infrastructure/obsidian/ObsidianAyahNoteRepository";
import {
	applyStyleVariables,
	cleanupStyleVariables,
	createMarkdownPostProcessor,
	createOrnateNumberHighlightExtension,
	createOrnateNumberPostProcessor,
	createQuranHighlightExtension,
} from "./infrastructure/obsidian/QuranHighlightExtension";
import { HttpTafsirRepository } from "./infrastructure/http/HttpTafsirRepository";
import { InMemoryInsertionMemento } from "./infrastructure/memory/InMemoryInsertionMemento";

import type { AppServices } from "./presentation/AppServices";
import { registerAllCommands } from "./presentation/commands/registerCommands";
import { QuranKeySettingsTab } from "./presentation/settings/QuranKeySettingsTab";

import builtinTafsirBooksData from "../data/tafsirBooks.json";
import builtinReflectionCategoriesData from "../data/reflectionCategories.json";

export default class QuranKeyPlugin extends Plugin {
	settings: PluginConfig = DEFAULT_SETTINGS;

	private repository!: ObsidianQuranRepository;
	private readonly tafsirRepository = new HttpTafsirRepository();
	private readonly notice = new ObsidianNoticeAdapter();
	private readonly memento = new InMemoryInsertionMemento();
	private readonly editorExtension: Extension[] = [];

	services!: AppServices;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.repository = new ObsidianQuranRepository(this.app.vault, new ArabicNormalizer(this.settings.normalizationRules));
		await this.repository.loadAll();

		this.refreshStyles();
		this.rebuildCoreServices();
		this.refreshHighlightExtension();
		this.registerEditorExtension(this.editorExtension);

		this.registerMarkdownPostProcessor((el) => {
			createMarkdownPostProcessor(this.settings.wrapperStart, this.settings.wrapperEnd)(el);
			if (this.settings.styleOrnateNumbers) {
				createOrnateNumberPostProcessor(this.settings.ornateRingGlyph)(el);
			}
		});

		this.addSettingTab(new QuranKeySettingsTab(this.app, this, this.services));
		registerAllCommands(this, this.services);
	}

	onunload(): void {
		cleanupStyleVariables();
	}

	async loadSettings(): Promise<void> {
		const rawData = (await this.loadData()) as Partial<PluginConfig> | undefined;
		const raw = migrateLegacySettings(rawData);
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.rebuildCoreServices();
		this.refreshHighlightExtension();
		this.refreshStyles();
	}

	private refreshStyles(): void {
		applyStyleVariables(this.settings);
	}

	private refreshHighlightExtension(): void {
		this.editorExtension.length = 0;
		this.editorExtension.push(createQuranHighlightExtension(this.settings.wrapperStart, this.settings.wrapperEnd));
		if (this.settings.styleOrnateNumbers) {
			this.editorExtension.push(createOrnateNumberHighlightExtension(this.settings.ornateRingGlyph));
		}
		this.app.workspace.updateOptions();
	}

	private rebuildCoreServices(): void {
		const normalizer = new ArabicNormalizer(this.settings.normalizationRules);
		this.repository = new ObsidianQuranRepository(this.app.vault, normalizer);
		void this.repository.loadAll();

		const reference = VerseReference.compile(this.settings.referenceFormat);
		const phraseMatcher = new PhraseMatcher(normalizer);
		const fuzzyMatcher = new FuzzyMatcher(normalizer);
		const slidingWindow = new SlidingWindowSearch(
			normalizer,
			phraseMatcher,
			this.settings.wrapperStart,
			this.settings.wrapperEnd,
			this.settings.maxSlidingWindowWords
		);
		const snippetExtractor = new SnippetExtractor(normalizer, this.settings.wrapperStart, this.settings.wrapperEnd);
		const ornateConverter = new OrnateNumberConverter(this.settings.ornateRingGlyph);
		const formatter = new VerseOutputFormatter(ornateConverter, reference, (text) => normalizer.stripTashkeel(text));
		const toggle = new ToggleSnippetView(snippetExtractor, formatter);

		const builtinBooks = builtinTafsirBooksData as unknown as TafsirBook[];
		const catalog = new TafsirCatalog(builtinBooks, this.settings.customTafsirBooks);

		const builtinReflectionCategories = builtinReflectionCategoriesData as unknown as ReflectionCategory[];
		const reflectionCatalog = new ReflectionCategoryCatalog(
			builtinReflectionCategories,
			this.settings.customReflectionCategories
		);

		const ayahNotes = new ObsidianAyahNoteRepository(this.app, () => ({
			ayahNotesFolder: this.settings.ayahNotesFolder,
			reflectionFileNameAyahTextMaxLength: this.settings.reflectionFileNameAyahTextMaxLength,
		}));

		const getFormattingOptions = (): FormattingOptions => ({
			wrapperStart: this.settings.wrapperStart,
			wrapperEnd: this.settings.wrapperEnd,
			useOrnateNumbers: this.settings.useOrnateNumbers,
			stripTashkeelOnOutput: this.settings.stripTashkeel,
		});

		const linkReflection = new LinkReflectionToVerses(
			this.repository,
			normalizer,
			reference,
			formatter,
			reflectionCatalog,
			ayahNotes
		);

		const linkAyahsTogether = new LinkAyahsTogether(ayahNotes, formatter);

		const extract = new ExtractAndInsertVerse(
			this.repository,
			normalizer,
			phraseMatcher,
			slidingWindow,
			snippetExtractor,
			formatter,
			reference,
			this.memento,
			toggle,
			this.settings.wrapperStart,
			this.settings.wrapperEnd,
			getFormattingOptions
		);

		const search = new SearchQuranVerses(
			this.repository,
			phraseMatcher,
			fuzzyMatcher,
			this.settings.maxSuggestionResults,
			this.settings.searchStrategy
		);
		const analyzeContext = new AnalyzeLineContext(this.repository, normalizer, reference, slidingWindow);
		const fetchTafsir = new FetchAndInsertTafsir(this.repository, this.tafsirRepository, catalog, this.notice);
		const removeReference = new RemoveQuranReference(reference);
		const convertToFootnote = new ConvertReferenceToFootnote(reference);
		const stripTashkeel = new StripTashkeel(normalizer);

		const buildTafsirOptions = (): TafsirFormattingOptions => ({
			locale: this.settings.interfaceLanguage,
			wrapperStart: this.settings.wrapperStart,
			wrapperEnd: this.settings.wrapperEnd,
			includeAyahText: this.settings.includeAyahTextInTafsir,
			useHorizontalDivider: this.settings.useHorizontalDivider,
			rangeHeadingLevel: this.settings.rangeHeadingLevel,
			bookHeadingLevel: this.settings.bookHeadingLevel,
			fetchDelayMs: this.settings.tafsirFetchDelayMs,
			fetchDelayThreshold: this.settings.tafsirFetchDelayThreshold,
			resolutionOrder: this.settings.tafsirBookResolutionOrder,
			favoriteBookIds: this.settings.favoriteBooksIds,
			defaultBookId: this.settings.defaultTafsirBookId,
		});

		const buildReflectionOptions = (): ReflectionLinkOptions => ({
			locale: this.settings.interfaceLanguage,
			replaceSelectionWithBacklink: this.settings.deleteSelectionAfterLinkingReflection,
			entryPrefixTemplate: this.settings.reflectionEntryPrefixTemplate.replace(/\\n/g, "\n").replace(/\\t/g, "\t"),
			entrySeparator: this.settings.reflectionEntrySeparator.replace(/\\n/g, "\n").replace(/\\t/g, "\t"),
			insertionMode: this.settings.reflectionInsertionMode,
			includeAyahTextInNote: this.settings.includeAyahTextInReflectionNote,
			fileNameTemplate: this.settings.reflectionFileNameTemplate,
			backlinkAliasTemplate: this.settings.reflectionBacklinkAliasTemplate,
			backlinkWrapTemplate: this.settings.reflectionBacklinkWrapTemplate,
			quoteFormattingOptions: getFormattingOptions(),
		});

		const rebuilt: AppServices = {
			app: this.app,
			settings: this.settings,
			repository: this.repository,
			ayahNotes,
			catalog,
			reflectionCatalog,
			normalizer,
			useCases: {
				search,
				analyzeContext,
				extract,
				fetchTafsir,
				removeReference,
				convertToFootnote,
				stripTashkeel,
				linkReflection,
				linkAyahsTogether,
			},
			buildTafsirOptions,
			buildReflectionOptions,
			wrapEditor: (editor: Editor) => new ObsidianEditorAdapter(editor),
			saveSettings: () => this.saveSettings(),
		};

		if (this.services) {
			Object.assign(this.services, rebuilt);
		} else {
			this.services = rebuilt;
		}
	}
}
```
