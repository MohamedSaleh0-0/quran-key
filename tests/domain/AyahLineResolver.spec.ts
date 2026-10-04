import { describe, expect, it } from "vitest";
import type { Ayah } from "../../src/domain/entities/Ayah";
import { ArabicNormalizer } from "../../src/domain/services/ArabicNormalizer";
import { AyahLineResolver } from "../../src/domain/services/AyahLineResolver";
import { PhraseMatcher } from "../../src/domain/services/PhraseMatcher";
import { SlidingWindowSearch } from "../../src/domain/services/SlidingWindowSearch";

const normalizer = new ArabicNormalizer([]);
const phraseMatcher = new PhraseMatcher(normalizer);
const slidingWindow = new SlidingWindowSearch(normalizer, phraseMatcher, "﴿", "﴾", 12);
const resolver = new AyahLineResolver(normalizer, slidingWindow);

const ayah = (id: number, text: string): Ayah => ({
	id,
	surahId: id === 1 ? 1 : 2,
	ayahId: id,
	surahName: id === 1 ? "الفاتحة" : "البقرة",
	text,
});

describe("AyahLineResolver", () => {
	it("finds a complete ayah before trailing tafsir-book names", () => {
		const basmala = ayah(1, "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ");
		const line = "بسم الله الرحمن الرحيم ابن كثير، الطبري";
		const result = resolver.find(line, [basmala], normalizer.normalizeForSearch(basmala.text));

		expect(result?.ayah.id).toBe(1);
		expect(line.slice(result!.startCh, result!.endCh)).toBe("بسم الله الرحمن الرحيم");
	});

	it("expands a unique partial quote to the complete ayah", () => {
		const ayatAlKursi = ayah(
			1,
			"اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ لَهُ مَا فِي السَّمَاوَاتِ"
		);
		const line = "لا تأخذه سنة ولا نوم";
		const result = resolver.find(line, [ayatAlKursi], normalizer.normalizeForSearch(ayatAlKursi.text));

		expect(result?.ayah.id).toBe(1);
		expect(result?.query).toBe(line);
	});

	it("ranks the longer contextual ayah above a shorter ayah embedded inside it", () => {
		const fatiha = ayah(1, "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ");
		const naml = ayah(2, "إِنَّهُۥ مِن سُلَيْمَـٰنَ وَإِنَّهُۥ بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ");
		const line = "إنه من سليمان وإنه بسم الله الرحمن الرحيم";
		const resolution = resolver.resolve(
			line,
			[fatiha, naml],
			`${normalizer.normalizeForSearch(fatiha.text)} ${normalizer.normalizeForSearch(naml.text)}`
		);

		expect(resolution.match).toBeNull();
		expect(resolution.ambiguous?.ayahs.map((item) => item.id)).toEqual([2, 1]);
		expect(resolution.ambiguous?.query).toBe(line);
	});

	it("rejects an ambiguous partial quote", () => {
		const first = ayah(1, "إِنَّ اللَّهُ غَفُورٌ رَحِيمٌ");
		const second = ayah(2, "وَإِنَّ اللَّهُ غَفُورٌ رَحِيمٌ");
		const result = resolver.find(
			"الله غفور رحيم",
			[first, second],
			`${normalizer.normalizeForSearch(first.text)} ${normalizer.normalizeForSearch(second.text)}`
		);

		expect(result).toBeNull();
	});
});
