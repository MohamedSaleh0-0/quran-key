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
