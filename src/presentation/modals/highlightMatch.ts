const TASHKEEL_FILLER = "[\\u064B-\\u065F\\u0670\\u06E6\\u06E5\\u06D6-\\u06DC\\u06DF-\\u06E8\\u06EA-\\u06ED\\s]*";

function escapeRegex(literal: string): string {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Builds a per-character regex fragment tolerant of common Arabic
 *  spelling variants (hamza forms, ya/hamza-ya, waw/hamza-waw, ta
 *  marbuta/ha), with optional tashkeel between characters. Rendering-only
 *  — never used for the actual match logic (that's ArabicNormalizer +
 *  PatternBuilder in the domain layer). */
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

/** Highlights `query`'s words inside `text` (HTML-escaped first) for
 *  suggestion rendering only. */
export function highlightMatch(text: string, query: string, normalizeForSearch: (s: string) => string): string {
	const escaped = escapeHtml(text);
	if (!query || query.trim().length === 0) return escaped;
	const cleanWords = normalizeForSearch(query).split(/\s+/).filter((w) => w.length > 0);
	if (cleanWords.length === 0) return escaped;

	const combined = cleanWords.map(buildTolerantCharPattern).join(`${TASHKEEL_FILLER}\\s+${TASHKEEL_FILLER}`);
	try {
		const rx = new RegExp(`(${combined})`, "g");
		return escaped.replace(rx, '<span class="quran-key-highlight">$1</span>');
	} catch {
		return escaped;
	}
}
