import type { Ayah } from "../../domain/entities/Ayah";
import type { EditorPort, EditorPosition } from "../../domain/ports/EditorPort";
import type { InsertionMementoStore } from "../../domain/ports/InsertionMemento";
import type { QuranRepository } from "../../domain/ports/QuranRepository";
import type { CompiledVerseReference } from "../../domain/value-objects/VerseReference";
import { ArabicNormalizer } from "../../domain/services/ArabicNormalizer";
import { AyahLineResolver } from "../../domain/services/AyahLineResolver";
import type { AmbiguousAyahLineMatch } from "../../domain/services/AyahLineResolver";
import { PhraseMatcher } from "../../domain/services/PhraseMatcher";
import { SlidingWindowSearch } from "../../domain/services/SlidingWindowSearch";
import { SnippetExtractor } from "../../domain/services/SnippetExtractor";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";
import { ToggleSnippetView } from "./ToggleSnippetView";

/** Matches "(word1-word2)" range shorthand — deliberately permissive about
 *  what's inside the parens; SnippetExtractor.extractRange does the real
 *  word-matching work and simply falls back to "no crop" if it can't. */
const RANGE_SHORTHAND_REGEX = /\(([^)]+?-[^)]+?)\)/g;

const EXPLICIT_RESOLUTION_REGEX =
	/(?:^|\s)([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,2})\s*[:\s]\s*(\d+(?:\s*-\s*\d+)?(?:\s*[,\u060C]\s*\d+(?:\s*-\s*\d+)?)*)/g;

export type AmbiguityHandler = (
	query: string,
	matches: Ayah[],
	startPos: EditorPosition,
	endPos: EditorPosition
) => void;

