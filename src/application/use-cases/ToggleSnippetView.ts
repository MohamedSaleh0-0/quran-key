import type { Ayah } from "../../domain/entities/Ayah";
import type { InsertionMemento } from "../../domain/ports/InsertionMemento";
import type { SnippetExtractor } from "../../domain/services/SnippetExtractor";
import type { FormattingOptions, VerseOutputFormatter } from "../../domain/services/VerseOutputFormatter";

export interface ToggleResult {
	output: string;
	/** Range in the current document to replace. This may differ from the
	 * stored memento range after Ctrl+Z restored the shorter snippet. */
	startCh: number;
	endCh: number;
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
		const startCh = memento.startCh >= 0 ? memento.startCh : currentLine.indexOf(wrapperStart);
		const storedEndCh = memento.endCh > startCh && memento.endCh <= currentLine.length ? memento.endCh : -1;
		const wrapperEndCh = currentLine.indexOf(wrapperEnd, startCh);
		const endCh = storedEndCh >= 0 ? storedEndCh : wrapperEndCh >= 0 ? wrapperEndCh + wrapperEnd.length : -1;
		if (startCh < 0 || endCh <= startCh || currentLine.slice(startCh, endCh).indexOf(wrapperStart) === -1 || currentLine.slice(startCh, endCh).indexOf(wrapperEnd) === -1) return null;

		const targetAyah = memento.ayahs[0];
		const queryText = memento.query.trim();

		if (!memento.isSnippet) {
			if (queryText.length === 0) return null;
			const snippetText = this.snippetExtractor.extractSnippet(targetAyah.text, queryText);
			if (snippetText === targetAyah.text) return null; // nothing narrower to show
			const dummy: Ayah = { ...targetAyah, text: snippetText };
			const output = this.formatter.format([dummy], formattingOptions);
			return { output, startCh, endCh, nextMemento: { ...memento, startCh, endCh: startCh + output.length, isSnippet: true } };
		}

		const output = this.formatter.format(memento.ayahs, formattingOptions);
		return {
			output,
			startCh,
			endCh,
			nextMemento: { ...memento, startCh, endCh: startCh + output.length, isSnippet: false },
		};
	}
}
