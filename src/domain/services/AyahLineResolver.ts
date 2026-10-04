import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";
import { ExactAyahLineMatcher } from "./ExactAyahLineMatcher";
import { SlidingWindowSearch } from "./SlidingWindowSearch";

export interface AyahLineMatch {
	ayah: Ayah;
	startCh: number;
	endCh: number;
	query: string;
	wordCount: number;
}

export interface AmbiguousAyahLineMatch {
	query: string;
	startCh: number;
	endCh: number;
	ayahs: Ayah[];
}

export interface AyahLineResolution {
	match: AyahLineMatch | null;
	ambiguous: AmbiguousAyahLineMatch | null;
}

/** Resolves ayahs already present in an editor line. It collects complete
 * ayahs and sliding-window candidates, ranks the longest contextual match
 * first, and exposes the rest as override choices when ambiguous. */
export class AyahLineResolver {
	private readonly exactMatcher: ExactAyahLineMatcher;

	constructor(
		normalizer: ArabicNormalizer,
		private readonly slidingWindow: SlidingWindowSearch
	) {
		this.exactMatcher = new ExactAyahLineMatcher(normalizer);
	}

	find(lineText: string, ayahs: readonly Ayah[], searchCorpusText: string): AyahLineMatch | null {
		return this.resolve(lineText, ayahs, searchCorpusText).match;
	}

	resolve(lineText: string, ayahs: readonly Ayah[], searchCorpusText: string): AyahLineResolution {
		const exactCandidates = this.exactMatcher.findCandidates(lineText, ayahs);
		const candidates = new Map<number, AyahLineMatch>();
		for (const exact of exactCandidates) {
			candidates.set(exact.ayah.id, {
				ayah: exact.ayah,
				startCh: exact.startCh,
				endCh: exact.endCh,
				query: lineText.slice(exact.startCh, exact.endCh),
				wordCount: exact.wordCount,
			});
		}

		const listPrefix = lineText.match(/^\s*(?:[-+*]|\d+[.)])\s+/)?.[0] ?? "";
		const searchText = listPrefix ? lineText.slice(listPrefix.length) : lineText;
		const sliding = this.slidingWindow.find(searchText, ayahs, searchCorpusText);
		if (!sliding) {
			return this.finishResolution(candidates);
		}

		const startCh = lineText.indexOf(sliding.segment, listPrefix.length);
		if (startCh === -1) return this.finishResolution(candidates);
		for (const ayah of sliding.ayahs) {
			const existing = candidates.get(ayah.id);
			if (!existing || existing.wordCount < sliding.wordCount) {
				candidates.set(ayah.id, {
					ayah,
					startCh,
					endCh: startCh + sliding.segment.length,
					query: sliding.segment,
					wordCount: sliding.wordCount,
				});
			}
		}

		return this.finishResolution(candidates);
	}

	private finishResolution(candidates: Map<number, AyahLineMatch>): AyahLineResolution {
		const ranked = Array.from(candidates.values()).sort((a, b) => {
			if (b.wordCount !== a.wordCount) return b.wordCount - a.wordCount;
			return a.ayah.id - b.ayah.id;
		});
		const best = ranked[0];
		if (!best) return { match: null, ambiguous: null };
		if (ranked.length > 1) {
			return {
				match: null,
				ambiguous: {
					query: best.query,
					startCh: best.startCh,
					endCh: best.endCh,
					ayahs: ranked.map((candidate) => candidate.ayah),
				},
			};
		}
		return {
			match: {
				ayah: best.ayah,
				startCh: best.startCh,
				endCh: best.endCh,
				query: best.query,
				wordCount: best.wordCount,
			},
			ambiguous: null,
		};
	}
}
