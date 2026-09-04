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
