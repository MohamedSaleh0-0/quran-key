import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PatternBuilder } from "./PatternBuilder";

/** Exact, order-preserving phrase matching: query words must appear
 *  contiguously in an ayah's normalized text (word-boundary anchored).
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
 *  typing does not. Only the trailing boundary is affected: earlier
 *  words are already exact because they're pinned between `\s+`
 *  separators regardless of this flag. */
export class PhraseMatcher {
	constructor(private readonly normalizer: ArabicNormalizer) {}

	buildPattern(query: string, allowPrefixOnLastWord = false): RegExp | null {
		const normWords = this.normalizer
			.normalizeForSearch(query)
			.split(/\s+/)
			.filter((w) => w.length > 0);
		if (normWords.length === 0) return null;
		const body = normWords.map((w) => PatternBuilder.makeMedialAlefsOptional(w)).join("\\s+");
		const trailingBoundary = allowPrefixOnLastWord ? "" : "(?:\\s|$)";
		return new RegExp(`(?:^|\\s)${body}${trailingBoundary}`);
	}

	findMatches(query: string, corpus: readonly Ayah[], allowPrefixOnLastWord = false): Ayah[] {
		const pattern = this.buildPattern(query, allowPrefixOnLastWord);
		if (!pattern) return [];
		return corpus.filter((a) => pattern.test(this.normalizer.normalizeForSearch(a.text)));
	}
}

