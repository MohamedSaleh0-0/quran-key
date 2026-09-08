export interface MarkdownSectionTarget {
	headingLevel: string;
	headingText: string;
}

const HEADING_LINE_REGEX = /^(#{1,6})\s+(.*)$/;

function headingIndex(lines: readonly string[], target: MarkdownSectionTarget): number {
	const expected = `${target.headingLevel} ${target.headingText}`.trim();
	return lines.findIndex((line) => line.trim() === expected);
}

function sectionEndIndex(lines: readonly string[], startIndex: number, depth: number): number {
	for (let i = startIndex + 1; i < lines.length; i++) {
		const match = lines[i].match(HEADING_LINE_REGEX);
		if (match && match[1].length <= depth) return i;
	}
	return lines.length;
}

/** Extracts the body of one exact Markdown heading section without including
 * the heading itself or any sibling/higher-level sections. Nested headings
 * remain part of the returned body. */
export class MarkdownSectionExtractor {
	static extract(content: string, target: MarkdownSectionTarget): string | null {
		const lines = content.split("\n");
		const start = headingIndex(lines, target);
		if (start === -1) return null;

		const end = sectionEndIndex(lines, start, target.headingLevel.length);
		return lines
			.slice(start + 1, end)
			.join("\n")
			.replace(/^\s+|\s+$/g, "");
	}

	static extractMany(contents: readonly string[], target: MarkdownSectionTarget): string[] {
		return contents
			.map((content) => this.extract(content, target))
			.filter((section): section is string => section !== null && section.length > 0);
	}
}
