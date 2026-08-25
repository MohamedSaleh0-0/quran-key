import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PatternBuilder } from "./PatternBuilder";

/** Looser than PhraseMatcher: every query word must appear *somewhere* in
 *  an ayah's normalized text, in any order/position — surfaces partial or
 *  reordered recollections of a verse. Powers the live search-modal
 *  suggestions (FR-16/17). */
export class FuzzyMatcher {
	constructor(private readonly normalizer: ArabicNormalizer) {}

	findMatches(query: string, corpus: readonly Ayah[], limit: number): Ayah[] {
		const words = this.normalizer
			.normalizeForSearch(query)
			.split(/\s+/)
			.filter((w) => w.length > 0);
		if (words.length === 0) return [];
		const regexes = words.map((w) => new RegExp(PatternBuilder.makeMedialAlefsOptional(w)));
		const out: Ayah[] = [];
		for (const a of corpus) {
			const normText = this.normalizer.normalizeForSearch(a.text);
			if (regexes.every((rx) => rx.test(normText))) {
				out.push(a);
				if (out.length >= limit) break;
			}
		}
		return out;
	}
}
