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
