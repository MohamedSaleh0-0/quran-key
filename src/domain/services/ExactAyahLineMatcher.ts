import type { Ayah } from "../entities/Ayah";
import { ArabicNormalizer } from "./ArabicNormalizer";

export interface ExactAyahLineMatch {
	ayah: Ayah;
	startCh: number;
	endCh: number;
	wordCount: number;
}

/** Finds a complete ayah inside a line while allowing non-Quran text after it
 * (for example: "بسم الله الرحمن الرحيم ابن كثير، الطبري"). The match must be
 * unique; short fragments are deliberately ignored so they do not trigger an
 * arbitrary ayah insertion. */
export class ExactAyahLineMatcher {
	constructor(private readonly normalizer: ArabicNormalizer) {}

	find(lineText: string, ayahs: readonly Ayah[]): ExactAyahLineMatch | null {
		const candidates = this.findCandidates(lineText, ayahs);
		const uniqueAyahIds = new Set(candidates.map((candidate) => candidate.ayah.id));
		if (uniqueAyahIds.size !== 1) return null;
		return candidates[0] ?? null;
	}

	findCandidates(lineText: string, ayahs: readonly Ayah[]): ExactAyahLineMatch[] {
		const prefix = lineText.match(/^(\s*(?:[-+*]|\d+[.)])\s+)/)?.[1] ?? "";
		const content = lineText.slice(prefix.length);
		const tokens = Array.from(content.matchAll(/\S+/gu)).map((match) => ({
			text: match[0],
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			normalized: this.normalizer.normalizeForSearch(match[0]),
		}));
		const lineWords = tokens.filter((token) => token.normalized.length > 0);
		if (lineWords.length === 0) return [];

		const candidates: ExactAyahLineMatch[] = [];
		for (const ayah of ayahs) {
			const ayahWords = this.normalizer
				.normalizeForSearch(ayah.text)
				.split(" ")
				.filter(Boolean);
			if (ayahWords.length === 0 || ayahWords.length > lineWords.length) continue;

			for (let start = 0; start <= lineWords.length - ayahWords.length; start++) {
				const matches = ayahWords.every((word, offset) => lineWords[start + offset].normalized === word);
				if (!matches) continue;
				candidates.push({
					ayah,
					startCh: prefix.length + lineWords[start].start,
					endCh: prefix.length + lineWords[start + ayahWords.length - 1].end,
					wordCount: ayahWords.length,
				});
			}
		}

		return candidates;
	}
}