/**
 * The plugin's primary "do the thing" command (FR-9..15). Tries, in
 * order: toggle full<->snippet, range shorthand next to a reference, a
 * text selection as a query, a {query} shorthand, an explicit
 * "Surah N[-M][, N2[-M2]]" resolution, then a sliding-window auto-detect
 * fallback. Ambiguous query matches return `false` so the presentation layer
 * can open a clean global search without this use case importing a Modal.
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
		private readonly prepareFormattingOptions: (ayahs: readonly Ayah[]) => Promise<FormattingOptions>,
		private readonly ayahLineResolver = new AyahLineResolver(normalizer, slidingWindow)
	) {}

	async execute(editor: EditorPort, onAmbiguity?: AmbiguityHandler): Promise<boolean> {
		const cursor = editor.getCursor();
		const currentLine = editor.getLine(cursor.line);

		// FR-9
		const last = this.memento.get();
		if (last) {
			const formattingOptions = await this.prepareFormattingOptions(last.ayahs);
			const toggled = this.toggle.attempt(
				last,
				currentLine,
				cursor.line,
				this.wrapperStart,
				this.wrapperEnd,
				formattingOptions
			);
			if (toggled) {
				editor.replaceRange(
					toggled.output,
					{ line: cursor.line, ch: toggled.startCh },
					{ line: cursor.line, ch: toggled.endCh },
					"input.quran-key-toggle"
				);
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
				editor.replaceRange(
					this.formatter.format([dummy], await this.prepareFormattingOptions([actualAyah])),
					{ line: cursor.line, ch: startCh },
					{ line: cursor.line, ch: endCh },
					"input.quran-key-range"
				);
				return true;
			}
		}

		// FR-11
		const rawSelectedText = editor.getSelection();
		const selectedText = rawSelectedText.trim();
		if (selectedText.length > 0) {
			const from = editor.getCursor("from");
			const to = editor.getCursor("to");
			const leadingWhitespace = rawSelectedText.length - rawSelectedText.trimStart().length;
			const listPrefix = selectedText.match(/^(?:[-+*]|\d+[.)])\s+/)?.[0] ?? "";
			const query = listPrefix ? selectedText.slice(listPrefix.length).trim() : selectedText;
			const queryStart = listPrefix
				? { line: from.line, ch: from.ch + leadingWhitespace + listPrefix.length }
				: from;
			return await this.resolveTextQuery(editor, query, queryStart, to, onAmbiguity);
		}

		// FR-12
		const curlyMatch = currentLine.match(/\{([^}]+)\}/);
		if (curlyMatch) {
			const fullCurly = curlyMatch[0];
			const innerText = curlyMatch[1].trim();
			const start: EditorPosition = { line: cursor.line, ch: currentLine.indexOf(fullCurly) };
			const end: EditorPosition = { line: cursor.line, ch: start.ch + fullCurly.length };
			return await this.resolveTextQuery(editor, innerText, start, end, onAmbiguity);
		}

		if (currentLine.trim().length === 0) return false;

		// A complete line can itself describe a range by ayah content, for
		// example: "بسم الله الرحمن الرحيم - إياك نعبد وإياك نستعين".
		// Resolve this before the sliding-window fallback, which otherwise sees
		// only the longest individual phrase.
		const rangeText = currentLine.replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "").trim();
		const contentRange = this.resolveTextRange(rangeText);
		if (contentRange) {
			const prefixLength = currentLine.length - currentLine.trimStart().length;
			const listPrefix = currentLine.trimStart().match(/^(?:[-+*]|\d+[.)])\s+/)?.[0].length ?? 0;
			const startCh = prefixLength + listPrefix;
			await this.insert(editor, { line: cursor.line, ch: startCh }, { line: cursor.line, ch: currentLine.length }, contentRange, "");
			return true;
		}
		const lineResolution = this.ayahLineResolver.resolve(
			currentLine,
			this.repository.getAllAyahs(),
			this.repository.getSearchCorpusText()
		);
		if (lineResolution.match) {
			const lineMatch = lineResolution.match;
			await this.insert(
				editor,
				{ line: cursor.line, ch: lineMatch.startCh },
				{ line: cursor.line, ch: lineMatch.endCh },
				[lineMatch.ayah],
				lineMatch.query
			);
			return true;
		}
		if (lineResolution.ambiguous) {
			await this.insertAmbiguousMatch(editor, lineResolution.ambiguous, cursor.line, onAmbiguity);
			return true;
		}

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
				await this.insert(editor, start, end, matched, "");
				return true;
			}
		}

		return false;
	}

	private async resolveTextQuery(
		editor: EditorPort,
		query: string,
		start: EditorPosition,
		end: EditorPosition,
		onAmbiguity?: AmbiguityHandler
	): Promise<boolean> {
		const textRange = this.resolveTextRange(query);
		if (textRange) {
			await this.insert(editor, start, end, textRange, query);
			return true;
		}
		const exactMatches = this.findExactAyahs(query);
		if (exactMatches.length === 1) {
			await this.insert(editor, start, end, exactMatches, query);
			return true;
		}
		const matches = this.phraseMatcher.findMatches(query, this.repository.getAllAyahs());
		if (matches.length === 1) {
			await this.insert(editor, start, end, [matches[0]], query);
			return true;
		}
		if (matches.length > 1) {
			const output = await this.insert(editor, start, end, [matches[0]], query);
			onAmbiguity?.(query, matches, start, { line: start.line, ch: start.ch + output.length });
			return true;
		}
		return false;
	}

	private async insertAmbiguousMatch(
		editor: EditorPort,
		ambiguous: AmbiguousAyahLineMatch,
		line: number,
		onAmbiguity?: AmbiguityHandler
	): Promise<void> {
		const start: EditorPosition = { line, ch: ambiguous.startCh };
		const end: EditorPosition = { line, ch: ambiguous.endCh };
		const output = await this.insert(editor, start, end, [ambiguous.ayahs[0]], ambiguous.query);
		onAmbiguity?.(ambiguous.query, ambiguous.ayahs, start, { line, ch: start.ch + output.length });
	}

	private findExactAyahs(query: string): Ayah[] {
		const normalizedQuery = this.normalizer.normalizeForSearch(query);
		if (!normalizedQuery) return [];
		return this.repository
			.getAllAyahs()
			.filter((ayah) => this.normalizer.normalizeForSearch(ayah.text) === normalizedQuery);
	}

	/** Resolves `start phrase - end phrase` to a contiguous range in one surah.
	 * This is intentionally limited to the general Quran extraction command;
	 * reflection logging remains one ayah per note. */
	private resolveTextRange(query: string): Ayah[] | null {
		const match = query.match(/^\s*(.+?)\s*[-–—]\s*(.+?)\s*$/);
		if (!match) return null;
		const startMatches = this.phraseMatcher.findMatches(match[1], this.repository.getAllAyahs());
		const endMatches = this.phraseMatcher.findMatches(match[2], this.repository.getAllAyahs());
		if (startMatches.length !== 1 || endMatches.length !== 1) return null;
		const start = startMatches[0];
		const end = endMatches[0];
		const allAyahs = this.repository.getAllAyahs();
		const startIndex = allAyahs.findIndex((ayah) => ayah.id === start.id);
		const endIndex = allAyahs.findIndex((ayah) => ayah.id === end.id);
		if (startIndex === -1 || endIndex === -1) return null;
		const firstIndex = Math.min(startIndex, endIndex);
		const lastIndex = Math.max(startIndex, endIndex);
		return allAyahs.slice(firstIndex, lastIndex + 1);
	}

	/** Public so presentation code (the search/range-end modals) can reuse
	 *  the exact same insert-and-remember-for-toggle behavior as the
	 *  extract command itself, instead of duplicating it. */
	async insertAyahs(editor: EditorPort, start: EditorPosition, end: EditorPosition, ayahs: Ayah[], query: string): Promise<string> {
		const output = this.formatter.format(ayahs, await this.prepareFormattingOptions(ayahs));
		editor.replaceRange(output, start, end);
		this.memento.set({ line: start.line, startCh: start.ch, endCh: start.ch + output.length, query, ayahs, isSnippet: false });
		return output;
	}

	private async insert(editor: EditorPort, start: EditorPosition, end: EditorPosition, ayahs: Ayah[], query: string): Promise<string> {
		const formattingOptions = await this.prepareFormattingOptions(ayahs);
		const output = this.formatter.format(ayahs, formattingOptions);
		const preview = this.buildSnippetPreview(ayahs, query, formattingOptions);

		if (preview && start.line === end.line) {
			// Keep the cited words as a real undo state immediately before the full
			// ayah. CodeMirror uses the distinct user-event names as a history
			// boundary, so Ctrl+Z restores the preview instead of the pre-command
			// prose.
			editor.replaceRange(preview, start, end, "input.quran-key-snippet");
			const previewEnd: EditorPosition = { line: start.line, ch: start.ch + preview.length };
			editor.replaceRange(output, start, previewEnd, "input.quran-key-full");
		} else {
			editor.replaceRange(output, start, end);
		}
		this.memento.set({ line: start.line, startCh: start.ch, endCh: start.ch + output.length, query, ayahs, isSnippet: false });
		return output;
	}

	private buildSnippetPreview(
		ayahs: readonly Ayah[],
		query: string,
		formattingOptions: FormattingOptions
	): string | null {
		if (ayahs.length !== 1 || !query.trim()) return null;
		const ayah = ayahs[0];
		const snippet = this.snippetExtractor.extractSnippet(ayah.text, query);
		if (!snippet || snippet === ayah.text) return null;
		return this.formatter.format([{ ...ayah, text: snippet }], { ...formattingOptions, includeReference: false });
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
