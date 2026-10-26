import { ArabicNormalizer } from "./ArabicNormalizer";
import { PatternBuilder } from "./PatternBuilder";

/**
 * Word-index based extraction: finding a snippet (a run of words) inside a
 * full ayah, or a word..word range inside a full ayah. Depends only on
 * ArabicNormalizer (injected) and the configured wrapper glyphs — no
 * Obsidian types, fully unit-testable.
 */
export class SnippetExtractor {
	constructor(
		private readonly normalizer: ArabicNormalizer,
		private readonly wrapperStart: string,
		private readonly wrapperEnd: string
	) {}

	/** Find `userSnippet`'s words as a contiguous run inside `fullVerse` and
	 *  return just that run (original spelling/tashkeel preserved). Falls
	 *  back to `fullVerse` unchanged if no match is found. */
	extractSnippet(fullVerse: string, userSnippet: string): string {
		if (!userSnippet) return fullVerse;
		const verseWords = fullVerse.trim().split(/\s+/);
		const normVerseWords = verseWords.map((w) => this.normalizer.normalizeForSearch(w));
		const searchWords = userSnippet
			.trim()
			.split(/\s+/)
			.map((w) => this.normalizer.normalizeForSearch(w));
		if (searchWords.length === 0) return fullVerse;

		for (let i = 0; i <= normVerseWords.length - searchWords.length; i++) {
			let matched = true;
			for (let j = 0; j < searchWords.length; j++) {
				if (!PatternBuilder.tokenMatches(normVerseWords[i + j], searchWords[j], j === searchWords.length - 1)) {
					matched = false;
					break;
				}
			}
			if (matched) return verseWords.slice(i, i + searchWords.length).join(" ");
		}
		return fullVerse;
	}

	/** Crop `fullVerse` to the inclusive word range between `startWord` and
	 *  `endWord` (e.g. from a "(word1-word2)" shorthand). Strips any
	 *  existing wrapper glyphs / "(N)" markers before searching. Returns
	 *  null when an endpoint cannot be located, avoiding a silent full-ayah
	 *  fallback for a failed crop. */
	extractRange(fullVerse: string, startWord: string, endWord: string): string | null {
		if (!startWord || !endWord) return null;
		const cleanVerse = fullVerse
			.split(this.wrapperStart)
			.join("")
			.split(this.wrapperEnd)
			.join("")
			.replace(/\(\d+\)/g, "")
			.trim();
		const verseWords = cleanVerse.split(/\s+/);
		const normVerseWords = verseWords.map((w) => this.normalizer.normalizeForSearch(w));

		const normalizedStart = this.normalizer.normalizeForSearch(startWord);
		const normalizedEnd = this.normalizer.normalizeForSearch(endWord);
		if (!normalizedStart || !normalizedEnd) return null;

		let startIndex = -1;
		let endIndex = -1;
		for (let i = 0; i < normVerseWords.length; i++) {
			if (startIndex === -1 && PatternBuilder.tokenMatches(normVerseWords[i], normalizedStart)) startIndex = i;
			if (startIndex !== -1 && PatternBuilder.tokenMatches(normVerseWords[i], normalizedEnd)) {
				endIndex = i;
				break;
			}
		}
		if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
			return verseWords.slice(startIndex, endIndex + 1).join(" ");
		}
		return null;
	}
}
