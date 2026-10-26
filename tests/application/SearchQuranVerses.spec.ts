import { describe, expect, it } from "vitest";
import normalizationRules from "../../data/normalizationRules.json";
import type { Ayah } from "../../src/domain/entities/Ayah";
import type { QuranRepository } from "../../src/domain/ports/QuranRepository";
import { ArabicNormalizer } from "../../src/domain/services/ArabicNormalizer";
import { FuzzyMatcher } from "../../src/domain/services/FuzzyMatcher";
import { PhraseMatcher } from "../../src/domain/services/PhraseMatcher";
import { SearchQuranVerses } from "../../src/application/use-cases/SearchQuranVerses";

const normalizer = new ArabicNormalizer(
	(normalizationRules as Array<Record<string, unknown>>).map((rule) => ({
		pattern: String(rule.pattern),
		flags: String(rule.flags ?? "g"),
		replacement: String(rule.replacement),
		enabled: true,
	}))
);

function ayah(id: number, text: string): Ayah {
	return { id, surahId: 1, ayahId: id, surahName: "الفاتحة", text };
}

function repository(ayahs: readonly Ayah[]): QuranRepository {
	return {
		loadAll: async () => undefined,
		getAllAyahs: () => ayahs,
		getSearchCorpusText: () => ayahs.map((item) => normalizer.normalizeForSearch(item.text)).join(" "),
		findSurahByName: () => null,
		findAyah: () => null,
	};
}

describe("SearchQuranVerses", () => {
	it("matches an unprefixed word inside an Arabic token", () => {
		const matcher = new PhraseMatcher(normalizer);
		const result = matcher.findMatches("شهور", [ayah(1, "إن عدة الشهور عند الله")], true);

		expect(result).toHaveLength(1);
	});

	it("counts the complete match set while capping displayed matches", () => {
		const corpus = [
			ayah(1, "والله غفور رحيم"),
			ayah(2, "آمنوا بالله"),
			ayah(3, "قال الله"),
		];
		const search = new SearchQuranVerses(
			repository(corpus),
			new PhraseMatcher(normalizer),
			new FuzzyMatcher(normalizer),
			2,
			"literal"
		);

		const result = search.executeWithCount("الله");

		expect(result.matches).toHaveLength(2);
		expect(result.allMatches).toHaveLength(3);
		expect(result.totalMatches).toBe(3);
	});
});
