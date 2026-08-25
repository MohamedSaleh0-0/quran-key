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