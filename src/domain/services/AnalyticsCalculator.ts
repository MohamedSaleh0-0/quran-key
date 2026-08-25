import type { Ayah } from "../entities/Ayah";

export interface AnalyticsResult {
	totalMatches: number;
	mostQuoted: { surahName: string; count: number; densityPercent: number } | null;
	densest: { surahName: string; densityPercent: number } | null;
}

/** Pure computation behind the search-modal analytics dashboard (FR-20):
 *  total match count, the surah quoted most (by raw count) with its
 *  density, and the surah with the highest density (matches / total
 *  words in that surah) — which need not be the same surah. */
export class AnalyticsCalculator {
	static compute(matches: readonly Ayah[], corpus: readonly Ayah[]): AnalyticsResult {
		if (matches.length === 0) {
			return { totalMatches: 0, mostQuoted: null, densest: null };
		}

		const surahCounts = new Map<number, number>();
		for (const a of matches) surahCounts.set(a.surahId, (surahCounts.get(a.surahId) ?? 0) + 1);

		const wordCountCache = new Map<number, number>();
		const wordsInSurah = (surahId: number): number => {
			let cached = wordCountCache.get(surahId);
			if (cached === undefined) {
				cached = corpus
					.filter((a) => a.surahId === surahId)
					.reduce((sum, a) => sum + a.text.split(/\s+/).length, 0);
				wordCountCache.set(surahId, cached);
			}
			return cached;
		};

		let maxSurahId: number | null = null;
		let maxCount = 0;
		let highestDensitySurahId: number | null = null;
		let highestDensity = 0;

		for (const [surahId, count] of surahCounts) {
			if (count > maxCount) {
				maxCount = count;
				maxSurahId = surahId;
			}
			const density = count / (wordsInSurah(surahId) || 1);
			if (density > highestDensity) {
				highestDensity = density;
				highestDensitySurahId = surahId;
			}
		}

		const nameOf = (surahId: number | null): string => corpus.find((a) => a.surahId === surahId)?.surahName ?? "";

		return {
			totalMatches: matches.length,
			mostQuoted:
				maxSurahId !== null
					? {
							surahName: nameOf(maxSurahId),
							count: maxCount,
							densityPercent: (maxCount / (wordsInSurah(maxSurahId) || 1)) * 100,
					  }
					: null,
			densest:
				highestDensitySurahId !== null
					? { surahName: nameOf(highestDensitySurahId), densityPercent: highestDensity * 100 }
					: null,
		};
	}
}
