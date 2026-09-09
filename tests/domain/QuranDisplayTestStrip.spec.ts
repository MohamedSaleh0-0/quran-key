import { describe, expect, it } from "vitest";
import { buildQuranDisplayTestStrip } from "../../src/domain/services/QuranDisplayTestStrip";

describe("QuranDisplayTestStrip", () => {
	it("contains the compact set of typography-critical Quranic marks", () => {
		const strip = buildQuranDisplayTestStrip("tanzil-sequential", "end-symbol");
		for (const expected of ["﴿", "﴾", "رَٰعِنَا", "ٱلرَّحْمَـٰنِ", "ءَامَنُوا۟", "نُورٌ", "مَثَلًۭا", "كَافِرٍۭ", "أَلِيمٌۢ", "۞", "۩", "۝١٠٤"]) {
			expect(strip).toContain(expected);
		}
	});

	it("switches only the sequential-tanween and marker variants", () => {
		const canonical = buildQuranDisplayTestStrip("tanzil-canonical", "parenthesized");
		expect(canonical).toContain("مَثَلًا كَافِرٍ أَلِيمٌ");
		expect(canonical).toContain("(١٠٤)");
		expect(canonical).not.toContain("ۭ");
	});
});
