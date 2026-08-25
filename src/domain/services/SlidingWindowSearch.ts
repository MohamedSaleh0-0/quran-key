import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { PhraseMatcher } from "./PhraseMatcher";

export interface SlidingWindowMatch {
	/** The raw (un-normalized) text segment as it appears on the line. */
	segment: string;
	startWordIndex: number;
	wordCount: number;
	ayahs: Ayah[];
}

/**
 * Auto-detects an unmarked Qur'anic quote already typed on a line: masks
 * out anything already inside wrapper glyphs, then tries shrinking word
 * windows (maxWindowWords down to 2), longest match wins. v1 duplicated
 * this algorithm almost verbatim in two places (context analysis and the
 * extraction fallback) — consolidated to one implementation here, used by
 * both AnalyzeLineContext and ExtractAndInsertVerse.
 *
 * Performance: tests each candidate window against the pre-concatenated,
 * normalized corpus string first (cheap) before filtering the full ayah
 * array (expensive) — same optimization v1 used via its "giant string".
 */
export class SlidingWindowSearch {
	constructor(
		private readonly normalizer: ArabicNormalizer,
		private readonly phraseMatcher: PhraseMatcher,
		private readonly wrapperStart: string,
		private readonly wrapperEnd: string,
		private readonly maxWindowWords: number
	) {}

	private maskWrapped(line: string): string {
		const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const rx = new RegExp(`${escape(this.wrapperStart)}.*?${escape(this.wrapperEnd)}`, "g");
		return line.replace(rx, " ");
	}

	find(lineText: string, corpus: readonly Ayah[], searchCorpusText: string): SlidingWindowMatch | null {
		const maskedLine = this.maskWrapped(lineText);
		const rawWords = maskedLine.split(/\s+/).filter((w) => w.trim().length > 0);

		for (let len = Math.min(rawWords.length, this.maxWindowWords); len >= 2; len--) {
			for (let start = 0; start <= rawWords.length - len; start++) {
				const segment = rawWords.slice(start, start + len).join(" ");
				const pattern = this.phraseMatcher.buildPattern(segment);
				if (!pattern) continue;
				if (!pattern.test(searchCorpusText)) continue; // fast reject
				const matches = corpus.filter((a) => pattern.test(this.normalizer.normalizeForSearch(a.text)));
				if (matches.length > 0) {
					return { segment, startWordIndex: start, wordCount: len, ayahs: matches };
				}
			}
		}
		return null;
	}
}
