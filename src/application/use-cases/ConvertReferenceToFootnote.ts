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