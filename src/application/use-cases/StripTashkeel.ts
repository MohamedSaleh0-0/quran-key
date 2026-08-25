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
