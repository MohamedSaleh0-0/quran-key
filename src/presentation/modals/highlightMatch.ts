const TASHKEEL_FILLER = "[\\u064B-\\u065F\\u0670\\u06E6\\u06E5\\u06D6-\\u06DC\\u06DF-\\u06E8\\u06EA-\\u06ED\\s]*";

function escapeRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds a per-character regex fragment tolerant of common Arabic
 *  spelling variants (hamza forms, ya/hamza-ya, waw/hamza-waw, ta
 *  marbuta/ha), with optional tashkeel between characters. */
function buildTolerantCharPattern(word: string): string {
	let pattern = "";
	for (const char of word) {
		if (char === "\u0627") pattern += "[\u0627\u0623\u0625\u0622\u0671\u0621\u0649]";
		else if (char === "\u064A") pattern += "[\u064A\u0626]";
		else if (char === "\u0648") pattern += "[\u0648\u0624]";
		else if (char === "\u0647") pattern += "[\u0647\u0629]";
		else pattern += escapeRegex(char);
		pattern += TASHKEEL_FILLER;
	}
	return pattern;
}

/** Safely renders `text` into `containerEl` with matches highlighted using DOM elements (no innerHTML). */
export function renderHighlightedText(
	containerEl: HTMLElement,
	text: string,
	query: string,
	normalizeForSearch: (s: string) => string
): void {
	containerEl.empty();
	if (!query || query.trim().length === 0) {
		containerEl.setText(text);
		return;
	}

	const cleanWords = normalizeForSearch(query).split(/\s+/).filter((w) => w.length > 0);
	if (cleanWords.length === 0) {
		containerEl.setText(text);
		return;
	}

	const combined = cleanWords.map(buildTolerantCharPattern).join(`${TASHKEEL_FILLER}\\s+${TASHKEEL_FILLER}`);
	let rx: RegExp;
	try {
		rx = new RegExp(combined, "g");
	} catch {
		containerEl.setText(text);
		return;
	}

	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = rx.exec(text)) !== null) {
		if (match.index > lastIndex) {
			containerEl.appendText(text.slice(lastIndex, match.index));
		}
		containerEl.createSpan({ cls: "quran-key-highlight", text: match[0] });
		lastIndex = match.index + match[0].length;
		if (match[0].length === 0) rx.lastIndex++;
	}

	if (lastIndex < text.length) {
		containerEl.appendText(text.slice(lastIndex));
	}
}