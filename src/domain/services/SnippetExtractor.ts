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
		const patterns = searchWords.map((w) => PatternBuilder.makeMedialAlefsOptional(w));

		for (let i = 0; i <= normVerseWords.length - searchWords.length; i++) {
			let matched = true;
			for (let j = 0; j < searchWords.length; j++) {
				const rx = new RegExp(`^${patterns[j]}$`);
				if (!rx.test(normVerseWords[i + j])) {
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
	 *  existing wrapper glyphs / "(N)" markers before searching. */
	extractRange(fullVerse: string, startWord: string, endWord: string): string {
		if (!startWord || !endWord) return fullVerse;
		const cleanVerse = fullVerse
			.split(this.wrapperStart)
			.join("")
			.split(this.wrapperEnd)
			.join("")
			.replace(/\(\d+\)/g, "")
			.trim();
		const verseWords = cleanVerse.split(/\s+/);
		const normVerseWords = verseWords.map((w) => this.normalizer.normalizeForSearch(w));

		const startPattern = new RegExp(
			`^${PatternBuilder.makeMedialAlefsOptional(this.normalizer.normalizeForSearch(startWord))}$`
		);
		const endPattern = new RegExp(
			`^${PatternBuilder.makeMedialAlefsOptional(this.normalizer.normalizeForSearch(endWord))}$`
		);

		let startIndex = -1;
		let endIndex = -1;
		for (let i = 0; i < normVerseWords.length; i++) {
			if (startIndex === -1 && startPattern.test(normVerseWords[i])) startIndex = i;
			if (startIndex !== -1 && endPattern.test(normVerseWords[i])) {
				endIndex = i;
				break;
			}
		}
		if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
			return verseWords.slice(startIndex, endIndex + 1).join(" ");
		}
		return cleanVerse;
	}
}
