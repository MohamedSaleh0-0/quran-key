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
