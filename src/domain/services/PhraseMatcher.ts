import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PatternBuilder } from "./PatternBuilder";

/** Exact, order-preserving phrase matching: query words must appear
 *  contiguously in an ayah's normalized text (token-boundary anchored).
 *  Backs direct query resolution (a selection or {query}), the
 *  sliding-window search (SlidingWindowSearch), and — since
 *  settings.searchStrategy defaults to "literal" — the live search modal
 *  too. Contrast with FuzzyMatcher, which is looser and is the other
 *  option for the live search modal.
 *
 *  `allowPrefixOnLastWord` exists specifically for that live-typing case:
 *  every word the user has already *finished* typing must still match
 *  exactly, but the word they're still in the middle of typing needs to
 *  match as a prefix ("الل" should already surface "الله") — otherwise
 *  live search shows nothing until each word is complete, which is what
 *  direct query resolution and SlidingWindowSearch (matching an already
 *  fully-written quote) actually want, but a suggestion list while
 *  typing does not. Arabic proclitics are ignored on every query word;
 *  this flag only relaxes the trailing boundary of the final word. */
export class PhraseMatcher {
	constructor(private readonly normalizer: ArabicNormalizer) {}

	buildPattern(query: string, allowPrefixOnLastWord = false): RegExp | null {
		const normWords = this.normalizer
			.normalizeForSearch(query)
			.split(/\s+/)
			.filter((w) => w.length > 0);
		if (normWords.length === 0) return null;
		return this.buildPatternFromWords(normWords, allowPrefixOnLastWord);
	}

	private buildPatternFromWords(normWords: readonly string[], allowPrefixOnLastWord: boolean): RegExp {
		// Search inside a normalized word so an unprefixed query such as
		// "شهور" also finds "الشهور", and "الله" finds attached forms such
		// as "والله" and "بالله". Each query word still has to occupy its
		// own corpus token; this only makes Arabic proclitics transparent.
		const body = normWords
			.map((word) => `[^\\s]*${PatternBuilder.makeArabicWordPattern(word)}`)
			.join("\\s+");
		const trailingBoundary = allowPrefixOnLastWord ? "" : "(?:\\s|$)";
		return new RegExp(`(?:^|\\s)${body}${trailingBoundary}`);
	}

	findMatches(query: string, corpus: readonly Ayah[], allowPrefixOnLastWord = false): Ayah[] {
		const canBePartial = allowPrefixOnLastWord && !/\s$/.test(query);
		const pattern = this.buildPattern(query, canBePartial);
		if (!pattern) return [];
		const matches = corpus.filter((a) => pattern.test(this.normalizer.normalizeForSearch(a.text)));
		if (!canBePartial) return matches;

		// Before a configured spelling rewrite can apply, compare the raw
		// prefix with Quran text normalized without those rewrites (for example
		// "الصلو" against the source spelling "الصَّلَوٰة").
		let rawPrefixMatches: Ayah[] = [];
		const rawPrefixWords = this.normalizer
			.normalizeForPrefixSearch(query)
			.split(/\s+/)
			.filter(Boolean);
		if (rawPrefixWords.length > 0) {
			const rawPrefixPattern = this.buildPatternFromWords(rawPrefixWords, true);
			rawPrefixMatches = corpus.filter((a) => rawPrefixPattern.test(this.normalizer.normalizeForPrefixSearch(a.text)));
		}
		const liveMatchIds = new Set([...matches, ...rawPrefixMatches].map((ayah) => ayah.id));
		const liveMatches = corpus.filter((ayah) => liveMatchIds.has(ayah.id));
		if (liveMatches.length > 0) return liveMatches;

		// Keep the completed phrase's candidates visible while an unfinished
		// last token passes through a spelling that does not normalize to its
		// Quranic form yet. A trailing space commits the token and disables
		// this fallback.
		const completedWords = query.trim().split(/\s+/).filter(Boolean).slice(0, -1);
		if (completedWords.length === 0) return matches;
		const normalizedCompletedWords = this.normalizer
			.normalizeForSearch(completedWords.join(" "))
			.split(/\s+/)
			.filter(Boolean);
		if (normalizedCompletedWords.length === 0) return matches;
		const completedPattern = this.buildPatternFromWords(normalizedCompletedWords, true);
		return corpus.filter((a) => completedPattern.test(this.normalizer.normalizeForSearch(a.text)));
	}
}

