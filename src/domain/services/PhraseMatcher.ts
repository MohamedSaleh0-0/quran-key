import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PatternBuilder } from "./PatternBuilder";

/** Exact, order-preserving phrase matching: query words must appear
 *  contiguously in an ayah's normalized text (word-boundary anchored).
 *  Backs direct query resolution (a selection or {query}) and the
 *  sliding-window search (SlidingWindowSearch). Contrast with
 *  FuzzyMatcher, which is looser and backs the live search modal. */
export class PhraseMatcher {
	constructor(private readonly normalizer: ArabicNormalizer) {}

	buildPattern(query: string): RegExp | null {
		const normWords = this.normalizer
			.normalizeForSearch(query)
			.split(/\s+/)
			.filter((w) => w.length > 0);
		if (normWords.length === 0) return null;
		const body = normWords.map((w) => PatternBuilder.makeMedialAlefsOptional(w)).join("\\s+");
		return new RegExp(`(?:^|\\s)${body}(?:\\s|$)`);
	}

	findMatches(query: string, corpus: readonly Ayah[]): Ayah[] {
		const pattern = this.buildPattern(query);
		if (!pattern) return [];
		return corpus.filter((a) => pattern.test(this.normalizer.normalizeForSearch(a.text)));
	}
}
