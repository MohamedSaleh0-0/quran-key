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
