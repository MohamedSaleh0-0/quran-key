import { describe, expect, it } from "vitest";
import { ArabicNormalizer } from "../../src/domain/services/ArabicNormalizer";
import { SnippetExtractor } from "../../src/domain/services/SnippetExtractor";

describe("SnippetExtractor", () => {
	it("keeps the cited words as the extraction preview", () => {
		const extractor = new SnippetExtractor(new ArabicNormalizer([]), "﴿", "﴾");

		expect(
			extractor.extractSnippet(
				"يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا قِيلَ لَكُمْ تَفَسَّحُوا فِي الْمَجَالِسِ فَافْسَحُوا يَفْسَحِ اللَّهُ لَكُمْ وَإِذَا قِيلَ انشُزُوا فَانشُزُوا يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ",
				"يرفع الله الذين آمنوا منكم والذين أوتوا العلم درجات"
			)
		).toBe("يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ");
	});
});
