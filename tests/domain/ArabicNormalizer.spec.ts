import { describe, expect, it } from "vitest";
import { ArabicNormalizer } from "../../src/domain/services/ArabicNormalizer";
import normalizationRules from "../../data/normalizationRules.json";

const defaultRules = (normalizationRules as Array<Record<string, unknown>>).map((r) => ({
	pattern: String(r.pattern),
	flags: String(r.flags ?? "g"),
	replacement: String(r.replacement),
	enabled: true,
}));

const normalizer = new ArabicNormalizer(defaultRules);

describe("ArabicNormalizer", () => {
	it("strips tashkeel", () => {
		expect(normalizer.stripTashkeel("\u0628ِ\u0633ْ\u0645ِ")).toBe("\u0628\u0633\u0645");
	});

	it("unifies hamza forms onto a bare alef", () => {
		expect(normalizer.normalizeForSearch("\u0623\u062D\u062F")).toBe(normalizer.normalizeForSearch("\u0627\u062D\u062F"));
		expect(normalizer.normalizeForSearch("\u0625\u062D\u062F")).toBe(normalizer.normalizeForSearch("\u0627\u062D\u062F"));
	});

	it("applies the configured short-alef substitution rules (data-driven, NFR-2)", () => {
		expect(normalizer.normalizeForSearch("\u0627\u0644\u0635\u0644\u0648\u0629")).toBe(
			normalizer.normalizeForSearch("\u0627\u0644\u0635\u0644\u0627\u0629")
		);
	});

	it("collapses repeated whitespace", () => {
		expect(normalizer.normalizeForSearch("\u0642\u0627\u0644    \u0627\u0644\u0644\u0647")).not.toMatch(/\s{2,}/);
	});

	it("ignores a rule when disabled — the customizability seam (NFR-2)", () => {
		const disabled = new ArabicNormalizer([
			{ pattern: "\u0635\u0644\u0648\u0629", flags: "g", replacement: "\u0635\u0644\u0627\u0629", enabled: false },
		]);
		expect(disabled.normalizeForSearch("\u0635\u0644\u0648\u0629")).not.toBe(disabled.normalizeForSearch("\u0635\u0644\u0627\u0629"));
	});

	it("normalizes Arabic-Indic and Persian digits to Western digits", () => {
		expect(ArabicNormalizer.normalizeNumbers("\u0662\u0665\u0665")).toBe("255");
		expect(ArabicNormalizer.normalizeNumbers("\u06F2\u06F5\u06F5")).toBe("255");
	});
});
