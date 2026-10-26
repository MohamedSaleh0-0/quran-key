import { describe, expect, it } from "vitest";
import normalizationRules from "../../data/normalizationRules.json";
import type { Ayah } from "../../src/domain/entities/Ayah";
import { ArabicNormalizer } from "../../src/domain/services/ArabicNormalizer";
import { RootSearchIndex, type RootIndexData } from "../../src/domain/services/RootSearchIndex";

const normalizer = new ArabicNormalizer(
	(normalizationRules as Array<Record<string, unknown>>).map((rule) => ({
		pattern: String(rule.pattern),
		flags: String(rule.flags ?? "g"),
		replacement: String(rule.replacement),
		enabled: true,
	}))
);

function ayah(id: number, text: string): Ayah {
	return { id, surahId: 9, ayahId: id, surahName: "التوبة", text };
}

const indexData: RootIndexData = {
	version: "test",
	source: "test",
	license: "test",
	wordIndexBase: 1,
	ayahWords: {
		"9:1": [
			{ form: "الشهور", roots: ["شهر"], lemmas: ["شهر"] },
			{ form: "الله", roots: ["اله"], lemmas: ["الله"] },
		],
		"9:2": [{ form: "شهر", roots: ["شهر"], lemmas: ["شهر"] }],
		"9:3": [{ form: "الله", roots: ["اله"], lemmas: ["الله"] }],
	},
	termRoots: {
		شهور: ["شهر"],
		شهر: ["شهر"],
		الله: ["اله"],
	},
};

describe("RootSearchIndex", () => {
	it("resolves a surface word to its Quranic root", () => {
		const index = new RootSearchIndex(indexData, normalizer);
		const matches = index.findMatches("شهور", [ayah(1, "إن عدة الشهور عند الله")]);

		expect(matches).toHaveLength(1);
		expect(index.getMatchingForms(matches[0], "شهور")).toEqual(new Set(["الشهور"]));
	});

	it("supports multiple query words with AND semantics", () => {
		const index = new RootSearchIndex(indexData, normalizer);
		const corpus = [
			ayah(1, "إن عدة الشهور عند الله"),
			ayah(2, "شهر"),
			ayah(3, "الله"),
		];

		expect(index.findMatches("شهور الله", corpus).map((item) => item.ayahId)).toEqual([1]);
	});

	it("returns no matches when one of several terms is unknown", () => {
		const index = new RootSearchIndex(indexData, normalizer);

		expect(index.findMatches("شهور غيرمعروفة", [ayah(1, "إن عدة الشهور عند الله")])).toEqual([]);
	});
});
