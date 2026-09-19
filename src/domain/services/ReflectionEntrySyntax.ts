export interface ParsedReflectionInput {
	content: string;
	categoryName: string | null;
}

/** Parses the optional `content -- category` shorthand used by reflection commands. */
export function parseReflectionInput(text: string, delimiter: string): ParsedReflectionInput {
	const content = text.trim();
	const separator = delimiter.trim();
	if (!separator) return { content, categoryName: null };

	const index = content.lastIndexOf(separator);
	if (index === -1) return { content, categoryName: null };

	const before = content.slice(0, index).trim();
	const after = content.slice(index + separator.length).trim();
	if (!before || !after) return { content, categoryName: null };
	return { content: before, categoryName: after };
}

export function createReflectionBlockId(): string {
	const random = Math.random().toString(36).slice(2, 8);
	return `qk-reflection-${Date.now().toString(36)}${random}`;
}

export function formatArabicDate(date: Date): string {
	return new Intl.DateTimeFormat("ar-EG", {
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(date);
}

export function renderAyahNoteTemplate(template: string, ayah: string): string {
	return template.split("{ayah}").join(ayah).split("{ayahText}").join(ayah);
}

export function renderReflectionEntry(
	content: string,
	template: string,
	includeDate: boolean,
	date: string,
	blockId?: string
): string {
	const safeTemplate = template.includes("{content}") ? template : `- {content}${template ? ` — ${template}` : ""}`;
	let rendered = safeTemplate.split("{content}").join(content.trim());
	if (includeDate) {
		rendered = rendered.split("{date}").join(date);
	} else {
		// Remove the date segment and its immediately preceding separator when possible.
		rendered = rendered.replace(/\s*(?:—|-|:)\s*(?:[^\n{}]*?)?\{date\}/, "");
		rendered = rendered.split("{date}").join("");
	}
	if (!blockId) return rendered;
	const trailing = rendered.match(/\s*$/)?.[0] ?? "";
	const body = trailing ? rendered.slice(0, -trailing.length).trimEnd() : rendered.trimEnd();
	return `${body} ^${blockId}${trailing}`;
}
