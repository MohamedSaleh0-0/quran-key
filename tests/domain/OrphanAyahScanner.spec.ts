import { describe, expect, it } from "vitest";
import type { Ayah } from "../../src/domain/entities/Ayah";
import { ArabicNormalizer } from "../../src/domain/services/ArabicNormalizer";
import { OrphanAyahScanner } from "../../src/domain/services/OrphanAyahScanner";
import { VerseReference } from "../../src/domain/value-objects/VerseReference";

const ayah: Ayah = {
	id: 1,
	surahId: 1,
	ayahId: 1,
	surahName: "الفاتحة",
	text: "بسم الله الرحمن الرحيم",
};

function scanner() {
	return new OrphanAyahScanner();
}

function options() {
	return {
		wrapperStart: "﴿",
		wrapperEnd: "﴾",
		ayahMarkerStyle: "plain" as const,
		reference: VerseReference.compile("[{surah}:{verse}]"),
		normalizer: new ArabicNormalizer([]),
		ayahs: [ayah],
	};
}

describe("OrphanAyahScanner", () => {
	it("resolves the marker from the adjacent reference without scanning the reference separately", () => {
		const source = "﴿ بسم الله الرحمن الرحيم (1) ﴾ [الفاتحة:1]";
		const result = scanner().scan(source, options());

		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0].status).toBe("orphan");
		expect(result.candidates[0].ayah?.surahId).toBe(1);
		expect(result.candidates[0].ayah?.ayahId).toBe(1);
	});

	it("does not classify an already linked marker as orphan", () => {
		const source = "﴿ بسم الله الرحمن الرحيم [[بسم الله الرحمن الرحيم (1)|(1)]] ﴾ [الفاتحة:1]";
		const result = scanner().scan(source, options());

		expect(result.candidates.some((candidate) => candidate.status === "orphan")).toBe(false);
		expect(result.candidates.some((candidate) => candidate.status === "linked")).toBe(true);
	});

	it("matches a copied ayah when no explicit reference is present", () => {
		const source = "﴿ بسم الله الرحمن الرحيم (1) ﴾";
		const result = scanner().scan(source, options());

		expect(result.candidates[0].status).toBe("orphan");
		expect(result.candidates[0].ayah?.surahName).toBe("الفاتحة");
	});

	it("detects a full ayah inside ornate brackets even without a number", () => {
		const source = "﴿ بسم الله الرحمن الرحيم ﴾";
		const result = scanner().scan(source, options());

		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0].status).toBe("orphan");
		expect(result.candidates[0].marker).toBe("١");
		expect(result.candidates[0].markerStart).toBe(result.candidates[0].markerEnd);
	});

	it("detects a partial ayah with or without a visible number", () => {
		const withoutNumber = scanner().scan("﴿ الرحمن الرحيم ﴾", options());
		const withNumber = scanner().scan("﴿ الرحمن الرحيم (1) ﴾", options());

		expect(withoutNumber.candidates[0].status).toBe("orphan");
		expect(withoutNumber.candidates[0].ayah?.ayahId).toBe(1);
		expect(withNumber.candidates[0].status).toBe("orphan");
		expect(withNumber.candidates[0].ayah?.ayahId).toBe(1);
	});

	it("keeps all matching ayahs while choosing the first corpus match by default", () => {
		const similar: Ayah = {
			id: 2,
			surahId: 2,
			ayahId: 1,
			surahName: "البقرة",
			text: "الرحمن الرحيم نور على نور",
		};
		const result = scanner().scan("﴿ الرحمن الرحيم ﴾", { ...options(), ayahs: [ayah, similar] });

		expect(result.candidates[0].ayah?.id).toBe(1);
		expect(result.candidates[0].alternatives.map((item) => item.id)).toEqual([1, 2]);
	});

	it("uses a nearby reference to resolve a partial quote without requiring the text to be complete", () => {
		const source = "﴿ الرحمن ﴾ [الفاتحة:1]";
		const result = scanner().scan(source, options());

		expect(result.candidates[0].status).toBe("orphan");
		expect(result.candidates[0].ayah?.ayahId).toBe(1);
	});
});
